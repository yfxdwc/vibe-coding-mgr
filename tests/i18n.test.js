// tests/i18n.test.js — bilingual zh/en UI (ADR-0026).
//
// Verifies:
//   1. Default (no ?lang=, no cookie, no Accept-Language) renders zh.
//   2. ?lang=en forces English on every page.
//   3. ?lang=ja (or any unknown code) falls back to default (zh).
//   4. vcm_lang cookie persists the choice across requests.
//   5. Accept-Language: en wins when no other source.
//   6. Each landing page exposes translated strings in both langs.
//   7. The nav language-toggle link points at ?lang= with the alt code.
//   8. <html lang="..."> reflects the active language.
//
// Test server port 7495 (next free after audit-facets at 7494).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7495;
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

async function get(path, opts = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, opts);
  return r;
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-i18n-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env,
           VCM_SERVER_PORT: String(PORT),
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

describe('i18n / language detection (ADR-0026)', () => {
  it('default language (no signals) is zh', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/`);
    const body = await r.text();
    expect(body).toMatch(/<html lang="zh"/);
    expect(body).toContain('驾驶舱');
  });

  it('?lang=en forces English on /', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/?lang=en`);
    const body = await r.text();
    expect(body).toMatch(/<html lang="en"/);
    expect(body).toContain('cockpit');
    // zh string should NOT also be present in nav links.
    expect(body).not.toContain('>驾驶舱<');
  });

  it('?lang=zh forces Chinese explicitly', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/?lang=zh`);
    const body = await r.text();
    expect(body).toMatch(/<html lang="zh"/);
    expect(body).toContain('驾驶舱');
  });

  it('unknown language code falls back to default (zh)', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/?lang=ja`);
    const body = await r.text();
    // ja is not in LANGUAGES -> default to zh.
    expect(body).toMatch(/<html lang="zh"/);
  });

  it('Accept-Language: en wins when no other signal', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const body = await r.text();
    expect(body).toMatch(/<html lang="en"/);
    expect(body).toContain('cockpit');
  });

  it('cookie vcm_lang=zh persists across requests', async () => {
    // First request sets the cookie.
    const r1 = await fetch(`http://127.0.0.1:${PORT}/`);
    expect(r1.headers.get('set-cookie') || '').toMatch(/vcm_lang=zh/);
    // Second request from a cookie jar keeps zh even when ?lang=en
    // is NOT supplied.
    const r2 = await fetch(`http://127.0.0.1:${PORT}/audit`, {
      headers: { Cookie: 'vcm_lang=zh' },
    });
    const body2 = await r2.text();
    expect(body2).toMatch(/<html lang="zh"/);
    expect(body2).toContain('审计日志');
  });

  it('cookie vcm_lang=en with empty ?lang= stays en', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/audit`, {
      headers: { Cookie: 'vcm_lang=en' },
    });
    const body = await r.text();
    expect(body).toMatch(/<html lang="en"/);
    expect(body).toContain('Audit log');
  });

  it('URL ?lang= takes precedence over cookie', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/audit?lang=en`, {
      headers: { Cookie: 'vcm_lang=zh' },
    });
    const body = await r.text();
    expect(body).toMatch(/<html lang="en"/);
  });
});

describe('i18n / per-page translation', () => {
  // Each landing page should expose at least one translated string
  // in each language, so a partial-translation regression is caught.
  const PAGES = [
    { path: '/',          en: 'cockpit',     zh: '驾驶舱' },
    { path: '/audit',     en: 'Audit log',   zh: '审计日志' },
    { path: '/drift',     en: 'drift',       zh: '漂移' },
    { path: '/trends',    en: 'Governance',  zh: '治理' },
    { path: '/leaderboard', en: 'leaderboard', zh: '排行榜' },
    { path: '/skills',    en: 'Skill',       zh: '技能' },
    { path: '/settings',  en: 'settings',    zh: '设置' },
  ];

  for (const { path, en, zh } of PAGES) {
    it(`${path} renders English when ?lang=en`, async () => {
      const r = await get(`${path}?lang=en`);
      const body = await r.text();
      expect(r.status).toBe(200);
      expect(body).toContain(en);
    });
    it(`${path} renders Chinese by default`, async () => {
      const r = await get(path);
      const body = await r.text();
      expect(r.status).toBe(200);
      expect(body).toContain(zh);
    });
  }
});

describe('i18n / nav language toggle', () => {
  it('zh page exposes EN as a link with ?lang=en in href', async () => {
    const r = await get('/');
    const body = await r.text();
    // The toggle is a link titled "switch to en".
    expect(body).toMatch(/href="[^"]*lang=en[^"]*"[^>]*title="switch to en"/);
  });

  it('en page exposes 中文 as a link with ?lang=zh in href', async () => {
    const r = await get('/?lang=en');
    const body = await r.text();
    expect(body).toMatch(/href="[^"]*lang=zh[^"]*"[^>]*title="switch to zh"/);
  });

  it('current language is shown without a link (no toggle out)', async () => {
    const r = await get('/?lang=en');
    const body = await r.text();
    // The English label "English" should appear as the current
    // indicator (no anchor tag around it).
    expect(body).toMatch(/<span class="nav-lang-current"[^>]*>\s*English\s*<\/span>/);
  });
});

describe('i18n / unit-level detect_language', () => {
  it('module imports cleanly and exposes the documented API', async () => {
    const r = spawnSync(
      join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['-c', [
        'import sys, json',
        'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
        'import i18n',
        'r = {',
        '  "LANGUAGES": i18n.LANGUAGES,',
        '  "DEFAULT_LANGUAGE": i18n.DEFAULT_LANGUAGE,',
        '  "en_keys": len(i18n.STRINGS["en"]),',
        '  "zh_keys": len(i18n.STRINGS["zh"]),',
        '}',
        'print(json.dumps(r))',
      ].join('\n')],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout.trim());
    expect(j.LANGUAGES).toEqual(['en', 'zh']);
    expect(j.DEFAULT_LANGUAGE).toBe('zh');
    // EN and ZH must keep key sets in lockstep.
    expect(j.en_keys).toBe(j.zh_keys);
    expect(j.en_keys).toBeGreaterThan(50);
    // Missing-key in zh falls through to en (or returns the key).
    const fallthrough = spawnSync(
      join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['-c', [
        'import sys; sys.path.insert(0, ' +
          JSON.stringify(join(VCM_ROOT, 'server')) + ')',
        'import i18n',
        'print(i18n.t("audit.title", lang="zh"))',
        'print(i18n.t("untranslated.key", lang="zh"))',
      ].join('\n')],
      { encoding: 'utf8' },
    );
    expect(fallthrough.status).toBe(0);
    const [, missing] = fallthrough.stdout.trim().split('\n');
    // Missing key returns the key itself — greppable.
    expect(missing).toBe('untranslated.key');
  });
});

describe('i18n / v0.14.1 comprehensive coverage', () => {
  // ADR-0026 §验收: zh mode must NOT contain English fallback strings
  // for any *translated* UI label. We check the per-page translation
  // pairs introduced in v0.14.1.

  const COMPREHENSIVE = [
    // page -> [expected-zh-substring, expected-en-substring]
    { path: '/',                zh: ['多项目驾驶舱', '项目', '驾驶舱'],     en: ['Multi-project cockpit', 'Projects', 'cockpit'] },
    { path: '/audit',           zh: ['审计日志', '事件', '详情'],          en: ['Audit log', 'Event', 'Detail'] },
    { path: '/drift',           zh: ['漂移', '分数', '项目'],              en: ['Drift', 'Score', 'Project'] },
    { path: '/trends',          zh: ['合规度（0..1）', '有数据的桶', '技债数'],  en: ['Compliance (0..1)', 'Buckets with data', 'Tech debt count'] },
    { path: '/leaderboard',     zh: ['技债', '合规度', '新鲜度'],           en: ['Tech debt', 'Compliance', 'Recency'] },
    { path: '/skills',          zh: ['技能注册表', '独立技能', '共享（≥ 2 个项目）'], en: ['Skill registry', 'Unique skills', 'Shared (≥ 2 projects)'] },
    { path: '/peers',           zh: ['节点', '最近抓取', '星标'],            en: ['Peers', 'Last fetched', 'Stars'] },
    { path: '/settings',        zh: ['服务器设置', '数据库', '运行时'],      en: ['Server settings', 'Database', 'Runtime'] },
    { path: '/projects/demo',   zh: ['基本信息', '已存在'],                  en: ['Quick facts', 'present'] },
  ];

  for (const { path, zh, en } of COMPREHENSIVE) {
    it(`${path} (?lang=zh) shows every v0.14.1 zh label`, async () => {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}?lang=zh`);
      const body = await r.text();
      expect(r.status).toBe(200);
      for (const s of zh) {
        expect(body).toContain(s);
      }
    });
    it(`${path} (?lang=en) shows every v0.14.1 en label`, async () => {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}?lang=en`);
      const body = await r.text();
      expect(r.status).toBe(200);
      for (const s of en) {
        expect(body).toContain(s);
      }
    });
  }

  it('zh mode does not leak English labels on the cockpit', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/?lang=zh`);
    const body = await r.text();
    // English labels that should NOT appear in zh mode for cockpit:
    // - "Multi-project cockpit" (en title)
    // - "Projects" (en kpi label)
    // - "Audit log" / "Drift" / etc. (en nav labels)
    expect(body).not.toContain('Multi-project cockpit');
    expect(body).not.toContain('Audit log');
    expect(body).not.toContain('>Audit log<');
  });

  it('zh mode does not leak English labels on the leaderboard', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/leaderboard?lang=zh`);
    const body = await r.text();
    expect(body).not.toContain('Tech debt');
    expect(body).not.toContain('Compliance');
    expect(body).not.toContain('Recency');
  });

  it('zh mode does not leak English labels on the trends', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/trends?lang=zh`);
    const body = await r.text();
    expect(body).not.toContain('Compliance (0..1)');
    expect(body).not.toContain('Tech debt count');
    expect(body).not.toContain('Buckets with data');
  });

  it('zh mode does not leak English labels on skills page', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/skills?lang=zh`);
    const body = await r.text();
    expect(body).not.toContain('Unique skills');
    expect(body).not.toContain('Shared (≥ 2 projects)');
    expect(body).not.toContain('Most popular');
  });

  it('zh mode does not leak English labels on settings page', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/settings?lang=zh`);
    const body = await r.text();
    expect(body).not.toContain('Database');
    expect(body).not.toContain('Design tokens');
    expect(body).not.toContain('Runtime');
  });

  it('zh mode does not leak English labels on peers page', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/peers?lang=zh`);
    const body = await r.text();
    expect(body).not.toContain('Watch list');
    expect(body).not.toContain('Stars');
    expect(body).not.toContain('Last fetched');
  });
});

describe('i18n / Alpine JS bridge (window.t)', () => {
  it('every page embeds the i18n JS catalog in window.__vcm_i18n__', async () => {
    const pages = ['/', '/audit', '/drift', '/trends', '/leaderboard',
                   '/skills', '/peers', '/settings'];
    for (const p of pages) {
      const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
      const body = await r.text();
      expect(body, p).toContain('window.__vcm_i18n__');
      // The bridge must reference the catalog as a JSON object.
      // We don't assert specific keys here — just that the script tag
      // is present and contains a quoted key from the catalogue.
      expect(body, p).toMatch(/window\.__vcm_i18n__\s*=\s*\{/);
    }
  });

  it('window.t is wired up with a fallback to the key itself', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/`);
    const body = await r.text();
    expect(body).toContain('window.t = function(key)');
    // It must use the dict for lookup, returning the key as fallback.
    expect(body).toMatch(/\(dict\s*&&amp;\s*dict\[key\]\)\s*\|\|\s*key|\(dict\s*&&\s*dict\[key\]\)\s*\|\|\s*key/);
  });

  it('en catalog carries every key (>= 350 after v0.14.1 expansion)', async () => {
    const r = spawnSync(
      join(VCM_ROOT, '.venv', 'bin', 'python3'),
      ['-c', [
        'import sys, json',
        'sys.path.insert(0, ' + JSON.stringify(join(VCM_ROOT, 'server')) + ')',
        'import i18n',
        'print(json.dumps({"en": len(i18n.STRINGS["en"]), "zh": len(i18n.STRINGS["zh"])}))',
      ].join('\n')],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout.trim());
    expect(j.en).toBeGreaterThanOrEqual(350);
    expect(j.zh).toBe(j.en);
  });
});
