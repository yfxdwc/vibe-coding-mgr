// tests/mcp-http.test.js — /mcp (ADR-0021: MCP Streamable HTTP transport).
//
// Verifies the JSON-RPC envelope flows correctly through the Flask
// POST /mcp endpoint without needing the MCP SDK on either side.
//
// Port 7492 is the last slot in the 7480–7490 allocation (HANDOFF §13.1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7492;
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

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-mcp-http-'));
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

async function rpc(method, params = {}, id = 1) {
  const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await r.text();
  if (!text) return { status: r.status, body: null };
  return { status: r.status, body: JSON.parse(text) };
}

describe('POST /mcp JSON-RPC envelope (ADR-0021)', () => {
  it('initialize returns protocolVersion + serverInfo', async () => {
    const { status, body } = await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(status).toBe(200);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe('2024-11-05');
    expect(body.result.serverInfo.name).toBe('vcm-server');
    expect(body.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ping returns empty result', async () => {
    const { body } = await rpc('ping', {}, 2);
    expect(body.result).toEqual({});
    expect(body.id).toBe(2);
  });

  it('tools/list returns all 5 ADR-0002 tools', async () => {
    const { body } = await rpc('tools/list', {}, 3);
    expect(body.result).toHaveProperty('tools');
    const names = body.result.tools.map(t => t.name).sort();
    expect(names).toEqual([
      'vcm_attention', 'vcm_health', 'vcm_overview',
      'vcm_project', 'vcm_skill_matrix',
    ]);
  });

  it('each tool schema has additionalProperties:false', async () => {
    const { body } = await rpc('tools/list', {}, 4);
    for (const t of body.result.tools) {
      expect(t.inputSchema.additionalProperties).toBe(false);
    }
  });

  it('tools/call vcm_health returns a {content:[{type:text,text:json}]} envelope', async () => {
    const { body } = await rpc('tools/call', { name: 'vcm_health', arguments: {} }, 5);
    expect(body.id).toBe(5);
    expect(body.result.content).toBeInstanceOf(Array);
    expect(body.result.content[0].type).toBe('text');
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('vcm-server');
    expect(body.result.isError).toBe(false);
  });

  it('tools/call unknown tool returns isError=true with JSON-RPC -32602', async () => {
    const { body } = await rpc('tools/call', { name: 'vcm_nope', arguments: {} }, 6);
    // -32602 maps to a 400 status per app.py
    expect(body.id).toBe(6);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32602);
  });

  it('unknown method returns JSON-RPC error -32601', async () => {
    const { status, body } = await rpc('tools/bogus', {}, 7);
    expect(body.error.code).toBe(-32601);
    expect(status).toBe(200); // -32601 maps to 200 (Method not found)
  });

  it('notifications/initialized returns 202 with empty body', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(r.status).toBe(202);
    const text = await r.text();
    expect(text).toBe('');
  });

  it('missing jsonrpc: "2.0" returns -32600', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 99, method: 'ping', params: {} }),
    });
    const body = await r.json();
    expect(body.error.code).toBe(-32600);
  });

  it('malformed JSON returns -32700 (Parse error)', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.code).toBe(-32700);
  });

  it('OPTIONS /mcp returns CORS preflight headers', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });
});
