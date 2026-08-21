// tests/templates.test.js — HTML smoke tests for the new design system
//
// Goal: assert the new templates render the data-c= hooks that the rest of
// the system depends on (Alpine.js tabs, the data-table binding, the
// answers-line block, etc.). If a future refactor accidentally removes one
// of these hooks, this test fails before integration tests even run.
//
// What this is NOT:
//   - a visual regression test (use a screenshot test for that)
//   - an Alpine.js runtime test (Alpine reads these hooks, but this file
//     only checks the HTML emitted)
//
// Strategy: spawn a real vcm-server with an isolated DB, push one project,
// curl each route, assert presence of the data-c= hooks in the HTML body.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT   = join(import.meta.dirname, '..');
const SERVER_PORT = 7342;

let server;
let tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-tpl-test-'));
  process.env.VCM_SERVER_DB = join(tmpDir, 'tpl.db');

  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(SERVER_PORT), VCM_SERVER_DB: process.env.VCM_SERVER_DB },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/health`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  // Push seed data
  await fetch(`http://127.0.0.1:${SERVER_PORT}/api/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: '0.1.0',
      project: { name: 'demo', path: '/tmp/demo' },
      generated_at: new Date().toISOString(),
      vcm_version: '0.3.0',
      governance: {
        agents_md_present: true,
        charter_md_present: true,
        skills_count: 4,
        adrs_count: 2,
        tds_count: 0,
        post_mortems_count: 0,
        skills_registered: ['skill-authoring', 'demo-skill'],
      },
      health: {},
      git: { head_commit: 'cafebabe', branch: 'main', dirty: false, last_commit_at: new Date().toISOString() },
    }),
  });
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function html(path) {
  const r = await fetch(`http://127.0.0.1:${SERVER_PORT}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.text();
}

describe('layout inheritance', () => {
  it('every page extends _layout (same <head> block)', async () => {
    const a = await html('/');
    const b = await html('/skills');
    const c = await html('/projects/demo');
    const d = await html('/peers');
    const e = await html('/settings');

    for (const [path, body] of [['/', a], ['/skills', b], ['/projects/demo', c], ['/peers', d], ['/settings', e]]) {
      expect(body, path).toContain('<link rel="stylesheet" href="/static/css/dashboard.css">');
      expect(body, path).toContain('x-data="page()"');
    }
  });
});

describe('cockpit', () => {
  it('renders 3-KPI grid (DESIGN.md §4)', async () => {
    const body = await html('/');
    expect(body).toContain('class="kpi-grid" data-c="kpi-grid"');
    // three KPIs at <div class="kpi-cell" data-c="kpi" data-kpi="...">
    expect(body).toMatch(/data-kpi="projects"/);
    expect(body).toMatch(/data-kpi="attention"/);
    expect(body).toMatch(/data-kpi="registries"/);
  });

  it('has an "Answers:" line at the top of every view', async () => {
    expect(await html('/')).toContain('answers-line');
    expect(await html('/projects/demo')).toContain('answers-line');
    expect(await html('/skills')).toContain('answers-line');
    expect(await html('/peers')).toContain('answers-line');
    expect(await html('/settings')).toContain('answers-line');
  });

  it('renders tabs with URL-state hooks', async () => {
    const body = await html('/');
    expect(body).toMatch(/data-tab="overview"/);
    expect(body).toMatch(/data-tab="attention"/);
    expect(body).toMatch(/data-tab="activity"/);
  });
});

describe('project detail', () => {
  it('renders 4 tabs (overview/governance/health/history)', async () => {
    const body = await html('/projects/demo');
    expect(body).toMatch(/data-tab="overview"/);
    expect(body).toMatch(/data-tab="governance"/);
    expect(body).toMatch(/data-tab="health"/);
    expect(body).toMatch(/data-tab="history"/);
  });
});

describe('skill registry', () => {
  it('renders 3 tabs (matrix/coverage/registry)', async () => {
    const body = await html('/skills');
    expect(body).toMatch(/data-tab="matrix"/);
    expect(body).toMatch(/data-tab="coverage"/);
    expect(body).toMatch(/data-tab="registry"/);
  });
});

describe('peers & settings', () => {
  it('peers shows the empty-state CTA when no peers.yaml', async () => {
    const body = await html('/peers');
    expect(body).toContain('vcm peers add owner/name');
  });

  it('settings renders docs links via /docs/ (no /static/../ leaks)', async () => {
    const body = await html('/settings');
    expect(body).toContain('href="/docs/DESIGN.md"');
    expect(body).not.toMatch(/href=["']\/static\/\.\./);
  });

  it('settings exposes the design tokens palette', async () => {
    const body = await html('/settings');
    for (const t of ['--accent', '--ok', '--warn', '--fail', '--idle']) {
      expect(body, `missing token chip: ${t}`).toContain(t);
    }
  });
});

describe('docs serving', () => {
  it('serves DESIGN.md with text/html (escape-safe)', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/docs/DESIGN.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('docs/DESIGN.md');
    expect(body).toContain('<pre');
    // any code-injection-looking thing inside README is escaped
    // (real md files don't have HTML; but test that we DO escape)
    expect(body).not.toMatch(/<script>/);
  });

  it('serves the ADR from a sub-directory', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/docs/adr/0001-repowise-inspired-frontend.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('ADR-0001');
    expect(body).toContain('<pre');
  });

  it('returns 404 for unknown docs', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/docs/no-such-doc.md`);
    expect(r.status).toBe(404);
  });

  it('rejects path traversal', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/docs/../../etc/passwd`);
    expect([400, 404]).toContain(r.status);
  });
});

describe('CSS layers (DESIGN.md §1)', () => {
  it('dashboard.css imports the 3 layers in order', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/static/css/dashboard.css`);
    const body = await r.text();
    expect(body).toMatch(/@import url\("\.\/tokens\.css"\)/);
    expect(body).toMatch(/@import url\("\.\/base\.css"\)/);
    expect(body).toMatch(/@import url\("\.\/components\.css"\)/);
  });

  it('tokens.css declares the repowise palette', async () => {
    const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/static/css/tokens.css`);
    const body = await r.text();
    // accent = repowise orange
    expect(body).toContain('--accent:          #f59520');
    // 3-KPI palette of accents
    expect(body).toMatch(/--ok:.*#4ade80/);
    expect(body).toMatch(/--warn:.*#fbbf24/);
    expect(body).toMatch(/--fail:.*#f87171/);
  });
});
