// tests/peers.test.js — peer gossip (ADR-0022).
//
// Spawns **two** vcm-servers (peer A on 7398, peer B on 7399).
// Seeds one project into B's DB directly. Asserts A can pull B's
// summary and merge it into its leaderboard view.
//
// Port allocation: 7398/7399 sit just below 7400 (where other tests
// have their lowest port), avoiding conflicts with the 7400–7490
// pool that vitest uses for the standard test files.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT_A = 7398;
const PORT_B = 7399;
let serverA, serverB, tmpDir, peersPath;

async function waitReady(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`port ${port} not ready`);
}

function spawnServer(port, db, peerFile = null) {
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  const env = {
    ...process.env, VCM_SERVER_PORT: String(port),
    VCM_SERVER_DB: db, VCM_AUDIT_LOG: join(tmpDir, `${port}.log`),
  };
  if (peerFile) env.VCM_PEERS = peerFile;
  return spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function seedProject(port, name, gov, git) {
  // Insert a project + state row directly into SQLite, bypassing /api/collect.
  // Booleans in `gov`/`git` are JSON.stringify'd by JS — Python expects
  // True/False capitalised, so we patch them into the JSON literal in Python.
  const govJson = JSON.stringify(gov);
  const gitJson = JSON.stringify(git);
  const pyGov = govJson.replace(/true/g, 'True')
                       .replace(/false/g, 'False')
                       .replace(/null/g, 'None');
  const pyGit = gitJson.replace(/true/g, 'True')
                       .replace(/false/g, 'False')
                       .replace(/null/g, 'None');
  const cmd = [
    'import sqlite3, json, os',
    'from datetime import datetime, timezone',
    'db = os.environ.get("VCM_SERVER_DB") or ""',
    'name = ' + JSON.stringify(name),
    'gov_py = json.loads(' + JSON.stringify(pyGov) + ')',
    'git_py = json.loads(' + JSON.stringify(pyGit) + ')',
    'conn = sqlite3.connect(db)',
    'now = datetime.now(timezone.utc).isoformat()',
    'existing = conn.execute("SELECT id FROM projects WHERE name=?", (name,)).fetchone()',
    'if existing:',
    '    pid = existing[0]',
    '    conn.execute("UPDATE projects SET last_seen_at=? WHERE id=?", (now, pid))',
    'else:',
    '    cur = conn.execute("INSERT INTO projects (name, path, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)", (name, "/tmp/" + name, now, now))',
    '    pid = cur.lastrowid',
    'raw = json.dumps({"governance": gov_py, "git": git_py})',
    'conn.execute("INSERT INTO states (project_id, schema_version, generated_at, vcm_version, raw_json, received_at) VALUES (?, ?, ?, ?, ?, ?)", (pid, "1", now, "0.10.0", raw, now))',
    'conn.commit(); conn.close()',
  ].join('\n');
  const r = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', cmd],
    { encoding: 'utf8',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, String(port) + '.db') } });
  if (r.status !== 0) throw new Error('seed failed: ' + r.stderr + r.stdout);
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-peers-'));
  peersPath = join(tmpDir, 'peers.json');
  writeFileSync(peersPath, JSON.stringify({
    peers: [{ name: 'B', url: `http://127.0.0.1:${PORT_B}` }],
  }));
  serverB = spawnServer(PORT_B, join(tmpDir, `${PORT_B}.db`));
  serverB.stderr.on('data', () => {});
  await waitReady(PORT_B);
  serverA = spawnServer(PORT_A, join(tmpDir, `${PORT_A}.db`), peersPath);
  serverA.stderr.on('data', () => {});
  await waitReady(PORT_A);
}, 30000);

afterAll(() => {
  if (serverA) serverA.kill();
  if (serverB) serverB.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Reset B's projects + A's in-memory peer cache between tests.
  spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3
conn = sqlite3.connect('${join(tmpDir, PORT_B + '.db')}')
conn.executescript('DELETE FROM projects; DELETE FROM states;')
conn.commit(); conn.close()`],
    { encoding: 'utf8',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, PORT_B + '.db') } });
  if (serverA) serverA.kill();
  serverA = spawnServer(PORT_A, join(tmpDir, `${PORT_A}.db`), peersPath);
  serverA.stderr.on('data', () => {});
  await waitReady(PORT_A);
});

describe('peer registry (ADR-0022)', () => {
  it('A: /api/peer/summary lists configured peer B', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT_A}/api/peer/summary`);
    const j = await r.json();
    expect(j.config).toContainEqual({ name: 'B', url: `http://127.0.0.1:${PORT_B}` });
  });

  it('A: refresh=1 pulls B\'s local summary', async () => {
    seedProject(PORT_B, 'beta', {
      agents_md_present: true, charter_md_present: true,
      adrs_count: 5, skills_count: 3,
    }, { branch: 'main', dirty: false });

    const r = await fetch(`http://127.0.0.1:${PORT_A}/api/peer/summary?refresh=1`);
    const j = await r.json();
    expect(j.peers.length).toBe(1);
    expect(j.peers[0].status).toBe('ok');
    expect(j.peers[0].summary.peer).toBe('self');
    const projs = j.peers[0].summary.projects;
    expect(projs.map(p => p.name)).toContain('beta');
  });

  it('A: leaderboard?scope=all merges B\'s projects with origin tag', async () => {
    seedProject(PORT_B, 'gamma', {
      agents_md_present: false, charter_md_present: false,
      adrs_count: 0, skills_count: 0,
    }, { branch: 'main', dirty: true });

    const r = await fetch(`http://127.0.0.1:${PORT_A}/api/dashboard/leaderboard?scope=all&refresh=1`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.peer_count).toBeGreaterThanOrEqual(1);
    // gamma is the only project — must be tagged with origin B.
    const gamma = j.rows.find(row => row.name === 'gamma');
    expect(gamma).toBeDefined();
    expect(gamma.origin).toBe('B');
    expect(gamma.drift_score).toBeGreaterThanOrEqual(50);
  });

  it('unreachable peer fails gracefully with empty rows', async () => {
    // Spawn server C on a port that nobody is bound to (7890 is unused).
    const peersPath2 = join(tmpDir, 'peers-bad.json');
    writeFileSync(peersPath2, JSON.stringify({
      peers: [{ name: 'ZOMBIE', url: 'http://127.0.0.1:7890' }],
    }));
    // Re-spawn A with a bad peer.
    if (serverA) serverA.kill();
    serverA = spawnServer(PORT_A, join(tmpDir, `${PORT_A}.db`), peersPath2);
    serverA.stderr.on('data', () => {});
    await waitReady(PORT_A);

    const r = await fetch(`http://127.0.0.1:${PORT_A}/api/peer/summary?refresh=1`);
    const j = await r.json();
    expect(j.peers.length).toBe(1);
    expect(j.peers[0].status).toBe('unreachable');
    expect(j.peers[0].summary).toEqual({});  // empty summary preserved
  });

  it('POST /api/peer/summary accepts and caches inbound gossip', async () => {
    const body = {
      peer: 'X',
      fetched_at: '2026-08-21T00:00:00Z',
      projects: [{ name: 'x-proj', drift_score: 50, adrs_count: 0 }],
    };
    const r = await fetch(`http://127.0.0.1:${PORT_B}/api/peer/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ack).toBe(true);

    // Verify the cache shows the inbound.
    const r2 = await fetch(`http://127.0.0.1:${PORT_B}/api/peer/summary`);
    const j2 = await r2.json();
    expect(j2.peers.map(p => p.peer)).toContain('X');
  });

  it('GET /api/peer/summary/local returns this server\'s drift', async () => {
    seedProject(PORT_B, 'delta', {
      agents_md_present: true, charter_md_present: false,
      adrs_count: 2, skills_count: 1,
    }, { branch: 'main', dirty: false });

    const r = await fetch(`http://127.0.0.1:${PORT_B}/api/peer/summary/local`);
    const j = await r.json();
    expect(j.peer).toBe('self');
    expect(j.projects.length).toBeGreaterThanOrEqual(1);
    const delta = j.projects.find(p => p.name === 'delta');
    expect(delta).toBeDefined();
    expect(delta.drift_score).toBeGreaterThanOrEqual(15);  // missing CHARTER + ADR<3
  });
});

describe('cross-server skill marketplace (ADR-0023)', () => {
  it('B: /api/peer/registry returns its own skills list', async () => {
    // Seed a synthetic skill on B by writing to VCM_REGISTRY_DIR.
    const regDir = join(tmpDir, `reg-${PORT_B}`);
    mkdirSync(regDir, { recursive: true });
    writeFileSync(join(regDir, 'foo-skill.json'), JSON.stringify({
      name: 'foo-skill',
      description: 'A test skill from peer B',
      tags: ['test'],
      authority: 'B',
      stewardship: { validation_count: 5 },
    }));

    // Spawn a server B pointed at this registry, then ask for it.
    if (serverB) serverB.kill();
    serverB = spawn(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['server/app.py'], {
      cwd: VCM_ROOT,
      env: { ...process.env, VCM_SERVER_PORT: String(PORT_B),
             VCM_SERVER_DB: join(tmpDir, `${PORT_B}-reg.db`),
             VCM_AUDIT_LOG: join(tmpDir, `${PORT_B}-reg.log`),
             VCM_REGISTRY_DIR: regDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    serverB.stderr.on('data', () => {});
    await waitReady(PORT_B);

    const r = await fetch(`http://127.0.0.1:${PORT_B}/api/peer/registry`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.peer).toBe('self');
    expect(j.skills.map(s => s.name)).toContain('foo-skill');
    expect(j.skills[0].origin).toBeUndefined();  // local-only field
  });

  it('A: scope=all merges B\'s registry with origin tag', async () => {
    // A has no local registry — only merged from B.
    // v0.18.4 fix-up: server.py flipped the default to scope='all' (was
    // 'local' before — see ADR-0023 'cross-server skill marketplace').
    // That makes the query-string optional on the test side too, which
    // sidesteps the GitHub Actions Node-22-fetch-drops-query-string
    // bug entirely. We still pass scope=all in the URL for clarity.
    const target = new URL(`/api/registry/skills`, `http://127.0.0.1:${PORT_A}`);
    target.searchParams.set('scope', 'all');
    const r = await fetch(target);
    expect(r.status).toBe(200);
    const j = await r.json();
    if (j.scope !== 'all') {
      throw new Error(
        `expected scope='all' but got ${JSON.stringify(j).slice(0, 500)}; ` +
        `url=${target} status=${r.status} headers=${JSON.stringify([...r.headers])}`
      );
    }
    expect(j.peer_count).toBeGreaterThanOrEqual(1);
    const foo = j.skills.find(s => s.name === 'foo-skill');
    expect(foo).toBeDefined();
    expect(foo.origin).toBe('B');
  });

  it('local skill wins on name conflict (CHARTER §7)', async () => {
    // A publishes a local skill with the same name as B's.
    const regDirA = join(tmpDir, `reg-${PORT_A}`);
    mkdirSync(regDirA, { recursive: true });
    writeFileSync(join(regDirA, 'foo-skill.json'), JSON.stringify({
      name: 'foo-skill',
      description: 'A\'s authoritative version',
      authority: 'A',
      stewardship: { validation_count: 99 },  // higher than B's 5
    }));
    if (serverA) serverA.kill();
    serverA = spawnServer(PORT_A, join(tmpDir, `${PORT_A}-reg.db`), peersPath);
    // Note: spawnServer doesn't accept VCM_REGISTRY_DIR. Re-spawn manually.
    serverA.kill();
    serverA = spawn(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['server/app.py'], {
      cwd: VCM_ROOT,
      env: { ...process.env, VCM_SERVER_PORT: String(PORT_A),
             VCM_SERVER_DB: join(tmpDir, `${PORT_A}-reg.db`),
             VCM_AUDIT_LOG: join(tmpDir, `${PORT_A}-reg.log`),
             VCM_REGISTRY_DIR: regDirA,
             VCM_PEERS: peersPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    serverA.stderr.on('data', () => {});
    await waitReady(PORT_A);

    const r = await fetch(`http://127.0.0.1:${PORT_A}/api/registry/skills?scope=all`);
    const j = await r.json();
    const fooMatches = j.skills.filter(s => s.name === 'foo-skill');
    expect(fooMatches.length).toBe(1);
    expect(fooMatches[0].origin).toBe('local');
    expect(fooMatches[0].description).toContain('authoritative');
  });
});
