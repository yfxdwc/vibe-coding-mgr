// tests/audit-facets.test.js — /api/audit filtering (ADR-0024).
//
// Validates that source_ip + project + event_type filters work at the
// REST level, and that /api/audit/facets returns counts for the UI.
//
// Port 7494 — next free slot above 7493.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7494;
let server, tmpDir;

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server not ready');
}

function seedEvents(events) {
  // Write the seeder to a real file to dodge inline-escape pain.
  const dbPath = join(tmpDir, 's.db');
  const scriptPath = join(tmpDir, `seed-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);
  const rows = events.map((e) => [
    e.ts,
    e.type,
    e.project ?? null,
    e.source_ip ?? null,
  ]);
  const py = [
    'import sys, sqlite3, json',
    'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
    'import audit',
    'db = ' + JSON.stringify(dbPath),
    "audit.ensure_events_table(sqlite3.connect(db))",
    'conn = sqlite3.connect(db)',
    'rows = json.loads(' + JSON.stringify(JSON.stringify(rows)) + ')',
    'conn.executemany(',
    '    "INSERT INTO audit_events (ts, event_type, project, source_ip, payload)"',
    '    " VALUES (?, ?, ?, ?, ?) ",',
    '    [(ts, et, proj, ip, "{}") for (ts, et, proj, ip) in rows])',
    'conn.commit()',
    'n = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]',
    'print("SEEDED_ROWS=", n)',
    'conn.close()',
  ].join('\n');
  writeFileSync(scriptPath, py);
  try {
    const r = spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
      [scriptPath],
      { encoding: 'utf8',
        env: { ...process.env, VCM_SERVER_DB: dbPath } });
    if (r.status !== 0) {
      throw new Error('seed failed (rc=' + r.status + '): ' + r.stderr + ' STDOUT=' + r.stdout);
    }
  } finally {
    try { unlinkSync(scriptPath); } catch {}
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-audit-facets-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_AUDIT_LOG: join(tmpDir, 'audit.log') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3
conn = sqlite3.connect('${join(tmpDir, 's.db')}')
conn.execute('DELETE FROM audit_events')
conn.commit(); conn.close()`],
    { encoding: 'utf8',
      env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 's.db') } });
});

describe('audit filtering — query params (ADR-0024)', () => {
  it('GET /api/audit?source_ip=127.0.0.1 returns only matching events', async () => {
    seedEvents([
      { ts: '2026-08-01T00:00:00Z', type: 'auth_failure',   source_ip: '127.0.0.1', project: null },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed',   source_ip: '192.168.1.5', project: 'alpha' },
      { ts: '2026-08-01T00:00:00Z', type: 'auth_failure',   source_ip: '127.0.0.1', project: null },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?source_ip=127.0.0.1`);
    const j = await r.json();
    expect(j.events.length).toBe(2);
    for (const ev of j.events) {
      expect(ev.source_ip).toBe('127.0.0.1');
    }
  });

  it('GET /api/audit?project=alpha returns only matching project', async () => {
    seedEvents([
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed', project: 'alpha' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed', project: 'beta' },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?project=alpha`);
    const j = await r.json();
    expect(j.events.length).toBe(1);
    expect(j.events[0].project).toBe('alpha');
  });

  it('combined filters compose (AND)', async () => {
    seedEvents([
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed',   project: 'alpha', source_ip: '10.0.0.1' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed',   project: 'alpha', source_ip: '10.0.0.2' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_rejected', project: 'alpha', source_ip: '10.0.0.1' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed',   project: 'beta',  source_ip: '10.0.0.1' },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit?project=alpha&source_ip=10.0.0.1&event=state_pushed`);
    const j = await r.json();
    expect(j.events.length).toBe(1);
    expect(j.events[0].project).toBe('alpha');
    expect(j.events[0].source_ip).toBe('10.0.0.1');
    expect(j.events[0].event_type).toBe('state_pushed');
  });
});

describe('audit facets — /api/audit/facets (ADR-0024)', () => {
  it('returns counts grouped by event/project/source_ip', async () => {
    seedEvents([
      { ts: '2026-08-01T00:00:00Z', type: 'auth_failure', project: null,         source_ip: '127.0.0.1' },
      { ts: '2026-08-01T00:00:00Z', type: 'auth_failure', project: null,         source_ip: '127.0.0.1' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed', project: 'alpha',      source_ip: '10.0.0.5' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed', project: 'beta',       source_ip: '10.0.0.5' },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/facets`);
    const j = await r.json();
    expect(j.events.auth_failure).toBe(2);
    expect(j.events.state_pushed).toBe(2);
    expect(j.projects.alpha).toBe(1);
    expect(j.projects.beta).toBe(1);
    expect(j.source_ips['127.0.0.1']).toBe(2);
    expect(j.source_ips['10.0.0.5']).toBe(2);
    expect(j.total).toBe(4);
  });

  it('facets respect the same filters as /api/audit', async () => {
    seedEvents([
      { ts: '2026-08-01T00:00:00Z', type: 'auth_failure', project: null,    source_ip: '127.0.0.1' },
      { ts: '2026-08-01T00:00:00Z', type: 'state_pushed', project: 'alpha', source_ip: '10.0.0.1' },
    ]);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/facets?project=alpha`);
    const j = await r.json();
    // Only the alpha event is counted.
    expect(j.total).toBe(1);
    expect(j.projects.alpha).toBe(1);
    expect(j.projects.beta).toBeUndefined();
    expect(j.events.auth_failure).toBeUndefined();
    expect(j.source_ips['10.0.0.1']).toBe(1);
    expect(j.source_ips['127.0.0.1']).toBeUndefined();
  });

  it('empty DB returns zero-totals object', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/audit/facets`);
    const j = await r.json();
    expect(j.events).toEqual({});
    expect(j.projects).toEqual({});
    expect(j.source_ips).toEqual({});
    expect(j.total).toBe(0);
  });
});

describe('audit page integration (ADR-0024) — project-scoped (ADR-0032)', () => {
  // v0.18.1: /audit was demoted to a 302 redirect (ADR-0032 §v0.18.2
  // update). Audit UI now lives at /projects/<name>/audit. These
  // tests were originally written for the standalone /audit page.
  // They still validate the same DOM markers; just the URL moved.
  it('/projects/<name>/audit renders new Project + Source IP inputs', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/projects/vcm-smoke/audit?lang=en`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Project');
    expect(body).toContain('Source IP');
    expect(body).toContain('filterProject');
    expect(body).toContain('filterSourceIp');
    // The clear button is in the markup.
    expect(body).toMatch(/resetFilters/);
  });

  it('/projects/<name>/audit renders facet chip loop (x-for over facets.events)', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/projects/vcm-smoke/audit?lang=en`);
    const body = await r.text();
    // Alpine template iterating the events facet.
    expect(body).toContain("for=\"t in Object.entries(facets.events");
    expect(body).toContain("toggleFacet");
  });

  it('/projects/<name>/audit URL state includes project + source_ip query params', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/projects/vcm-smoke/audit?project=alpha&source_ip=10.0.0.1&lang=en`);
    expect(r.status).toBe(200);
    const body = await r.text();
    // The Alpine x-model reads URL params at init.
    expect(body).toContain("filterProject: new URLSearchParams(location.search).get('project')");
    expect(body).toContain("filterSourceIp: new URLSearchParams(location.search).get('source_ip')");
  });
});
