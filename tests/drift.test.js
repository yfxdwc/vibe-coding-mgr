// tests/drift.test.js — /api/dashboard/drift + /drift view (ADR-0019).
//
// Combines:
//   1. Unit-level score formula tests via Python dashboard module
//      (no Flask, no DB).
//   2. Integration tests for /api/dashboard/drift and /drift view by
//      seeding project + state rows directly into SQLite.
//
// Port 7490 is unique within the 7480–7490 allocation (HANDOFF §13.1).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7490;
let server, tmpDir;

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server not ready');
}

// Unit test: invoke dashboard._drift_score with a project dict and a
// fixed `now` so the staleness contribution is reproducible.
function scoreProject(proj, nowIso) {
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', [
      'import sys, json',
      'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
      'from dashboard import _drift_score',
      'proj = json.loads(sys.stdin.readline())',
      'now_iso = json.loads(sys.stdin.readline())',
      'from datetime import datetime, timezone',
      'now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))',
      'score, missing, recs, days_idle = _drift_score(proj, now=now)',
      'print(json.dumps({"score": score, "missing": missing, "recs": recs, "days_idle": days_idle}))',
    ].join('\n')],
    { input: JSON.stringify(proj) + '\n' + JSON.stringify(nowIso) + '\n',
      encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error('drift score failed: ' + r.stderr);
  return JSON.parse(r.stdout.trim());
}

const DB = () => join(tmpDir, 's.db');

// Reset the DB between tests so drift counts are reproducible.
function resetDb() {
  // The server owns the schema; beforeAll boots it, so by the time
  // beforeEach fires, the tables exist. We tolerate early resets by
  // wrapping DELETE in try/except (sqlite allows per-table failure).
  const r = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3
conn = sqlite3.connect('${DB()}')
for tbl in ('projects','states','skill_uses','skills','audit_events','users','tokens'):
    try:
        conn.execute(f'DELETE FROM {tbl}')
    except sqlite3.OperationalError:
        pass
conn.commit(); conn.close()`],
    { encoding: 'utf8',
      env: { ...process.env, VCM_SERVER_DB: DB() } });
  if (r.status !== 0) throw new Error('reset failed: ' + r.stderr);
}

// Insert a project + state row. `state` is the raw JSON that goes into
// the states table; we synthesise project from its name.
function seedProject(name, state, lastSeenAt) {
  const r = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3, json
from datetime import datetime, timezone
db = '${DB()}'
conn = sqlite3.connect(db)
now = '${lastSeenAt}'
# Upsert project
existing = conn.execute('SELECT id FROM projects WHERE name=?', ('${name}',)).fetchone()
if existing:
    pid = existing['id']
    conn.execute('UPDATE projects SET last_seen_at=? WHERE id=?', (now, pid))
else:
    cur = conn.execute("INSERT INTO projects (name, path, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
                       ('${name}', '/tmp/${name}', now, now))
    pid = cur.lastrowid
conn.execute("""INSERT INTO states
  (project_id, schema_version, generated_at, vcm_version, raw_json, received_at)
  VALUES (?, ?, ?, ?, ?, ?)""",
  (pid, '1', now, '0.9.0', ${JSON.stringify(JSON.stringify(state))}, now))
conn.commit(); conn.close()`],
    { encoding: 'utf8',
      env: { ...process.env, VCM_SERVER_DB: DB() } });
  if (r.status !== 0) throw new Error('seed failed: ' + r.stderr);
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-drift-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_AUDIT_LOG: join(tmpDir, 'audit.log') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[srv] ' + d.toString()));
  server.stdout.on('data', (d) => process.stdout.write('[out] ' + d.toString()));
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => { resetDb(); });

describe('ADR-0019 drift scoring (unit)', () => {
  const NOW = '2026-08-21T00:00:00Z';

  it('score 0 when all governance flags present and recent', () => {
    const r = scoreProject({
      agents_md_present: true,
      charter_md_present: true,
      adrs_count: 5,
      skills_count: 3,
      git_dirty: false,
      last_seen_at: NOW,
    }, NOW);
    expect(r.score).toBe(0);
    expect(r.missing).toEqual([]);
    expect(r.days_idle).toBe(0);
  });

  it('missing AGENTS.md is the largest single weight (25)', () => {
    const r = scoreProject({
      agents_md_present: false,
      charter_md_present: true,
      adrs_count: 5,
      skills_count: 3,
      git_dirty: false,
      last_seen_at: NOW,
    }, NOW);
    expect(r.score).toBe(25);
    expect(r.missing).toContain('AGENTS.md');
  });

  it('missing AGENTS + CHARTER + ADRs < 3 + 0 skills = 25 + 20 + 15 + 10 = 70', () => {
    const r = scoreProject({
      agents_md_present: false,
      charter_md_present: false,
      adrs_count: 0,
      skills_count: 0,
      git_dirty: false,
      last_seen_at: NOW,
    }, NOW);
    expect(r.score).toBe(70);
  });

  it('stale > 90 days adds 20', () => {
    const old = '2026-01-01T00:00:00Z';
    const r = scoreProject({
      agents_md_present: true,
      charter_md_present: true,
      adrs_count: 5,
      skills_count: 3,
      git_dirty: false,
      last_seen_at: old,
    }, NOW);
    expect(r.days_idle).toBeGreaterThan(90);
    expect(r.score).toBe(20);
  });

  it('dirty working tree adds 10', () => {
    const r = scoreProject({
      agents_md_present: true,
      charter_md_present: true,
      adrs_count: 5,
      skills_count: 3,
      git_dirty: true,
      last_seen_at: NOW,
    }, NOW);
    expect(r.score).toBe(10);
  });

  it('score is capped at 100', () => {
    const old = '2020-01-01T00:00:00Z';
    const r = scoreProject({
      agents_md_present: false,
      charter_md_present: false,
      adrs_count: 0,
      skills_count: 0,
      git_dirty: true,
      last_seen_at: old,
    }, NOW);
    // 25+20+15+10+20+10 = 100 → cap at 100
    expect(r.score).toBe(100);
  });
});

describe('ADR-0019 /api/dashboard/drift endpoint', () => {
  it('returns the {projects, summary} envelope', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/dashboard/drift`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toHaveProperty('projects');
    expect(j).toHaveProperty('summary');
    expect(Array.isArray(j.projects)).toBe(true);
    for (const k of ['over_50_count', 'avg_score', 'project_count', 'max_days_idle']) {
      expect(j.summary).toHaveProperty(k);
    }
  });

  it('empty dashboard -> project_count 0', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/dashboard/drift`);
    const j = await r.json();
    expect(j.summary.project_count).toBe(0);
    expect(j.projects.length).toBe(0);
  });

  it('ranks drifted project above healthy one', async () => {
    seedProject('alpha', {
      governance: { agents_md_present: false, charter_md_present: false,
                    adrs_count: 0, skills_count: 0 },
      git: { branch: 'main', dirty: false },
    }, '2026-08-21T00:00:00Z');
    seedProject('beta', {
      governance: { agents_md_present: true, charter_md_present: true,
                    adrs_count: 5, skills_count: 3 },
      git: { branch: 'main', dirty: false },
    }, '2026-08-21T00:00:00Z');

    const r = await fetch(`http://127.0.0.1:${PORT}/api/dashboard/drift`);
    const j = await r.json();
    expect(j.summary.project_count).toBe(2);
    expect(j.projects[0].name).toBe('alpha');
    expect(j.projects[1].name).toBe('beta');
    expect(j.projects[0].score).toBeGreaterThan(j.projects[1].score);
    expect(j.projects[0].missing).toEqual(expect.arrayContaining(['AGENTS.md', 'CHARTER.md']));
    expect(j.summary.over_50_count).toBeGreaterThanOrEqual(1);
  });

  it('severity bands: ok (<30), warn (30-69), high (≥50)', async () => {
    seedProject('fresh', {
      governance: { agents_md_present: true, charter_md_present: true,
                    adrs_count: 5, skills_count: 3 },
      git: { branch: 'main', dirty: false },
    }, '2026-08-21T00:00:00Z');
    seedProject('rotten', {
      governance: { agents_md_present: false, charter_md_present: false,
                    adrs_count: 0, skills_count: 0 },
      git: { branch: 'main', dirty: true },
    }, '2020-01-01T00:00:00Z');

    const r = await fetch(`http://127.0.0.1:${PORT}/api/dashboard/drift`);
    const j = await r.json();
    const fresh = j.projects.find(p => p.name === 'fresh');
    const rotten = j.projects.find(p => p.name === 'rotten');
    expect(fresh.severity).toBe('ok');
    expect(rotten.severity).toBe('high');
  });
});

describe('ADR-0019 /drift HTML view', () => {
  it('returns 200 with the drift page chrome', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/drift`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Cross-project drift');
    expect(body).toContain('data-c="drift"');
  });

  it('includes the nav link to /drift', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/drift`);
    const body = await r.text();
    expect(body).toContain('href="/drift"');
  });

  it('exposes all four KPI cards (over-50, avg score, longest idle, total projects)', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/drift`);
    const body = await r.text();
    expect(body).toContain('high-drift projects');
    expect(body).toContain('avg score');
    expect(body).toContain('longest idle');
    expect(body).toContain('total projects');
  });
});
