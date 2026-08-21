// tests/server.test.js — vcm-server dashboard data layer tests
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const SERVER_PORT = 7341;

let serverProcess;
let tmpDir;

beforeAll(async () => {
  // Set up a temp git repo as a project
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-server-test-'));
  execSync('git init -q', { cwd: tmpDir });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir });
  execSync('git config user.name "Test"', { cwd: tmpDir });

  // Use a unique DB path for the server
  process.env.VCM_SERVER_DB = join(tmpDir, 'test.db');

  // Start vcm-server
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  serverProcess = spawn(
    venvPython,
    ['server/app.py'],
    {
      cwd: VCM_ROOT,
      env: { ...process.env, VCM_SERVER_PORT: String(SERVER_PORT), VCM_SERVER_DB: process.env.VCM_SERVER_DB },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/health`);
      if (r.ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error(`Server failed to start on port ${SERVER_PORT}`);
}, 30000);

afterAll(() => {
  if (serverProcess) serverProcess.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function postState(state) {
  const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  return { status: r.status, data: await r.json() };
}

async function getJSON(path) {
  const r = await fetch(`http://127.0.0.1:${SERVER_PORT}${path}`);
  return { status: r.status, data: r.ok ? await r.json() : null };
}

describe('vcm-server health', () => {
  it('GET /api/health returns healthy', async () => {
    const r = await getJSON('/api/health');
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('healthy');
    expect(r.data.version).toBe('0.13.0');
  });
});

describe('vcm-server collect', () => {
  it('accepts a valid state push', async () => {
    const state = {
      schema_version: '0.1.0',
      project: { name: 'test-proj-1', path: '/tmp/test1' },
      generated_at: new Date().toISOString(),
      vcm_version: '0.9.0',
      governance: {
        agents_md_present: true,
        charter_md_present: true,
        skills_count: 5,
        adrs_count: 3,
        tds_count: 0,
        post_mortems_count: 0,
        skills_registered: ['sales-ai-crm-arch', 'skill-authoring'],
      },
      health: { last_snapshot_at: new Date().toISOString(), last_ci_pass: true, ci_warnings: 0, ci_failures: 0 },
      git: { head_commit: 'abc1234', branch: 'master', dirty: false, last_commit_at: new Date().toISOString() },
    };
    const r = await postState(state);
    expect(r.status).toBe(200);
    expect(r.data.project_name).toBe('test-proj-1');
  });

  it('rejects invalid state (no project)', async () => {
    const r = await postState({});
    expect(r.status).toBe(400);
  });
});

describe('vcm-server dashboard endpoints', () => {
  let testProjectsPushed = 0;
  beforeAll(async () => {
    // Push a second project so we have data
    await postState({
      schema_version: '0.1.0',
      project: { name: 'test-proj-2', path: '/tmp/test2' },
      generated_at: new Date().toISOString(),
      vcm_version: '0.9.0',
      governance: {
        agents_md_present: true,
        charter_md_present: false,
        skills_count: 3,
        adrs_count: 1,
        tds_count: 50,
        post_mortems_count: 2,
        skills_registered: ['sales-ai-crm-arch'],
      },
      health: {},
      git: { head_commit: 'def5678', branch: 'main', dirty: true, last_commit_at: new Date().toISOString() },
    });
    testProjectsPushed = 2;
  });

  it('GET /api/dashboard/summary returns aggregate counts', async () => {
    const r = await getJSON('/api/dashboard/summary');
    expect(r.status).toBe(200);
    expect(r.data.total_projects).toBeGreaterThanOrEqual(testProjectsPushed);
    expect(r.data.total_skills).toBeGreaterThan(0);
    expect(r.data).toHaveProperty('healthy');
    expect(r.data).toHaveProperty('warning');
    expect(r.data).toHaveProperty('needs_attention');
  });

  it('GET /api/dashboard/overview returns all projects', async () => {
    const r = await getJSON('/api/dashboard/overview');
    expect(r.status).toBe(200);
    expect(r.data.length).toBeGreaterThanOrEqual(testProjectsPushed);
    const p = r.data[0];
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('skills_count');
    expect(p).toHaveProperty('skills_registered');
  });

  it('GET /api/dashboard/skill-matrix returns skill → projects mapping', async () => {
    const r = await getJSON('/api/dashboard/skill-matrix');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
    // sales-ai-crm-arch should appear (used by both projects)
    const shared = r.data.find(s => s.skill === 'sales-ai-crm-arch');
    expect(shared).toBeDefined();
    expect(shared.project_count).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/dashboard/attention detects issues', async () => {
    const r = await getJSON('/api/dashboard/attention');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
    // test-proj-2 has 50 TDs (>30 threshold) so should appear
    const tdItem = r.data.find(i => i.project === 'test-proj-2');
    expect(tdItem).toBeDefined();
    expect(tdItem.reasons.some(r => r.includes('tech debt'))).toBe(true);
  });

  it('GET /api/dashboard/activity returns recent pushes', async () => {
    const r = await getJSON('/api/dashboard/activity');
    expect(r.status).toBe(200);
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0]).toHaveProperty('project_name');
    expect(r.data[0]).toHaveProperty('received_at');
  });

  it('GET /api/project/<name>/full returns project detail', async () => {
    const r = await getJSON('/api/project/test-proj-1/full');
    expect(r.status).toBe(200);
    expect(r.data.name).toBe('test-proj-1');
    expect(r.data.latest_state.governance.skills_count).toBe(5);
    expect(r.data.history.length).toBeGreaterThan(0);
  });

  it('GET /api/project/<unknown>/full returns 404', async () => {
    const r = await getJSON('/api/project/nonexistent-project/full');
    expect(r.status).toBe(404);
  });
});
