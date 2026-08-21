// tests/audit-stats-view.test.js — /audit view uses /api/audit/stats (v0.8.0)
//
// Validates that the audit view contains the stats endpoints it relies on.
// (We don't run a browser; we check the rendered HTML for the hooks.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7482;
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

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-audit-view-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('/audit view integration (v0.8.0)', () => {
  it('GET /audit renders 200 with stats card hooks', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/audit`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('data-c="audit-stats"');
    expect(body).toContain('audit-stats-chart');
    expect(body).toContain('event_type');
  });

  it('GET /api/audit/stats returns {total, by_type}', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/stats`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toHaveProperty('total');
    expect(j).toHaveProperty('by_type');
  });

  it('GET /api/audit/stats since= filters correctly', async () => {
    const future = new Date(Date.now() + 86400 * 1000).toISOString();
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/stats?since=${encodeURIComponent(future)}`);
    const j = await r.json();
    expect(j.total).toBe(0);
  });
});
