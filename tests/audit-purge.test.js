// tests/audit-purge.test.js — POST /api/audit/purge (ADR-0016)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7485;
let server, tmpDir;

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('not ready');
}

function runCli(args, env = {}) {
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    [join(VCM_ROOT, 'lib/cli/users_cli.py'), ...args],
    { encoding: 'utf8', env: { ...process.env, ...env } },
  );
  if (r.status !== 0) throw new Error(`cli ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

async function getToken(username, scope, password = 't0p_secret') {
  const out = runCli(['token', 'grant', username, '--label', `t-${scope}`,
                       '--scope', scope, '--password', password],
                     { VCM_SERVER_DB: join(tmpDir, 's.db') });
  return out.match(/Bearer\s+(\S+)/)[1];
}

async function addUser(username, password = 't0p_secret', scope = 'push') {
  runCli(['user', 'add', username, '--password', password, '--scope', scope],
         { VCM_SERVER_DB: join(tmpDir, 's.db') });
}

function seedEvents(events) {
  const db = join(tmpDir, 's.db');
  const values = events
    .map((e) => `('${e.ts}', '${e.type}', ${e.project ? `'${e.project}'` : 'NULL'},
                 '127.0.0.1', '{}')`)
    .join(',\n         ');
  const r = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sys
sys.path.insert(0, '${VCM_ROOT}/server')
import audit, sqlite3
db = '${db}'
audit.ensure_events_table(sqlite3.connect(db))
conn = sqlite3.connect(db)
conn.executescript("""INSERT INTO audit_events
  (ts, event_type, project, source_ip, payload) VALUES ${values}""")
conn.commit()
rows = conn.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0]
print('SEEDED ROWS:', rows, file=__import__('sys').stderr)
conn.close()`],
    { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: db } });
  if (r.status !== 0) {
    console.error('SEED STDOUT:', r.stdout);
    console.error('SEED STDERR:', r.stderr);
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-purge-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_AUDIT_LOG: join(tmpDir, 'audit.log') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3; conn = sqlite3.connect('${join(tmpDir, 's.db')}');
conn.executescript('DELETE FROM audit_events; DELETE FROM tokens; DELETE FROM users;');
conn.commit(); conn.close()`],
    { encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 's.db') } });
});

describe('POST /api/audit/purge (ADR-0016)', () => {
  it('admin scope token can purge events older than `before`', async () => {
    await addUser('admin', 'pw', 'admin');
    const tok = await getToken('admin', 'admin');
    const past = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const recent = new Date().toISOString();
    seedEvents([
      { ts: past, type: 'auth_failure', project: null },
      { ts: past, type: 'state_pushed', project: 'old' },
      { ts: recent, type: 'state_pushed', project: 'fresh' },
    ]);
    const cutoff = new Date(Date.now() - 86400 * 1000).toISOString();
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: cutoff, confirm: 'PURGE' }),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.deleted).toBe(2);
  });

  it('refuses without literal PURGE confirmation', async () => {
    await addUser('admin', 'pw', 'admin');
    const tok = await getToken('admin', 'admin');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: '2020-01-01' }),
    });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toMatch(/PURGE/);
  });

  it('read-only token cannot purge (403)', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'read');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: '2020-01-01', confirm: 'PURGE' }),
    });
    expect(r.status).toBe(403);
  });

  it('push scope token cannot purge (403)', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: '2020-01-01', confirm: 'PURGE' }),
    });
    expect(r.status).toBe(403);
  });

  it('purge with no matching events returns deleted=0', async () => {
    await addUser('admin', 'pw', 'admin');
    const tok = await getToken('admin', 'admin');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: '2099-01-01', confirm: 'PURGE' }),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.deleted).toBe(0);
  });

  it('event_type filter purges only that type', async () => {
    await addUser('admin', 'pw', 'admin');
    const tok = await getToken('admin', 'admin');
    const past = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    seedEvents([
      { ts: past, type: 'auth_failure', project: null },
      { ts: past, type: 'state_pushed', project: 'p' },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/purge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: new Date().toISOString(), confirm: 'PURGE', event_type: 'auth_failure' }),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.deleted).toBe(1);
  });
});
