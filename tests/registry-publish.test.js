// tests/registry-publish.test.js — /api/registry/publish endpoint (closes v0.8.0 marketplace server-side)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7488;
let server, registryDir, tmpDir;

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

async function getToken(username, scope='push', password='t0p_secret') {
  const out = runCli(['token', 'grant', username, '--label', `t-${scope}`,
                       '--scope', scope, '--password', password],
                     { VCM_SERVER_DB: join(tmpDir, 's.db') });
  return out.match(/Bearer\s+(\S+)/)[1];
}

async function addUser(username, password='t0p_secret', scope='push') {
  runCli(['user', 'add', username, '--password', password, '--scope', scope],
         { VCM_SERVER_DB: join(tmpDir, 's.db') });
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-reg-'));
  registryDir = join(tmpDir, 'registry');
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_REGISTRY_DIR: join(registryDir, 'skills'),
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
conn.executescript('DELETE FROM tokens; DELETE FROM users;');
conn.commit(); conn.close()`],
    { encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 's.db') } });
});

describe('/api/registry/publish (closes marketplace server-side)', () => {
  it('publish a skill via push scope token, persists to disk', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/registry/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'fresh-skill',
        description: 'a brand new skill published via the server-side endpoint',
        tags: ['api', 'test'],
      }),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.published).toBe('fresh-skill');
    const path = join(registryDir, 'skills', 'fresh-skill.json');
    expect(existsSync(path)).toBe(true);
    const fm = JSON.parse(readFileSync(path, 'utf8'));
    expect(fm.name).toBe('fresh-skill');
    expect(fm.authority).toBe('execution-index');   // default
  });

  it('read-only token cannot publish (403)', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'read');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/registry/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'should-fail', description: 'x'.repeat(40), tags: [] }),
    });
    expect(r.status).toBe(403);
  });

  it('rejects missing name with 400', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/registry/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: 'has no name' }),
    });
    expect(r.status).toBe(400);
  });

  it('rejects retired skills (matches v0.5.0 CLI rule)', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const r = await fetch(`http://127.0.0.1:${PORT}/api/registry/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'old-skill',
        description: 'a skill that was once active but is now retired',
        tags: ['x'],
        lifecycle: { phase: 'retired' },
      }),
    });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toMatch(/retired/i);
  });

  it('publish + discover round-trip via API', async () => {
    await addUser('alice', 'pw', 'push');
    const tok = await getToken('alice', 'push');
    const ts = Date.now();
    const name = `roundtrip-${ts}`;
    await fetch(`http://127.0.0.1:${PORT}/api/registry/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name, description: 'a skill published via API for round-trip test',
        tags: ['rt'],
      }),
    });
    const r = await fetch(`http://127.0.0.1:${PORT}/api/registry/skills`, {
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    const j = await r.json();
    const found = j.skills.find(s => s.name === name);
    expect(found).toBeDefined();
    expect(found.tags).toContain('rt');
  });
});
