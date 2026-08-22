// tests/trends.test.js — Governance trend dashboard (ADR-0010)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7430;
let server, tmpDir;

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server not ready');
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-trend-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 't.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  await waitReady();
  // Push 6 sample states spanning 30 days so trend has buckets
  const dayMs = 86400 * 1000;
  const now = Date.now();
  const samples = [
    { name: 'alpha', branch: 'main', skills: 5, adrs: 8, tds: 5, dirty: false, agents: true,  charter: true,  daysAgo: 28 },
    { name: 'alpha', branch: 'main', skills: 6, adrs: 9, tds: 4, dirty: false, agents: true,  charter: true,  daysAgo: 21 },
    { name: 'beta',  branch: 'dev',  skills: 1, adrs: 2, tds: 30, dirty: true, agents: true,  charter: false, daysAgo: 14 },
    { name: 'beta',  branch: 'dev',  skills: 2, adrs: 2, tds: 28, dirty: true, agents: true,  charter: true,  daysAgo: 7  },
    { name: 'alpha', branch: 'main', skills: 7, adrs: 10, tds: 3, dirty: false, agents: true, charter: true,  daysAgo: 3  },
    { name: 'gamma', branch: 'main', skills: 0, adrs: 0, tds: 0, dirty: false, agents: false, charter: false, daysAgo: 1  },
  ];
  for (const s of samples) {
    await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: s.name, path: `/tmp/${s.name}` },
        generated_at: new Date(now - s.daysAgo * dayMs).toISOString(),
        vcm_version: '0.5.0',
        governance: {
          agents_md_present: s.agents, charter_md_present: s.charter,
          skills_count: s.skills, adrs_count: s.adrs, tds_count: s.tds,
          post_mortems_count: 0, skills_registered: s.name + '-skill',
        },
        health: {},
        git: { head_commit: 'abc', branch: s.branch, dirty: s.dirty,
               last_commit_at: new Date(now - s.daysAgo * dayMs).toISOString() },
      }),
    });
  }
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function getJSON(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

describe('trend endpoint (ADR-0010)', () => {
  it('default metric=compliance returns weekly buckets', async () => {
    const j = await getJSON('/api/dashboard/trend?days=30');
    expect(j.metric).toBe('compliance');
    expect(j.days).toBe(30);
    expect(Array.isArray(j.buckets)).toBe(true);
    expect(j.buckets.length).toBeGreaterThanOrEqual(4);
    for (const b of j.buckets) {
      expect(b).toHaveProperty('date');
      expect(b).toHaveProperty('value');
      expect(b).toHaveProperty('n');
    }
  });

  it('buckets with no pushes have value=null', async () => {
    const j = await getJSON('/api/dashboard/trend?days=180');
    const empty = j.buckets.filter((b) => b.n === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const e of empty) expect(e.value).toBeNull();
  });

  it('buckets with pushes have non-null value (compliance)', async () => {
    const j = await getJSON('/api/dashboard/trend?days=30');
    const filled = j.buckets.filter((b) => b.n > 0);
    expect(filled.length).toBeGreaterThan(0);
    for (const b of filled) {
      expect(typeof b.value).toBe('number');
      expect(b.value).toBeGreaterThanOrEqual(0);
      expect(b.value).toBeLessThanOrEqual(1);
    }
  });

  it('metric=td_count returns numeric values (rounded to int)', async () => {
    const j = await getJSON('/api/dashboard/trend?metric=td_count&days=30');
    expect(j.metric).toBe('td_count');
    const filled = j.buckets.filter((b) => b.value !== null);
    expect(filled.length).toBeGreaterThan(0);
    for (const b of filled) {
      expect(typeof b.value).toBe('number');
      // Integer-valued within rounding tolerance.
      expect(Math.abs(b.value - Math.round(b.value))).toBeLessThan(1e-9);
    }
  });

  it('metric=pushed returns raw push counts', async () => {
    const j = await getJSON('/api/dashboard/trend?metric=pushed&days=30');
    const filled = j.buckets.filter((b) => b.value !== null);
    let total = 0;
    for (const b of filled) total += b.value;
    expect(total).toBe(6);  // we pushed 6 times
  });

  it('project filter scopes to one slug', async () => {
    const all = await getJSON('/api/dashboard/trend?metric=pushed&days=30');
    const alpha = await getJSON('/api/dashboard/trend?project=alpha&metric=pushed&days=30');
    const alpha_total = alpha.buckets.reduce((s, b) => s + (b.value || 0), 0);
    const all_total  = all.buckets.reduce((s, b) => s + (b.value || 0), 0);
    expect(alpha_total).toBeLessThan(all_total);
    expect(alpha_total).toBeGreaterThan(0);
  });

  it('days clamps to [1, 365]', async () => {
    const too_few  = await getJSON('/api/dashboard/trend?days=0');
    const too_many = await getJSON('/api/dashboard/trend?days=10000');
    expect(too_few.days).toBeGreaterThanOrEqual(1);
    expect(too_many.days).toBeLessThanOrEqual(365);
  });

  it('unknown metric falls back to compliance (or returns null values)', async () => {
    // Both behaviours are acceptable; we just assert a valid response shape.
    const j = await getJSON('/api/dashboard/trend?metric=bogus&days=14');
    expect(j.metric).toBe('bogus');
    expect(Array.isArray(j.buckets)).toBe(true);
  });
});

describe('trend view HTML (ADR-0010)', () => {
  it('GET /projects/<name>/trends renders chart + filter (ADR-0032 — was /trends)', async () => {
    // v0.18.1: /trends → 302 redirect. Trends UI lives at
    // /projects/<name>/trends. Same DOM markers, new URL.
    const r = await fetch(`http://127.0.0.1:${PORT}/projects/vcm-smoke/trends?lang=en`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('data-c="trends"');
    expect(body).toContain('Governance trend');
    expect(body).toContain('<select');
  });
});
