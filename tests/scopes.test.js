// tests/scopes.test.js — per-endpoint scope enforcement (ADR-0014)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7480;
let server;
let tmpDir;
let auditLogPath;

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

async function getToken(username, scope = 'push', password = 't0p_secret') {
  const out = runCli(['token', 'grant', username, '--label', `test-${scope}`,
                       '--scope', scope, '--password', password],
                     { VCM_SERVER_DB: join(tmpDir, 's.db') });
  const m = out.match(/Bearer\s+(\S+)/);
  if (!m) throw new Error('no token: ' + out);
  return m[1];
}

async function addUser(username, password = 't0p_secret', scope = 'push') {
  runCli(['user', 'add', username, '--password', password, '--scope', scope],
         { VCM_SERVER_DB: join(tmpDir, 's.db') });
}

async function fetchAs(path, token, init = {}) {
  const headers = init.headers || {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`http://127.0.0.1:${PORT}${path}`, { ...init, headers });
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-scopes-'));
  auditLogPath = join(tmpDir, 'audit.log');
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_AUDIT_LOG: auditLogPath },
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
  spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c',
     `import sqlite3; conn = sqlite3.connect('${join(tmpDir, 's.db')}');
conn.executescript('DELETE FROM tokens; DELETE FROM users;');
conn.commit(); conn.close()`],
    { encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 's.db') } },
  );
});

describe('per-endpoint scope enforcement (ADR-0014)', () => {
  it('read token can GET /api/dashboard/summary', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'read');
    const r = await fetchAs('/api/dashboard/summary', tok);
    expect(r.status).toBe(200);
  });

  it('read token CANNOT POST /api/collect (403, not 401)', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'read');
    const r = await fetchAs('/api/collect', tok, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: 'blocked', path: '/tmp/blocked' },
        generated_at: new Date().toISOString(),
        vcm_version: '0.7.0',
        governance: { skills_count: 0, adrs_count: 0, tds_count: 0,
                      post_mortems_count: 0, skills_registered: [] },
        health: {},
        git: { head_commit: 'x', branch: 'main', dirty: false,
               last_commit_at: new Date().toISOString() },
      }),
    });
    expect(r.status).toBe(403);
    const j = await r.json();
    expect(j.error).toMatch(/scope/);
    expect(j.required).toBe('push');
    expect(j.have).toBe('read');
  });

  it('push token CAN POST /api/collect', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const r = await fetchAs('/api/collect', tok, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: 'pusher', path: '/tmp/p' },
        generated_at: new Date().toISOString(),
        vcm_version: '0.7.0',
        governance: { skills_count: 0, adrs_count: 0, tds_count: 0,
                      post_mortems_count: 0, skills_registered: [] },
        health: {},
        git: { head_commit: 'x', branch: 'main', dirty: false,
               last_commit_at: new Date().toISOString() },
      }),
    });
    expect(r.status).toBe(200);
  });

  it('no token returns 401 (auth required, not 403)', async () => {
    await addUser('alice', 'pw', 'push');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
    expect(r.status).toBe(401);
  });

  it('admin token can hit read endpoints (rank ladder)', async () => {
    await addUser('root', 'pw', 'admin');
    const tok = await getToken('root', 'admin');
    const r = await fetchAs('/api/dashboard/summary', tok);
    expect(r.status).toBe(200);
  });

  it('scope_forbidden audit event recorded on 403', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'read');
    await fetchAs('/api/collect', tok, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    // Filter to scope_forbidden events (audit log has many types)
    const lines = readFileSync(auditLogPath, 'utf8').split('\n').filter(Boolean);
    const events = lines.map(l => JSON.parse(l));
    const scopeEvents = events.filter(e => e.event_type === 'scope_forbidden');
    expect(scopeEvents.length, 'no scope_forbidden event').toBeGreaterThan(0);
    const last = scopeEvents[scopeEvents.length - 1];
    expect(last.required).toBe('push');
    expect(last.have).toBe('read');
    expect(last.path).toBe('/api/collect');
  });

  it('admin user via BasicAuth env-mode has admin scope', async () => {
    // Spawn sub-server with VCM_AUTH_USER/PASS set (v0.5 compat)
    const SUB_PORT = 7481;
    const sub = spawn(
      join(VCM_ROOT, '.venv', 'bin', 'python3'),
      [VCM_ROOT + '/server/app.py'], {
        cwd: VCM_ROOT,
        env: {
          ...process.env,
          VCM_SERVER_PORT: String(SUB_PORT),
          VCM_SERVER_DB: join(tmpDir, 'admin.db'),
          VCM_AUTH_USER: 'admin', VCM_AUTH_PASS: 'pw',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    sub.stderr.on('data', () => {});
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${SUB_PORT}/api/health`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    // BasicAuth with admin creds → admin scope → can hit push endpoint
    const r = await fetch(`http://127.0.0.1:${SUB_PORT}/api/projects`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('admin:pw').toString('base64') },
    });
    expect(r.status).toBe(200);
    sub.kill();
  });
});
