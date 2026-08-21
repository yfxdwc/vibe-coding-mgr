// tests/sse.test.js — Server-Sent Events live update channel (ADR-0007)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7402;
let server, tmpDir;

async function waitReady(timeoutMs = 30000) {
  for (let i = 0; i < timeoutMs / 250; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

// Read SSE events into an array. Stops when `predicate(ev)` returns true
// or after `max` events. Returns the captured events.
async function collectEvents(url, predicate, max = 5) {
  const events = [];
  const ctl = new AbortController();
  const timeout = new Promise((res) => setTimeout(() => res(null), 35000));
  const work = (async () => {
    try {
      const r = await fetch(url, { signal: ctl.signal });
      const dec = new TextDecoder();
      const t = r.body.getReader();
      let buf = '';
      while (events.length < max) {
        const { value, done } = await t.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, i); buf = buf.slice(i + 2);
          const evname = (ev.split('\n').find((l) => l.startsWith('event:')) || '').slice(6).trim();
          const data = (ev.split('\n').find((l) => l.startsWith('data:')) || '').slice(5).trim();
          events.push({ evname, data });
          if (predicate && predicate({ evname, data })) return;
        }
      }
    } catch (e) { /* ignore abort */ }
  })();
  const winner = await Promise.race([work, timeout]);
  if (winner === null) {
    ctl.abort();
    try { await work; } catch {}
  }
  return events;
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-sse-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT), VCM_SERVER_DB: join(tmpDir, 's.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stderr.on('data', () => {});
  await waitReady();
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('SSE dashboard stream (ADR-0007)', () => {
  it('emits hello event on connect', async () => {
    const events = await collectEvents(
      `http://127.0.0.1:${PORT}/api/dashboard/stream`,
      (e) => e.evname === 'hello', 3,
    );
    expect(events.find((e) => e.evname === 'hello')).toBeDefined();
  });

  it('emits initial attention_changed snapshot on connect', async () => {
    const events = await collectEvents(
      `http://127.0.0.1:${PORT}/api/dashboard/stream`,
      (e) => e.evname === 'attention_changed', 3,
    );
    const snap = events.find((e) => e.evname === 'attention_changed');
    expect(snap).toBeDefined();
    const j = JSON.parse(snap.data);
    expect(Array.isArray(j.items)).toBe(true);
  });

  it('emits heartbeat within 16s', async () => {
    const events = await collectEvents(
      `http://127.0.0.1:${PORT}/api/dashboard/stream`,
      (e) => e.evname === 'heartbeat', 3,
    );
    expect(events.find((e) => e.evname === 'heartbeat')).toBeDefined();
  }, 35000);

  it('emits project_push after POST /api/collect', async () => {
    // Subscribe FIRST, then post.
    const eventsP = collectEvents(
      `http://127.0.0.1:${PORT}/api/dashboard/stream`,
      (e) => e.evname === 'project_push', 5,
    );
    // Give the SSE subscription a head-start
    await new Promise((r) => setTimeout(r, 800));
    await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: 'sse-fixture', path: '/tmp/sse-fixture' },
        generated_at: new Date().toISOString(),
        vcm_version: '0.4.0',
        governance: { agents_md_present: true, charter_md_present: true,
                      skills_count: 0, adrs_count: 0, tds_count: 0,
                      post_mortems_count: 0, skills_registered: [] },
        health: {},
        git: { head_commit: 'f00d', branch: 'main', dirty: false,
               last_commit_at: new Date().toISOString() },
      }),
    });
    const events = await eventsP;
    const push = events.find((e) => e.evname === 'project_push');
    expect(push, 'did not see project_push').toBeDefined();
    const j = JSON.parse(push.data);
    expect(j.name).toBe('sse-fixture');
  }, 35000);

  it('multiple subscribers receive the same event', async () => {
    const sub1 = collectEvents(`http://127.0.0.1:${PORT}/api/dashboard/stream`,
                                (e) => e.evname === 'project_push', 5);
    const sub2 = collectEvents(`http://127.0.0.1:${PORT}/api/dashboard/stream`,
                                (e) => e.evname === 'project_push', 5);
    await new Promise((r) => setTimeout(r, 1200));
    await fetch(`http://127.0.0.1:${PORT}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '0.1.0',
        project: { name: 'sse-multi', path: '/tmp/sse-multi' },
        generated_at: new Date().toISOString(),
        vcm_version: '0.4.0',
        governance: { skills_count: 0, adrs_count: 0, tds_count: 0,
                      post_mortems_count: 0, skills_registered: [] },
        health: {},
        git: { head_commit: 'beef', branch: 'main', dirty: false,
               last_commit_at: new Date().toISOString() },
      }),
    });
    const [ev1, ev2] = await Promise.all([sub1, sub2]);
    expect(ev1.find((e) => e.evname === 'project_push')).toBeDefined();
    expect(ev2.find((e) => e.evname === 'project_push')).toBeDefined();
  }, 35000);
});
