// tests/markdown-render.test.js — server/markdown_render.py (ADR-0018)
// + /docs/<path>.md integration smoke.
//
// Two layers:
//   1. Unit tests for markdown_render.render_markdown() via direct
//      Python invocation (no Flask). Asserts HTML output for headers,
//      bold/italic, inline code, links, fenced code, lists, blockquote,
//      and the XSS escape guard.
//   2. Integration tests that spawn the server, fetch /docs/DESIGN.md,
//      /docs/ARCHITECTURE.md, /docs/adr/0018-*.md and verify the rendered
//      HTML actually appears in the page body (not as double-escaped text).
//
// Port 7489 is unique within the 7480–7490 allocation (see HANDOFF §13.1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7489;
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

function renderMd(src) {
  // Direct unit test of markdown_render.render_markdown() — no Flask.
  // spawnSync so we don't accumulate subprocess handles.
  const r = spawnSync(
    join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', [
      'import sys, json',
      'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
      'import markdown_render',
      'src = json.loads(sys.stdin.read())',
      'sys.stdout.write(markdown_render.render_markdown(src))',
    ].join('\n')],
    { input: JSON.stringify(src), encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(`markdown render failed: ${r.stderr}`);
  }
  return r.stdout;
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-md-render-'));
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

describe('markdown_render.render_markdown() — unit (ADR-0018)', () => {
  it('renders h1 / h2 / h3 / h4 headings', () => {
    expect(renderMd('# Top heading')).toBe('<h1>Top heading</h1>');
    expect(renderMd('## Section heading')).toBe('<h2>Section heading</h2>');
    expect(renderMd('### Sub heading')).toBe('<h3>Sub heading</h3>');
    expect(renderMd('#### Deep heading')).toBe('<h4>Deep heading</h4>');
  });

  it('renders **bold** as <strong>', () => {
    expect(renderMd('this is **bold** text'))
      .toBe('<p>this is <strong>bold</strong> text</p>');
  });

  it('renders *italic* as <em> (without consuming **)', () => {
    expect(renderMd('mix *italic* with **bold** here'))
      .toBe('<p>mix <em>italic</em> with <strong>bold</strong> here</p>');
  });

  it('renders inline `code` as <code>', () => {
    expect(renderMd('use `vcm status` here'))
      .toBe('<p>use <code>vcm status</code> here</p>');
  });

  it('renders [text](url) as <a href>', () => {
    expect(renderMd('see [docs](https://example.com) please'))
      .toBe('<p>see <a href="https://example.com">docs</a> please</p>');
  });

  it('renders ```lang fenced blocks as <pre class="lang-X"><code>', () => {
    // Input lines: '```bash', 'echo hi', '```'
    // body[] = ['echo hi']; '\n'.join = 'echo hi' (no trailing \n).
    const out = renderMd('```bash\necho hi\n```');
    expect(out).toBe('<pre class="lang-bash"><code>echo hi</code></pre>');
  });

  it('renders bullet lists (- and *) as <ul><li>...</li></ul>', () => {
    const out = renderMd('- one\n- two\n- three');
    expect(out).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
  });

  it('renders numbered lists as <ol>', () => {
    const out = renderMd('1. first\n2. second\n3. third');
    expect(out).toBe('<ol><li>first</li><li>second</li><li>third</li></ol>');
  });

  it('renders blockquotes (> single line) as <blockquote>', () => {
    const out = renderMd('> a wise quote');
    expect(out).toBe('<blockquote>a wise quote</blockquote>');
  });

  it('wraps plain lines in <p>', () => {
    expect(renderMd('just a paragraph')).toBe('<p>just a paragraph</p>');
  });

  // XSS guard — the foundational guarantee (ADR-0018 / CHARTER §10).
  it('escapes <script> tags so they never execute', () => {
    const out = renderMd('hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('alert(1)');
    expect(out.startsWith('<p>')).toBe(true);
    expect(out.endsWith('</p>')).toBe(true);
  });

  it('does not produce attribute-quote injection (escape-first)', () => {
    // With html.escape applied first, all `"` become `&quot;`. The output
    // is wrapped in <p>...</p> and contains no raw `onclick=` HTML attr.
    const out = renderMd('" onclick="alert(1)');
    expect(out.startsWith('<p>')).toBe(true);
    expect(out.endsWith('</p>')).toBe(true);
    // The literal word `onclick=` survives, but as inert text inside <p>:
    expect(out).toMatch(/<p>[^<]*onclick=[^<]*<\/p>/);
  });

  it('combines multiple block types in one document', () => {
    const md = [
      '# Title',
      '',
      'intro paragraph with **bold**.',
      '',
      '## Subsection',
      '',
      '- item one',
      '- item two',
      '',
      '```python',
      'x = 1',
      '```',
      '',
      '> a final quote',
    ].join('\n');
    const out = renderMd(md);
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<h2>Subsection</h2>');
    expect(out).toContain('<ul><li>item one</li><li>item two</li></ul>');
    expect(out).toContain('<pre class="lang-python"><code>x = 1</code></pre>');
    expect(out).toContain('<blockquote>a final quote</blockquote>');
  });
});

describe('/docs/ integration — HTML actually renders (not escaped)', () => {
  it('GET /docs/ARCHITECTURE.md renders <h1>ARCHITECTURE</h1> for real', async () => {
    // Regression test for the pre-v0.9.0 bug where the body was wrapped
    // in <pre>{{ body }}</pre>, which Jinja2 autoescaped, hiding all the
    // rendered HTML as visible text. After the template fix (`{{ body | safe }}`),
    // headings appear as actual <h1> elements.
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/ARCHITECTURE.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('<h1>ARCHITECTURE</h1>');
    expect(body).toContain('<h2>Components</h2>');
    // No raw heading chars escaped to entities where they shouldn't be.
    expect(body).not.toContain('&lt;h1&gt;ARCHITECTURE');
  });

  it('GET /docs/DESIGN.md renders at least one heading as <h1> or <h2>', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/DESIGN.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toMatch(/<h[12]>/);
    // Must NOT contain double-escaped heading chars.
    expect(body).not.toContain('&lt;h1&gt;');
  });

  it('GET /docs/adr/0018-docs-markdown-rendering.md renders the ADR body', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/adr/0018-docs-markdown-rendering.md`);
    expect(r.status).toBe(200);
    const body = await r.text();
    // Title in source is "ADR-0018 — Markdown rendering for `/docs` view (replace `<pre>`)"
    // Heading text is whatever follows "# " until end-of-line.
    expect(body).toMatch(/<h1>ADR-0018/);
    // **stdlib** in source — bold must render as <strong>.
    expect(body).toMatch(/<strong>[^<]*stdlib[^<]*<\/strong>/);
  });

  it('GET /docs/<any> keeps rendered HTML inside .markdown-body', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/ARCHITECTURE.md`);
    const body = await r.text();
    // The template renders body via <div class="markdown-body">…</div>
    expect(body).toContain('class="markdown-body"');
    // The wrap div should contain real <h1> (not &lt;h1&gt;).
    const wrap = body.match(/<div class="markdown-body">([\s\S]*?)<\/div>/);
    expect(wrap).not.toBeNull();
    expect(wrap[1]).toContain('<h1>');
  });

  it('fenced code blocks render to <pre><code> in the page', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/docs/ARCHITECTURE.md`);
    const body = await r.text();
    // ARCHITECTURE.md starts with a ``` fenced code block — it should
    // produce at least one <pre> (excluding any escaped version).
    const preMatches = body.match(/<pre[\s>]/g) || [];
    expect(preMatches.length).toBeGreaterThanOrEqual(1);
    // And the page must NOT contain a double-escaped &lt;pre&gt;
    expect(body).not.toContain('&lt;pre&gt;');
  });

  // XSS sanity across the whole /docs/ tree (HANDOFF §11.1 test category).
  it('sweep: no /docs page leaks <script> from markdown source', async () => {
    const idx = await fetch(`http://127.0.0.1:${PORT}/api/docs/index`);
    expect(idx.status).toBe(200);
    const { files } = await idx.json();
    for (const f of files) {
      const r = await fetch(`http://127.0.0.1:${PORT}/docs/${f.relpath}`);
      expect(r.status, `failed for ${f.relpath}`).toBe(200);
      const body = await r.text();
      // The shared layout template (used by /docs and many other pages)
      // contains exactly 2 <script> tags: Alpine.js loader and the
      // per-page docsPage() block. .md source must NOT inject more.
      const docScripts = (body.match(/<script/g) || []).length;
      expect(
        docScripts,
        `extra <script> in ${f.relpath}: ${docScripts} > 2 layout baseline`,
      ).toBeLessThanOrEqual(2);
    }
  });
});
