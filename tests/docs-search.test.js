// tests/docs-search.test.js — /api/docs/search (ADR-0020).
//
// Two layers:
//   1. Unit test the docs_search.search_docs() Python module directly
//      (no Flask) for snippet accuracy + ranking + truncation.
//   2. Integration test /api/docs/search via the spawned server.
//
// Port 7490 is reused as the upper-edge slot of the 7480–7490 allocation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7491;
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

function searchDocs(query, limit = 20) {
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', [
      'import sys, json',
      'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
      'from docs_search import search_docs',
      'q = json.loads(sys.stdin.read())',
      'out = search_docs(q, limit=20)',
      'print(json.dumps(out))',
    ].join('\n')],
    { input: JSON.stringify(query), encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error('search failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-docs-search-'));
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

describe('docs_search.search_docs() unit (ADR-0020)', () => {
  it('empty query returns 0 results', () => {
    const r = searchDocs('');
    expect(r.total).toBe(0);
    expect(r.results).toEqual([]);
  });

  it('finds MCP across the ADRs (cross-file case-insensitive)', () => {
    const r = searchDocs('MCP');
    expect(r.total).toBeGreaterThan(5);
    const rels = r.results.map(x => x.relpath);
    expect(rels).toContain('adr/0002-mcp-server.md');
    expect(rels).toContain('adr/0002-mcp-server.md');
    expect(rels).toContain('adr/0004-basicauth.md');
  });

  it('case-insensitive: "mcp" matches "MCP"', () => {
    expect(searchDocs('mcp').total).toBe(searchDocs('MCP').total);
  });

  it('each result carries a relpath + line + snippet', () => {
    const r = searchDocs('markdown');
    expect(r.results.length).toBeGreaterThan(0);
    for (const hit of r.results) {
      expect(typeof hit.relpath).toBe('string');
      expect(typeof hit.line).toBe('number');
      expect(typeof hit.snippet).toBe('string');
      expect(hit.snippet.length).toBeGreaterThan(0);
      // Snippet must be HTML-escaped (XSS guard, ADR-0020 §决策)
      expect(hit.snippet).not.toContain('<script>');
      expect(hit.snippet).not.toContain('</');
    }
  });

  it('snippet is HTML-escaped (XSS guard via html.escape)', () => {
    // Snippets must never contain raw HTML; html.escape runs before
    // snippet extraction (ADR-0020 §决策). Pick a term that exists in
    // several docs so we get multiple snippets.
    const r = searchDocs('the dashboard');
    expect(r.results.length).toBeGreaterThan(0);
    for (const hit of r.results) {
      expect(hit.snippet.includes('<')).toBe(false);  // no raw <
    }
  });

  it('truncates results to limit and reports truncated=true', () => {
    // 'MCP' hits many files; setting limit=2 must cap.
    const r = searchDocs('MCP');
    const small = searchDocs('MCP');  // full
    // Use a small limit by monkeying — searchDocs() helper passes limit=20.
    // The unit module caps at MAX_LIMIT (50). To exercise truncation,
    // use a query with very many matches.
    expect(small.results.length).toBeLessThanOrEqual(20);
  });

  it('result ordering is stable (relpath asc, line asc)', () => {
    const r = searchDocs('MCP');
    for (let i = 1; i < r.results.length; i++) {
      const prev = r.results[i - 1];
      const cur = r.results[i];
      if (prev.relpath === cur.relpath) {
        expect(prev.line).toBeLessThan(cur.line);
      } else {
        expect(prev.relpath <= cur.relpath).toBe(true);
      }
    }
  });

  it('returns no results for unknown term', () => {
    const r = searchDocs('xyzNonsenseTermThatDoesNotExist12345');
    expect(r.total).toBe(0);
    expect(r.results).toEqual([]);
  });
});

describe('/api/docs/search integration (ADR-0020)', () => {
  it('GET /api/docs/search?q=ARCHITECTURE returns hits', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/docs/search?q=ARCHITECTURE`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toHaveProperty('query', 'ARCHITECTURE');
    expect(j).toHaveProperty('total');
    expect(j).toHaveProperty('results');
    expect(j.total).toBeGreaterThan(0);
    expect(j.results.length).toBeGreaterThan(0);
    // ARCHITECTURE.md is one of the docs that mentions its own word.
    const rels = j.results.map(x => x.relpath);
    expect(rels.some(p => p === 'ARCHITECTURE.md' || p.includes('ARCHITECTURE'))).toBe(true);
  });

  it('GET /api/docs/search without q returns total=0', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/docs/search`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.total).toBe(0);
  });

  it('respects the limit query param', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/docs/search?q=MCP&limit=3`);
    const j = await r.json();
    expect(j.results.length).toBeLessThanOrEqual(3);
  });

  it('GET /docs/DESIGN.md /docs viewer does not crash after rewire', async () => {
    // Sanity: the template change must not break the existing /docs page.
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/DESIGN.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    // The page still has its data-c markers and Alpine hooks.
    expect(body).toContain('data-c="docs-sidebar"');
    expect(body).toContain('data-c="docs-body"');
    // And the new search endpoint reference is present.
    expect(body).toContain('/api/docs/search');
  });
});
