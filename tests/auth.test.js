// tests/auth.test.js — BasicAuth enforcement (ADR-0004)
//
// Spawns vcm-server with VCM_AUTH_USER/PASS set, probes each endpoint,
// asserts 401 / 200 behaviour. Then re-tests with no env to confirm
// backward compatibility.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7373;

let server;
let tmpDir;

function spawnServer(env = {}) {
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  return spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, ...env,
           VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: env.VCM_SERVER_DB || join(tmpDir, 'a.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function waitForServer(label) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server (${label}) never came up`);
}

async function killGracefully(proc) {
  if (!proc || proc.killed) return;
  return new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 2000);
  });
}

describe('BasicAuth (ADR-0004) — backward compat', () => {
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcm-auth-'));
    server = spawnServer({});
    server.stderr.on('data', () => {});
    await waitForServer('no-auth');
  });
  afterAll(async () => {
    await killGracefully(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('no VCM_AUTH_* env → /api/* requires no auth', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
    expect(r.status).toBe(200);
  });

  it('no env → /api/health returns auth_required:false', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    const j = await r.json();
    expect(j.auth_required).toBe(false);
  });
});

describe('BasicAuth (ADR-0004) — auth enabled', () => {
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcm-auth-'));
    server = spawnServer({
      VCM_AUTH_USER: 'alice',
      VCM_AUTH_PASS: 's3cr3t',
    });
    server.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));
    await waitForServer('auth-on');
  });
  afterAll(async () => {
    await killGracefully(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/api/health reports auth_required:true', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.auth_required).toBe(true);
  });

  it('missing Authorization → 401 + WWW-Authenticate', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
    expect(r.status).toBe(401);
    expect(r.headers.get('WWW-Authenticate')).toContain('Basic');
    const j = await r.json();
    expect(j.error).toMatch(/auth required/i);
  });

  it('wrong password → 401', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('alice:WRONG').toString('base64') }
    });
    expect(r.status).toBe(401);
  });

  it('correct creds → 200', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('alice:s3cr3t').toString('base64') }
    });
    expect(r.status).toBe(200);
  });

  it('curl -u form equivalent works', async () => {
    // Use Node 22+'s built-in basic auth via URL? Not yet supported in fetch().
    // Simulate by manually building header.
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('alice:s3cr3t').toString('base64') }
    });
    expect(r.status).toBe(200);
  });

  it('malformed Authorization header → 400', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, {
      headers: { 'Authorization': 'Bearer abc' }
    });
    expect([400, 401]).toContain(r.status);
  });

  it('POST /api/collect also requires auth', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(401);
  });

  it('GET / (HTML dashboard) stays public', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/`);
    // 200 because the dashboard renders even with no auth (HTML view is OK)
    expect(r.status).toBe(200);
  });

  it('/static/* stays public', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/static/css/dashboard.css`);
    expect(r.status).toBe(200);
  });

  it('/skills (HTML) stays public', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/skills`);
    expect(r.status).toBe(200);
  });
});

describe('BasicAuth (ADR-0004) — half-configured env', () => {
  it('USER-only env exits with clear error', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcm-auth-half-'));
    const proc = spawnServer({ VCM_AUTH_USER: 'alice' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const code = await new Promise((res) => {
      proc.once('exit', (c) => res(c));
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} res('timeout'); }, 3000);
    });
    rmSync(tmpDir, { recursive: true, force: true });
    expect(stderr).toMatch(/must be set together/);
  });
});
