# ADR-0026 — Bilingual UI (zh / en) with URL + cookie persistence

**状态**: 已实施（v0.14.0）
**日期**: 2026-08-22
**作者**: mm7 / next-agent

## 背景

vcm-server has shipped bilingual **content** since v0.1: the project
documentation (AGENTS.md, HANDOFF.md, ADR headers, design commentary)
mixes zh and en freely because the user works in zh-CN while the
codebase targets an international audience. But the **UI** —
every Jinja2 template under `server/templates/` — has been
English-only since the dashboard's first render.

As of v0.13.0 the dashboard is the canonical place a vcm operator
spends their day (the persistent systemd unit keeps it reachable
all session). Making the UI purely English-only is a real friction
for the project's actual primary user, who would otherwise keep one
eye on a glossary.

This ADR ships the smallest i18n layer that satisfies the request,
without growing into a Babel/POT/PO mozilla-style tooling pipeline
the project's 0-new-deps Charter §8 forbids.

## 决策

Add server-side i18n:

1. **`server/i18n.py`** — single file, ~150 LOC, stdlib-only.
   Contains:
   - `STRINGS: dict[str, dict[str, str]]` — two flat dicts (`en`,
     `zh`), keyed by dotted path (`audit.title`, `nav.cockpit`,
     `kpi.total_projects`). zh falls through to en for any missing
     key (so partial translation works during incremental roll-out).
   - `t(key: str, lang: str = DEFAULT_LANGUAGE) -> str` — string
     lookup; on miss returns the key (so untranslated text shows
     its key, which is grepable).
   - `detect_language(request) -> str` — resolution order: URL
     `?lang=` > cookie `vcm_lang` > `Accept-Language` header
     (sniff first 2 chars) > `DEFAULT_LANGUAGE`. Languages outside
     `LANGUAGES` (currently `['en', 'zh']`) silently fall back
     to default.
   - `LANGUAGES = ['en', 'zh']`,
     `DEFAULT_LANGUAGE = 'zh'` (see "Default language" below).
   - `set_lang_cookie(response, lang)` — sets `vcm_lang` cookie
     (SameSite=Lax, no expiry → session cookie).

2. **Jinja2 integration** — register `t` as a context global so
   every template can `{{ t('audit.title') }}` without explicit
   import. Also inject `lang` so templates don't need to compute
   it. Implementation:

   ```python
   app.jinja_env.globals['t'] = i18n.t
   @app.context_processor
   def inject_lang():
       lang = i18n.detect_language(request)
       response.set_cookie(...)  # only if changed
       return {'lang': lang}
   ```

3. **Nav language toggle** in `_partials/nav.html`:
   "中文 | EN" — current language bolded, the other is a link to
   `?lang=` of the current request path. Clicking persists the
   choice via cookie.

4. **`<html lang="...">`** in `_layout.html` reads the context
   global `lang` so accessibility tools and screen readers see
   the right attribute.

5. **Scope is UI templates only**. Out of scope (v0.15+):
   - CLI command output (`vcm status`, `vcm push`, etc.) — the
     CLI is a different transport; if you want i18n there, add
     `lib/i18n.js` mirroring `server/i18n.py`.
   - MCP server `tools/list` description strings — these are
     read by the LLM agent; English-only is fine because
     English is the canonical LLM training language.
   - Audit event names (`auth_failure`, `state_pushed`, ...) —
     these are stable identifiers; the UI label can translate
     them but the wire format stays English.
   - Python log output.

### Why server-side, not client-side

- The server renders HTML before any JS runs. Client-only i18n
  causes a flash-of-English on first paint (`<html lang>` is
  already set server-side, so this disappears with v0.14.0).
- Tools other than browsers (e.g. MCP clients fetching the
  dashboard) don't run JS at all.
- The 12 templates are Flask-rendered; doing it server-side
  means every route benefits without per-page wiring.

### Why `zh` is the **default** language

The project has always been en+zh in documentation, but the
user's working language is zh-CN (entire conversation history is
zh, AGENTS.md is bilingual leaning zh, HANDOFF.md starts with
"**For the next agent**: this document is the complete state of
the project"). Defaulting to zh makes the new feature
immediately useful without a one-time toggle.

If the next operator prefers English:

```bash
# ~/.vcm/server.env
VCM_DEFAULT_LANGUAGE=en
```

…or the URL `?lang=en` overrides per-page, or the click toggle
sets the cookie. The default is the only knob that needs a
restart; URL+cookie overrides don't.

### Why no `babel`, no `gettext`, no `.po` files

CHARTER §8: 0 new deps. `babel` is 200+ KB and a runtime dep.
Project already imports 3 stdlib modules (`sqlite3`, `http`,
`json`); adding `babel` would be the 4th non-stdlib dependency
in `requirements.txt`. A flat-dict lookup is 8 lines of Python
and covers the 200-odd string slots this project actually
exposes. If the project grows past ~1000 strings or ships 5+
locales, revisit with `babel`.

### Why flat dict, not nested

```python
STRINGS['zh']['audit.title'] = '审计日志'    # yes
STRINGS['zh']['audit']['title'] = '审计日志'  # no
```

A nested dict is more "structured" but harder to grep, harder
to copy-edit in PRs, and harder to spot missing translations
(`STRINGS['en']` keys vs `STRINGS['zh']` keys sets comparison).
Flat dotted keys are the de-facto standard (Rails i18n,
Django, Java properties files all use this).

### Failure modes

| failure                 | behavior                                            |
|-------------------------|-----------------------------------------------------|
| unknown language code   | falls back to `DEFAULT_LANGUAGE`                    |
| unknown string key      | renders the key (e.g. `audit.title`)                |
| partial translation     | zh falls through to en for missing keys             |
| cookie tampered         | cookie value ignored if not in `LANGUAGES`          |
| Accept-Language absent  | falls through to `DEFAULT_LANGUAGE`                 |

### 验收

```bash
# 1. Default page renders in zh
curl -s http://127.0.0.1:7339/ | grep -q '<html lang="zh"'   # ok
curl -s http://127.0.0.1:7339/ | grep -q '驾驶舱'             # ok

# 2. ?lang=en overrides
curl -s 'http://127.0.0.1:7339/?lang=en' | grep -q 'cockpit'  # ok

# 3. Cookie persists
curl -s --cookie 'vcm_lang=en' http://127.0.0.1:7339/audit | grep -q 'Audit log'

# 4. Each translated page renders both keys; test both langs
npm test -- tests/i18n.test.js
# → 24+ tests (3 per page × 8 pages + cookie + URL precedence)

# 5. Hard checks
bash scripts/routine_coverage.sh   # exit 0
```

### 反对意见

**Q: Isn't `default=zh` opinionated for an international project?  
A:** Yes, but configurable via one env var (`VCM_DEFAULT_LANGUAGE=en`).
Defaulting to a value that matches the project's actual primary
user is the same logic as ADR-0014 defaulting to scope=`read`
because that's how every other endpoint starts. The next operator
can flip it.

**Q: Why not Babel / gettext / i18next?  
A:** 4 reasons: (1) CHARTER §8 forbids new runtime deps. (2) The
project has ~200 string slots — under the threshold where a
dedicated i18n library earns its weight. (3) gettext requires
.po/.mo compile steps and a translation pipeline that a 1-locale
documentation assistant wouldn't use. (4) Flat-dict i18n is ~150
LOC and lives in-tree; reviewers can read it during a PR.

**Q: Why now and not in v1.0?  
A:** The persistent runtime in v0.13 turned vcm-server into
"tool the user has open all day." Permanent English UI is a real
friction for the primary user, and the cost is tiny relative
to the v0.13 work. The dot-release distance (0.13 → 0.14) means
the change is reversible if the project grows.

**Q: What about right-to-left languages?  
A:** Not in v0.14 scope. Adding Arabic/Hebrew later needs a
`dir="rtl"` attribute and CSS `*[dir="rtl"]` overrides; no
architectural change required.

### 后果

#### 正面

- vcm-server UI is now usable in two languages natively. The
  primary user's session no longer needs translation in head.
- i18n infrastructure is in place (`server/i18n.py`) for adding
  more locales (es, ja, ko) via just dict addition + a nav line.
- URL `?lang=` is shareable: if the user emails a colleague
  "look at this dashboard", the URL can be `.../?lang=en` and
  the colleague sees English.
- Cookie persistence means the language choice sticks across
  every page navigation, no per-page `?lang=` repetition.

#### 负面 / 风险

- 12 templates to translate — author must keep zh and en dicts
  in sync. Mitigation: i18n.py's "missing zh falls through to
  en" behavior means partial translation is non-fatal. Tests
  pin the zh side per landing page.
- DEBT: This is a 1-author translation. Native zh / en speakers
  should review. v0.15 may issue a "needs review" comment block.
- Adding `VCM_DEFAULT_LANGUAGE` to env vars means
  `~/.vcm/server.env` now has a 5th knob. Documentation in
  README + ONBOARDING must be updated (done in this commit).

### 不做

- ❌ JavaScript i18n (CLI + browser-script paths) — defer to
  v0.15; v0.14 is UI-only.
- ❌ Per-user language preference stored in users.db — that's
  a `/api/users/me` feature for v0.15.
- ❌ Translation memory, fuzzy matching, machine translation —
  far beyond the project's scope.
- ❌ Date / number / currency formatting — `<html lang="zh">`
  sets locale for assistive tech but no number-format conversion
  in JS yet. v0.15 work.
- ❌ Editorial review pass — author is a non-native zh speaker;
  v0.15 will mark every zh string with `[zh+]` so a native
  speaker can scan quickly.
- ❌ .po / .pot extraction — flat dict is in-tree; a real
  translation pipeline is overkill.

## 参考

- [ADR-0001 repowise frontend](0001-repowise-inspired-frontend.md) —
  the URL-state + accessibility commitments this builds on.
- [CHARTER §8](../../CHARTER.md) — local-first, 0 new deps.
- [Flask i18n pattern docs](https://flask.palletsprojects.com/en/3.0.x/patterns/streaming/) —
  `app.jinja_env.globals` is the canonical injection point;
  this ADR uses that path instead of introducing Babel.
- [W3C i18n best practices](https://www.w3.org/International/techniques/authoring-html) —
  sets the `<html lang>` attribute requirement this ADR
  implements.
