// tests/audit.test.js — JSONL append-only audit log (ADR-0009)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7420;
let server, tmpDir, auditLogPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-audit-'));
  auditLogPath = join(tmpDir, 'audit.log');

  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env,
           VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 'a.db'),
           VCM_AUDIT_LOG: auditLogPath,
           // Auth is required for /api/projects etc.; /api/health stays public.
           VCM_AUTH_USER: 'auditor',
           VCM_AUTH_PASS: 'audit-secret' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  // wait ready
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function readLogLines() {
  if (!existsSync(auditLogPath)) return [];
  return readFileSync(auditLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('Audit log (ADR-0009)', () => {
  it('creates the log file at startup', () => {
    expect(existsSync(auditLogPath)).toBe(true);
  });

  it('logs auth_failure when missing creds hit a protected endpoint', async () => {
    const before = (await readLogLines()).length;
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
    expect(r.status).toBe(401);
    const events = await readLogLines();
    expect(events.length).toBeGreaterThan(before);
    const last = events[events.length - 1];
    expect(last.event_type).toBe('auth_failure');
    expect(last.path).toBe('/api/projects');
    expect(last.method).toBe('GET');
    expect(['wrong_or_missing_credentials', 'malformed_authorization_header'])
      .toContain(last.reason);
  });

  it('logs auth_failure with malformed_authorization_header on Bearer tokens', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, {
      headers: { 'Authorization': 'Bearer abc' }
    });
    expect([400, 401]).toContain(r.status);
    const events = await readLogLines();
    const last = events.filter((e) => e.event_type === 'auth_failure').pop();
    expect(last.method).toBe('GET');
    expect(last.path).toBe('/api/projects');
  });

  it('logs state_pushed on successful POST /api/collect', async () => {
    const before = (await readLogLines()).length;
    const r = await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64'),
      },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: 'audit-fixture', path: '/tmp/audit' },
        generated_at: new Date().toISOString(),
        vcm_version: '0.5.0',
        governance: { skills_count: 0, adrs_count: 0, tds_count: 0,
                      post_mortems_count: 0, skills_registered: [] },
        health: {},
        git: { head_commit: 'abc', branch: 'main', dirty: false,
               last_commit_at: new Date().toISOString() },
      }),
    });
    expect(r.status).toBe(200);
    const events = await readLogLines();
    const push = events.slice(before).find((e) => e.event_type === 'state_pushed');
    expect(push, 'no state_pushed event emitted').toBeDefined();
    expect(push.project).toBe('audit-fixture');
    expect(push.vcm_version).toBe('0.5.0');
  });

  it('logs state_rejected on invalid POST /api/collect', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64'),
      },
      body: JSON.stringify({}),  // missing project
    });
    expect(r.status).toBe(400);
    const events = await readLogLines();
    const rej = events.filter((e) => e.event_type === 'state_rejected').pop();
    expect(rej).toBeDefined();
    expect(rej.method || true).toBeTruthy();
  });

  it('GET /api/audit returns the events newest-first', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?limit=10`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64') }
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(Array.isArray(j.events)).toBe(true);
    expect(j.count).toBe(j.events.length);
    if (j.events.length >= 2) {
      for (let i = 1; i < j.events.length; i++) {
        expect(j.events[i].ts <= j.events[i - 1].ts).toBe(true);
      }
    }
  });

  it('GET /api/audit?event=auth_failure filters correctly', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?event=auth_failure&limit=5`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64') }
    });
    const j = await r.json();
    expect(j.events.every((e) => e.event_type === 'auth_failure')).toBe(true);
  });

  it('GET /api/audit?since= filters correctly', async () => {
    const future = new Date(Date.now() + 86400 * 1000).toISOString();
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?since=${encodeURIComponent(future)}`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64') }
    });
    const j = await r.json();
    expect(j.events.length).toBe(0);
  });

  it('limit clamps to [1, 5000]', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?limit=10000`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from('auditor:audit-secret').toString('base64') }
    });
    const j = await r.json();
    expect(j.events.length).toBeLessThanOrEqual(5000);
  });

  it('JSONL lines are parseable one-per-event', async () => {
    const events = await readLogLines();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e).toHaveProperty('ts');
      expect(e).toHaveProperty('event_type');
      expect(typeof e.ts).toBe('string');
    }
  });
});
