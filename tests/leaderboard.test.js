// tests/leaderboard.test.js — cross-project ranking (ADR-0005)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7380;

let server, tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-lb-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT), VCM_SERVER_DB: join(tmpDir, 'lb.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  // Push 3 projects with known profile
  const samples = [
    { name: 'clean-proj',   branch: 'main', skills: 5, adrs: 3, tds: 0,  pm: 1, dirty: false, agents: true,  charter: true,  reg: ['skill-a', 'skill-b'] },
    { name: 'td-heavy',     branch: 'dev',  skills: 1, adrs: 1, tds: 50, pm: 0, dirty: true,  agents: true,  charter: false, reg: ['skill-a'] },
    { name: 'no-governance',branch: 'main', skills: 0, adrs: 0, tds: 0,  pm: 0, dirty: false, agents: false, charter: false, reg: [] },
  ];
  for (const s of samples) {
    await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: s.name, path: `/tmp/${s.name}` },
        generated_at: new Date().toISOString(),
        vcm_version: '0.4.0',
        governance: {
          agents_md_present: s.agents, charter_md_present: s.charter,
          skills_count: s.skills, adrs_count: s.adrs,
          tds_count: s.tds, post_mortems_count: s.pm,
          skills_registered: s.reg,
        },
        health: {},
        git: { head_commit: 'cafebabe', branch: s.branch, dirty: s.dirty,
               last_commit_at: new Date().toISOString() },
      }),
    });
  }
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function get(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return { status: r.status, data: r.ok ? await r.json() : null };
}

describe('leaderboard endpoint (ADR-0005)', () => {
  it('default sort=td_count, order=desc puts td-heavy first', async () => {
    const r = await get('/api/dashboard/leaderboard');
    expect(r.status).toBe(200);
    expect(r.data.sort).toBe('td_count');
    expect(r.data.order).toBe('desc');
    expect(r.data.rows.length).toBe(3);
    expect(r.data.rows[0].name).toBe('td-heavy');
    expect(r.data.rows[0].td_count).toBe(50);
  });

  it('?sort=skills&order=desc orders by skill count', async () => {
    const r = await get('/api/dashboard/leaderboard?sort=skills&order=desc');
    expect(r.data.rows[0].name).toBe('clean-proj');  // 5 skills
    expect(r.data.rows[0].skills).toBe(5);
  });

  it('?sort=governance_compliance puts clean-proj first (compliance=1.0)', async () => {
    const r = await get('/api/dashboard/leaderboard?sort=governance_compliance&order=desc');
    expect(r.data.rows[0].name).toBe('clean-proj');
    expect(r.data.rows[0].compliance).toBe(1.0);
  });

  it('?sort=governance_compliance&order=asc puts no-governance FIRST (lowest compliance)', async () => {
    const r = await get('/api/dashboard/leaderboard?sort=governance_compliance&order=asc');
    expect(r.data.rows[0].name).toBe('no-governance');
    expect(r.data.rows[r.data.rows.length - 1].name).toBe('clean-proj');
  });

  it('?sort=dirty_clean&order=desc surfaces td-heavy (dirty=1)', async () => {
    const r = await get('/api/dashboard/leaderboard?sort=dirty_clean&order=desc');
    expect(r.data.rows[0].name).toBe('td-heavy');
    expect(r.data.rows[0].dirty).toBe(true);
  });

  it('compliance is rounded to 2 decimals', async () => {
    const r = await get('/api/dashboard/leaderboard');
    for (const row of r.data.rows) {
      expect(String(row.compliance).split('.')[1] || '').toMatch(/^$|^\d{1,2}$/);
    }
  });

  it('unknown sort key falls back to td_count', async () => {
    const r = await get('/api/dashboard/leaderboard?sort=bogus');
    expect(r.data.sort).toBe('td_count');
  });

  it('each row exposes the minimal fields needed by the UI', async () => {
    const r = await get('/api/dashboard/leaderboard');
    const row = r.data.rows[0];
    for (const k of ['name', 'branch', 'td_count', 'skills', 'adrs',
                     'compliance', 'stale_days', 'dirty']) {
      expect(row, `missing ${k}`).toHaveProperty(k);
    }
  });
});

describe('leaderboard view (HTML)', () => {
  it('GET /leaderboard renders table + 6 sort options', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/leaderboard`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('data-c="leaderboard-table"');
    // 6 sort keys via Alpine setSort(value)
    expect(body).toContain("'td_count'");
    expect(body).toContain("'skills'");
    expect(body).toContain("'adrs'");
    expect(body).toContain("'governance_compliance'");
    expect(body).toContain("'last_seen_days'");
    expect(body).toContain("'dirty_clean'");
  });

  it('GET /leaderboard?sort=skills reflects state via Alpine x-text', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/leaderboard?sort=skills&order=desc&lang=en`);
    const body = await r.text();
    expect(body).toContain('Sorted by');
    // Alpine reactivity: `sort` is initialised from URL ?sort=
    expect(body).toContain("new URLSearchParams(location.search).get('sort')");
  });
});
