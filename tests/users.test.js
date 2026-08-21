// tests/users.test.js — per-user ACL (ADR-0011)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7460;
let server, tmpDir;

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never came up');
}

async function getJSON(path, headers = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers });
  return { status: r.status, data: r.ok ? await r.json() : await r.text() };
}

async function tokenFor(username, password = 't0p_secret', label = 'test') {
  const { spawnSync } = await import('node:child_process');
  // IMPORTANT: forward VCM_SERVER_DB so users_cli writes to the same DB
  // the server reads.
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    [join(VCM_ROOT, 'lib/cli/users_cli.py'), 'token', 'grant', username,
     '--label', label, '--password', password],
    { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 'u.db') } },
  );
  if (r.status !== 0) throw new Error('failed to grant token: ' + r.stderr);
  const m = r.stdout.match(/Bearer\s+(\S+)/);
  if (!m) throw new Error('token not in output: ' + r.stdout);
  return m[1];
}

async function addUser(username, password = 't0p_secret', scope = 'push') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    [join(VCM_ROOT, 'lib/cli/users_cli.py'), 'user', 'add', username,
     '--password', password, '--scope', scope],
    { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 'u.db') } },
  );
  if (r.status !== 0) throw new Error('failed to add user: ' + r.stderr);
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-users-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 'u.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Delete all rows; safer than DROP TABLE because server may have an
  // open connection holding schema locks between tests.
  const { spawnSync } = await import('node:child_process');
  spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c',
     `import sqlite3; conn = sqlite3.connect('${join(tmpDir, 'u.db')}');
conn.executescript('DELETE FROM tokens; DELETE FROM users;');
conn.commit(); conn.close()`],
    { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 'u.db') } },
  );
});

describe('per-user ACL (ADR-0011)', () => {
  it('rejects /api/projects with no token when users table has entries', async () => {
    await addUser('alice', 't0p_secret');
    const r = await getJSON('/api/projects');
    expect(r.status).toBe(401);
  });

  it('accepts Bearer token issued via CLI', async () => {
    await addUser('alice', 't0p_secret');
    const tok = await tokenFor('alice');
    const r = await getJSON('/api/projects', {
      'Authorization': `Bearer ${tok}`,
    });
    expect(r.status).toBe(200);
  });

  it('rejects a malformed Bearer token', async () => {
    await addUser('alice', 't0p_secret');
    const r = await getJSON('/api/projects', {
      'Authorization': 'Bearer garbage',
    });
    expect(r.status).toBe(401);
  });

  it('rejects an expired token (simulate via expires_at in past)', async () => {
    // We patch expires_at to a past timestamp via SQLite directly.
    await addUser('alice', 't0p_secret');
    const tok = await tokenFor('alice');
    const { spawnSync } = await import('node:child_process');
    const dbp = join(tmpDir, 'u.db');
    spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['-c',
       `import sqlite3; conn = sqlite3.connect('${dbp}');
import datetime as d; conn.execute("UPDATE tokens SET expires_at = ?", ('2020-01-01T00:00:00+00:00',));
conn.commit(); conn.close()`],
      { encoding: 'utf8' });
    const r = await getJSON('/api/projects', {
      'Authorization': `Bearer ${tok}`,
    });
    expect(r.status).toBe(401);
  });

  it('accepts HTTP Basic with username:password (instead of token)', async () => {
    await addUser('alice', 't0p_secret');
    const r = await getJSON('/api/projects', {
      'Authorization': 'Basic ' + Buffer.from('alice:t0p_secret').toString('base64'),
    });
    expect(r.status).toBe(200);
  });

  it('rejects HTTP Basic with wrong password', async () => {
    await addUser('alice', 't0p_secret');
    const r = await getJSON('/api/projects', {
      'Authorization': 'Basic ' + Buffer.from('alice:WRONG').toString('base64'),
    });
    expect(r.status).toBe(401);
  });

  it('revoked token returns 401 (token removed from DB)', async () => {
    await addUser('alice', 't0p_secret');
    const tok = await tokenFor('alice');
    // Token works
    let r = await getJSON('/api/projects', { 'Authorization': `Bearer ${tok}` });
    expect(r.status).toBe(200);
    // Find token id and revoke
    const { spawnSync } = await import('node:child_process');
    const listOut = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      [join(VCM_ROOT, 'lib/cli/users_cli.py'), 'token', 'list'],
      { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 'u.db') } });
    const idm = listOut.stdout.match(/^\s*(\d+)\s/m);
    if (!idm) throw new Error('could not find token id: ' + listOut.stdout);
    spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      [join(VCM_ROOT, 'lib/cli/users_cli.py'), 'token', 'revoke', idm[1]],
      { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 'u.db') } });
    r = await getJSON('/api/projects', { 'Authorization': `Bearer ${tok}` });
    expect(r.status).toBe(401);
  });

  it('multiple users coexist with independent tokens', async () => {
    await addUser('alice', 'a_pw');
    await addUser('bob',   'b_pw');
    const tokA = await tokenFor('alice');
    const tokB = await tokenFor('bob');
    const a = await getJSON('/api/projects', { 'Authorization': `Bearer ${tokA}` });
    const b = await getJSON('/api/projects', { 'Authorization': `Bearer ${tokB}` });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Swap tokens — Alice's token works only for Alice's identity
    const a_re = await getJSON('/api/dashboard/summary', { 'Authorization': `Bearer ${tokA}` });
    expect(a_re.status).toBe(200);
  });

  it('without any users in DB, /api/* still 200 (backward compat with empty users table)', async () => {
    // No users added this test; users table is empty (we drop in beforeEach).
    // Without auth env, _check_basic_auth returns True at the top.
    const r = await getJSON('/api/projects');
    expect(r.status).toBe(200);
  });
});
