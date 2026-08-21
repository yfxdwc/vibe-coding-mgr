// tests/docs-viewer.test.js — /docs view with TOC + search (ADR-0017)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7487;
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
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-docs-'));
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

describe('docs viewer (ADR-0017)', () => {
  it('GET /api/docs/index enumerates all .md files in docs/', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/docs/index`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toHaveProperty('files');
    expect(j.count).toBeGreaterThan(10);  // we have 17+ ADRs
    const rels = j.files.map(f => f.relpath);
    // CHARTER.md is at repo root, not docs/, so it isn't in this index.
    expect(rels.some(r => r.startsWith('adr/'))).toBe(true);
    expect(rels).toContain('ARCHITECTURE.md');
    expect(rels).toContain('DESIGN.md');
  });

  it('each file entry has filename, relpath, title, snippet', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/docs/index`);
    const j = await r.json();
    for (const f of j.files) {
      expect(typeof f.filename).toBe('string');
      expect(typeof f.relpath).toBe('string');
      expect(typeof f.title).toBe('string');
      expect(typeof f.snippet).toBe('string');
      // snippet bounded to 200 chars
      expect(f.snippet.length).toBeLessThanOrEqual(200);
    }
  });

  it('GET /docs/DESIGN.md renders 200 with sidebar hooks', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/DESIGN.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('data-c="docs-sidebar"');
    expect(body).toContain('data-c="docs-body"');
    // The actual design content is escaped
    // DESIGN.md is in Chinese, so check that the body has SOME escaped
    // content from the design source. ARCHITECTURE.md would be more
    // grep-friendly but this just confirms DESIGN.md renders.
    expect(body.length).toBeGreaterThan(1000);  // real content, not empty
  });

  it('GET /docs/adr/0011-per-user-acl.md renders 200', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/adr/0011-per-user-acl.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('ADR-0011');
  });

  it('GET /docs/../etc/passwd returns 404 (path traversal blocked)', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/../etc/passwd`,
                          { redirect: 'manual' });
    expect(r.status).toBe(404);
  });

  it('GET /docs/ARCHITECTURE.md renders English content correctly', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/ARCHITECTURE.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('ARCHITECTURE');
    expect(body).toContain('Components');
  });

  it('GET /docs/no-such-doc.md returns 404', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/no-such.md`);
    expect(r.status).toBe(404);
  });
});
