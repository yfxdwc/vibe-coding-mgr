# CHANGELOG

vibe-coding-mgr (vcm) follows a deliberate, design-disciplined release cadence.
Every feature has a written ADR before code lands. This file captures the
user-visible history; [docs/ROADMAP.md](docs/ROADMAP.md) tracks the future.

The format is loosely: version, date, summary, list of changes, and a
'design notes' block pointing to the ADRs that drove the work.

---

## v0.14.1 — 2026-08-22

**Comprehensive bilingual coverage. Every user-visible string on every
template now flows through `t()`. Alpine.js components reach the same
catalog via `window.t(key)`. Same ADR-0026, no new ADR needed.**

### Added

- **+160 i18n keys** in `server/i18n.py`. Catalogue is now **380
  keys per language, balanced en↔zh** (was 220 in v0.14.0).
  New sections: `cockpit.kpi.*`, `cockpit.matrix.col.*`,
  `cockpit.activity.*`, `cockpit.attention.*`, `cockpit.skills.*`,
  `trends.option.*`, `trends.kpi.*`, `leaderboard.col.*`,
  `leaderboard.sort.label.*`, `peers.col.*`, `skills.kpi.*`,
  `skills.tabs.*`, `skills.matrix.*`, `skills.coverage.*`,
  `project.kpi.*`, `project.overview.*`, `project.governance.*`,
  `project.health.*`, `project.history.*`, `settings.tokens.*`,
  `settings.docs.*`, `docs.search_input`, `audit.facet.*`,
  `nav.stats.*`.
- **Alpine JS bridge** in `server/templates/_layout.html`. After
  every page renders, two new `<script>` blocks inject:
    - `window.__vcm_i18n__ = { ... }` — the active language's
      merged catalog (zh-missing falls through to en at server side).
    - `window.t = function(key) { return (dict && dict[key]) || key; }`
      — Alpine components can call `window.t('cockpit.kpi.projects')`
      directly inside `x-text="..."` expressions, including
      pluralization via ternary on counts.
- **`cockpit.matrix.col.tree_dirty` / `tree_clean`** keys for
  the "⚠ dirty" / "✓ clean" badge text inside dashboard rows
  (was hard-coded English before).
- **`settings.tokens.*` keys** for the design-tokens blurb on
  `/settings` — three-sentence block with CSS class names
  intentionally kept literal, only the prose is translated.

### Changed

- **Per-page translation tests grew from 14 to 26 → +27 new
  assertions** in `tests/i18n.test.js`. New section
  "i18n / v0.14.1 comprehensive coverage" asserts each translated
  string is present in both languages for 9 pages (zh + en pair),
  plus 6 "no English leakage" assertions on the most-visited pages,
  plus 3 JS-bridge assertions (catalog embedded, `window.t` wired,
  catalogue size ≥ 350).
- **`tests/templates.test.js`** — the `<script>` count baseline
  for `/docs/DESIGN.md` bumped 2 → 4 (matches the new bridge tags).
  The XSS guard now iterates `<script>...</script>` blocks and
  asserts no block contains a `/docs/...md` path (the prior regex
  was positionally fragile).
- **`tests/markdown-render.test.js`** — same script-count baseline
  bump 2 → 4 across the docs sweep.
- **`tests/leaderboard.test.js`** — the "Sorted by" assertion now
  fetches with `?lang=en` (was incidentally passing in zh because
  "Sorted by" used to be the en literal; the test wasn't
  intentionally language-aware).
- **Templates translated end-to-end**: `dashboard.html`,
  `trends.html`, `leaderboard.html`, `peers.html`, `skills.html`,
  `project.html`, `settings.html`, `_docs.html`, `_partials/nav.html`.
  Only file paths (`/api/health`, `docs/DESIGN.md`, `TECH_DEBT.md`,
  `AGENTS.md`, etc.) and CSS class names remain untranslated — by
  design (they're identifiers, not prose).

### Tests

- 368/368 (was 341 → +27 in `tests/i18n.test.js`; 3 pre-existing
  test files touched for i18n compatibility)
- 26 ADRs (unchanged — same scope as 0026)
- 29 test files (unchanged)

### Design notes

- **Two-script bridge, not one.** Splitting `__vcm_i18n__` and
  `window.t` into two `<script>` tags keeps the data (which is
  big — ~12 KB inline JSON) separable from the runtime function,
  so we can swap implementations later (e.g. dynamic fetch for
  unbuilt keys) without rewriting templates.
- **Alpine's `x-text` is the only JS-side touchpoint.** We did
  not introduce a `t-attr` plugin or string-substitution library.
  Pluralization is done with `x-text="n !== 1 ? window.t('X_plural') : window.t('X_singular')"`
  — three extra characters per spot; nothing else.
- **zh-default retention.** Per ADR-0026 §设计决定, the user's
  locale default stays `zh`. The English toggle remains a single
  click away.

---



**Bilingual UI release. Every template now renders in zh (default) or en;
URL `?lang=`, cookie persistence, and Accept-Language resolution;
zero new runtime deps (ADR-0026).**

### Added

- **`server/i18n.py`** — single-file bilingual i18n module.
  84 flat-dict keys per language, `_lookup` falls through zh→en
  on missing keys. `t(key)` reads the active request's lang via
  Flask's `@template_global`. `detect_language(request)` resolves
  URL `?lang=` > cookie `vcm_lang` > Accept-Language > default.
  `lang_url(target_lang)` returns a URL preserving the current
  path + query, with `?lang=X` swapped in. `set_lang_cookie`
  persists the choice for 1 year (SameSite=Lax).
- **Jinja2 integration** — `i18n.register_jinja(app)` exposes
  `t` and `lang_url` as `template_global`s and `lang` as a
  context variable. Every template can now `{{ t('audit.title') }}`
  and `<html lang="{{ lang }}">`.
- **Nav language toggle** (`_partials/nav.html`) — one `<a>` per
  non-active language with href=`{{ lang_url(L) }}`. Active
  language shows as `<span class="nav-lang-current">` (no link).
  Pills styled in `static/css/dashboard.css`.
- **`VCM_DEFAULT_LANGUAGE`** env var (default `zh`): switch the
  whole server to English with `VCM_DEFAULT_LANGUAGE=en` in
  `~/.vcm/server.env`.

### Translated

12 templates now use `{{ t('key') }}` for every user-visible
string: `_layout.html`, `_partials/nav.html`, `audit.html`,
`dashboard.html`, `drift.html`, `leaderboard.html`, `peers.html`,
`project.html`, `settings.html`, `skills.html`, `trends.html`,
`_docs.html` (the last is nav-linked only).

### Tests

- 341/341 (was 315 → +26 in `tests/i18n.test.js`)
- 26 ADRs (was 25 → +1: 0026)
- 29 test files

### Design notes

- **Server-side, not client-side.** Jinja env globals can't see
  per-request state, so `t` is registered as `@template_global`
  instead of a plain `jinja_env.globals['t']`. This is the
  difference between "first render shows zh" and "first render
  flashes English then flips to zh."
- **Default language is zh.** Matches the project's actual
  primary user. One env var flips it (`VCM_DEFAULT_LANGUAGE=en`).
- **Cookie persistence is incidental.** Users click the toggle
  once and stick with their choice.
- **7 pre-existing English-text tests** updated to append
  `?lang=en` (tests/audit-facets, drift, trends). API-level
  tests don't care about UI language.

---

## v0.13.0 — 2026-08-21

**First persistent-runtime release. vcm-server now installs as a
systemd user unit (ADR-0025), survives logout + reboot + crashes,
no root required, zero new deps.**

### Added

- **`scripts/vcm-server.service`** (ADR-0025) — systemd user unit
  template. Type=simple, Restart=on-failure with RestartSec=5,
  StartLimitBurst=5 (cap restart rate to 5/60s, no zombie flap),
  Lightweight hardening (NoNewPrivileges, ProtectHome=read-only,
  PrivateTmp, MemoryDenyWriteExecute, LockPersonality,
  RestrictRealtime, RestrictSUIDSGID, UMask=0077).
- **`scripts/vcm-server.env.example`** — declarative env-file
  template. The actual `~/.vcm/server.env` is generated from this
  on first install (`chmod 600`); overrides for `VCM_SERVER_PORT`,
  `VCM_SERVER_DB`, `VCM_AUDIT_LOG`, `VCM_AUTH_*`, `VCM_AUDIT_DISABLED`,
  `VCM_PEERS`.
- **`scripts/install-service.sh`** — one-shot installer. Picks a
  free port in 7338..7399 (auto-skip if 7338 is taken, e.g. by
  `repowise serve`), generates `~/.vcm/server.env` with the chosen
  port, renders the .service file with substituted paths,
  `systemctl --user daemon-reload`, `enable --now`, then
  verifies via `/api/health`. Idempotent; `--dry-run` for tests.
  Enables `loginctl enable-linger $USER` so the unit survives SSH
  logout.
- **`scripts/uninstall-service.sh`** — stops, disables, and removes
  the unit (preserves `server.env` and DB files; re-install is a
  no-op). `--dry-run` for tests.
- **README.md** — new "Running persistently (systemd user unit)"
  section between the manual-launch `vcm-server` block and
  "Install". One command (`bash scripts/install-service.sh`) plus
  a status / logs / edit-config / uninstall block.
- **`docs/ONBOARDING.md` Step 7b** — same docs as README, framed
  for first-time-setup users.

### Tests

- 312/312 (was 289 → +23 in `tests/daemon.test.js`)
- 25 ADRs (was 24 → +1: 0025)
- 28 test files
- All 6 hard checks green

### Design notes

- The `.service` file is the only manifest — there is no
  `supervisord.conf`, no `pm2 ecosystem`, no `.plist`.
  Review-able, diff-able, version-controlled in-tree.
- The daemon is OS-level, around the process, not inside it.
  ADR-0022's "no in-process daemon complexity" stays —
  vcm-server is still a request/response HTTP server with
  no background threads. systemd can wrap any process.
- macOS launchd `.plist` and Windows service are explicitly
  out of scope (see ADR-0025 §"不做"). macOS users fall back
  to `tmux`; Windows users fall back to WSL or manual.

### Fixed (post-release)

- **`StartLimit*` directives moved `[Service]` → `[Unit]`**. Per
  `man systemd.service` they belong in `[Unit]`; systemd 255
  silently ignores them in `[Service]`, which would have
  defeated the no-zombie-flap guarantee on a real crash loop.
  Caught on first live install via the journal warning
  `Unknown key name 'StartLimitIntervalSec' in section
  'Service'`. Locked in via a positional regex test in
  `tests/daemon.test.js` (a plain `indexOf('[Service]')` was
  wrong because the .service comment block also mentions
  that literal text).
- **`install-service.sh` retry-based health probe**. Replaced
  the single `sleep 1; curl --max-time 3` with a 10-iteration
  retry loop (~5s budget) so the install survives systemd's
  `active` marker landing BEFORE the in-process Flask bind +
  schema bootstrap + audit directory creation. Accepts both
  `status: ok` (≤ v0.12) and `status: healthy` (v0.13+) shapes.
  On final exhaust, looks up `systemctl --user is-active` and
  only exits 1 if the unit is in `failed` state — idempotent
  installs must not regress a slow first boot.

---

## v0.12.0 — 2026-08-21

**Closes HANDOFF §11 (audit filtering UI). ADR-0024 ships facet chips,
project + source-IP query params on `/api/audit` and `/api/audit/facets`.**

### Added

- **`/api/audit/facets[?project=&event=&source_ip=&since=]`** (ADR-0024) —
  returns `{events, projects, source_ips, total}` counts grouped by each
  field, respecting the same filter semantics as `/api/audit`. SQL is
  deterministic: each facet query builds its own `WHERE` from the base
  filters + a per-facet `IS NOT NULL` clause, no fragile
  "prepend-AND-if-empty" string splicing.
- **`/api/audit?source_ip=` + `?project=`** on the existing list endpoint
  (ADR-0024) — combined with `?event=` and `?since=`, all filters compose
  with AND. SQLite path + JSONL fallback both honour `source_ip` now
  (previously the parameter was accepted but ignored — see Fixed below).
- **`/audit` view (ADR-0024)** — Project + Source IP inputs alongside the
  existing Event type + Since + Limit inputs. Filter changes sync to the
  URL via `applyFilter()`; facet chips render under the form and toggle
  their own matching filter via `toggleFacet()`; the clear button calls
  `resetFilters()`. All Alpine state stays driven by `load()` which
  fires in parallel against `/api/audit` + `/api/audit/facets`.
- **`docs/adr/0024-audit-filtering-ui.md`** — design rationale; mirrors
  the existing 0020–0023 layout.

### Fixed

- **Root cause: `/api/audit?source_ip=` returned 0 events.** Two related
  defects:
  1. `_read_sqlite(since, event_type, project, limit, offset)` referenced
     `source_ip` inside the body but did not accept it as a parameter,
     so Python raised `NameError` on every filtered read and the route
     silently fell back to JSONL. The fallback was empty in tests
     (VCM_AUDIT_LOG pointed at a tmp path), producing `events=[]`.
  2. The JSONL fallback path itself also dropped `source_ip`.
  Both signatures now take `source_ip` and apply it as an additional
  equality filter. Hand-tested against `pytest`-style reproduction:
  `read_events(source_ip='127.0.0.1')` returns the 2 expected events.
- **`server/audit.py:facets()` SQL was fragile.** The previous helper
  alternated between "WHERE" and " AND " joiners based on whether the
  base filter clause was non-empty, which produced `WHERE ... AND ...
  IS NOT NULL` glitch in some filter combinations. Rewrite builds
  `wh_clause` once per call from `base_conds + extra_conds` — deterministic.
- **`server/templates/_docs.html`** — see v0.10.0 entries; this release
  carries forward with no further edits to that file.

### Tests

- 289/289 (was 280 → +9 in `tests/audit-facets.test.js`)
- 24 ADRs (was 23 → +1: 0024 audit-filtering-ui)

### Design notes

- All four new endpoints honour CHARTER §8 (offline-first, 0 new deps);
  facets is one extra SQLite `GROUP BY` per filter, no caching needed
  for typical audit volumes.
- The Alpine `filtered` array is now a plain property initialised in
  `init()` / mutated by `load()`, not a `get/set` accessor — same
  pattern as `_docs.html` (HANDOFF §13.3 fix from v0.10.0).

---

## v0.11.0 — 2026-08-21

**Closes the open work list from HANDOFF §11 — search, MCP-over-HTTP,
gossip, and peer-aware marketplace, all in 4 ADRs (0020–0023).**

### Added

- **`/api/docs/search?q=...`** (ADR-0020) — stdlib full-text search
  across `docs/*.md`. Replaces client-side fuzzy search in the sidebar
  with a server-side call (with 1.5s timeout fallback to local).
  Case-insensitive substring, snippeted results, XSS-safe via
  `html.escape`.
- **`POST /mcp`** (ADR-0021) — MCP Streamable HTTP transport. JSON-RPC
  2.0 over Flask. `initialize`, `ping`, `tools/list`, `tools/call`,
  `notifications/initialized` — same 5 read-only tools as the stdio
  MCP (ADR-0002), now reachable over HTTP for shared dashboards.
- **`/api/peer/summary[?refresh=1]` + `?scope=all` on leaderboard**
  (ADR-0022) — peer registry + drift gossip. Configure peers via
  `$VCM_PEERS` (`~/.vcm/peers.json`), fetch-on-demand with 5-min TTL.
  Local project data is the source of truth (CHARTER §7).
- **`/api/registry/skills?scope=all` + `/api/peer/registry`** (ADR-0023) —
  cross-server skill marketplace. Reads each peer's registry over the
  same gossip channel, merges + dedupes with local-wins authority.
- **`server/peers.py`** (new) — peer registry, gossip cache, HTTP
  fetch helpers. All cached in memory, no DB writes.
- **Reorganized `server/mcp_server.py`** — tool definitions moved to a
  `TOOL_REGISTRY` dict; `dispatch_tool()` is now transport-neutral so
  both stdio (ADR-0002) and HTTP (ADR-0021) reuse the same code.

### Tests

- 280/280 (was 212 in v0.9.0 → +68: 19 markdown-render + 13 drift +
  4 docs-viewer §13.3 + 12 docs-search + 11 mcp-http + 9 peers)
- 23 ADRs (was 19 → +4: 0020 docs-search, 0021 mcp-http,
  0022 peer-gossip, 0023 peer-marketplace)

---

## v0.10.0 — 2026-08-21

**Closes the markdown rendering half of v0.9.0 and ships the
cross-project drift view (ADR-0019).**

### Added

**Closes the markdown rendering half of v0.9.0 and ships the
cross-project drift view (ADR-0019).**

### Added

- **`server/markdown_render.py`** (ADR-0018) — stdlib markdown parser,
  ~150 LOC, zero deps. Supports `# / ## / ###` headers, `**bold**`,
  `*italic*`, `` `inline code` ``, `[text](url)`, fenced code blocks,
  bullet and numbered lists, blockquotes, paragraphs. XSS-safe via
  source-first `html.escape`.
- **`/drift` view + `/api/dashboard/drift`** (ADR-0019) — scores each
  project 0-100 from governance gaps, ADR count, idle days, dirty
  tree, and skill registry emptiness. Sorted desc (most drift first).
  KPI row: over-50 count, avg score, longest idle, total projects.

### Fixed

- **Root cause: `/docs/<path>.md` was double-escaping the rendered
  markdown** — the body was wrapped in `<pre>{{ body }}</pre>` which
  Jinja2 autoescaped, hiding the actual HTML as visible text. Changed
  to `<div class="markdown-body">{{ body | safe }}</div>` with
  minimal CSS for h1/h2/h3, p, lists, code, pre, blockquote, links.
  This was the real fix behind ADR-0018 (the markdown parser was
  correct since v0.9.0, the template just re-escaped its output).
- **HANDOFF §13.3: docs sidebar active highlight** — the inline
  `docsPage()` Alpine state used `get filtered()`/`set filtered()`
  accessors, which Alpine 3.x Proxy-based reactivity does not track
  the same way as plain properties, silently dropping `<template
  x-for>` re-renders. Replaced with a plain `filtered: []` property
  initialized in `init()` (after the `/api/docs/index` fetch resolves)
  and updated by `applyFilter()`. The `currentRel` interpolation
  (`:class="f.relpath === currentRel ? '...' : '...'"`) now actually
  toggles `docs-link--active` on the matching sidebar entry.

### Tests



### Design notes

- Both views honour CHARTER §8 (offline-first, 0 new deps).
- Drift score weights are hardcoded in v0.10.0 (per ADR-0019); a
  per-installation override ships in v0.11.0.

---

## v0.9.0 — 2026-08-21

**Closes two long-standing scope-system and discoverability gaps.**

### Added

- **`/api/audit/purge` endpoint** (admin scope, ADR-0016) — operators can
  prune audit log rows older than `before`. Literal `PURGE` confirmation
  word prevents accidental destruction. The purge itself writes an
  `audit_purge` event (meta-audit: the audit of auditing is audited).
- **`/docs` viewer with TOC sidebar + client-side fuzzy search**
  (ADR-0017) — `/docs/<path>.md` now renders with a 280px sidebar
  listing every doc + a token-split fuzzy search input. Zero
  third-party deps (CHARTER §8). Server pre-fetches the index via
  `/api/docs/index`.
- **Nav link** for the docs viewer.

### Fixed

- Tests/templates.test.js's `<script>` assertion was rewritten — the
  new docs viewer injects Alpine.js `<script>` tags for sidebar search.

### Tests

- 212/212 (was 199 → +13: 6 audit-purge + 7 docs-viewer)
- 17 ADRs (was 15 → +2)

---

## v0.8.0 — 2026-08-21

**Documentation catch-up + marketplace closure.** A release without
much new code, but with two important debt-clearances: the README was
v0.2-era, and the marketplace had a server-side `read` endpoint
without a server-side `publish` endpoint.

### Added

- **CHANGELOG.md** — captures v0.2.0 → v0.7.0 history with design notes
  pointing to the ADRs that drove each change.
- **README.md modernization** — rewritten for v0.7.0 reality. Was stuck
  in v0.2 thinking. Added release-cadence table, "What vcm is NOT"
  section, full CLI at a glance.
- **/api/registry/publish endpoint** (push scope) — server-side
  skill publish, closes the v0.5.0 marketplace story end-to-end.
  Refuses retired skills, refreshes `~/.vcm/registry/index.json`,
  emits a `registry_publish` audit event.
- **/audit view consumes /api/audit/stats** — 3-KPI stats card
  (total / auth_failure / state_pushed) + ECharts event-distribution
  bar. Filter URL-state re-runs both stats and the event list.

### Fixed

- `_glob` / `_json` module-name typo bug — `import json as _json` and
  `import glob as _glob` are fine in the `import` line, but callsites
  that referenced `json.load` (not `_json.load`) failed at runtime
  with "json is not defined" or "No module named _glob". Replaced with
  module-top `import json` and `import glob`.
- Test port collision — `tests/scopes.test.js` and
  `tests/registry-publish.test.js` both spawned on PORT 7480; under
  vitest's parallel execution, the second test to start would fail to
  bind the port. Moved registry-publish to PORT 7488.

### Tests

- 199/199 (was 191 → +8)
- 15 ADRs (no new — three ROADMAP items deprioritised as out-of-scope
  for local-first vcm)

---

## v0.7.0 — 2026-08-21

**Closed three real gaps left open by v0.6.0**: write-permission leakage
across scopes, unreadable JSON Schemas, and the CLI-only marketplace.

---

### Added

- **`vcm schema doc <name>`** — JSON Schema → Markdown generator for the
  two project schemas (skill, state). Pure stdlib, 80 LOC. Renders
  required vs optional fields with type/enum/default/minLength/pattern.
  ([ADR-0015](docs/adr/0015-schema-doc.md))
- **Per-endpoint scope enforcement** — `@require_scope('read'|'push'|'admin')`
  decorator on every `/api/*` route (except `/api/health`). Token scope
  > user scope; admins can issue read-only CI tokens via delegation.
  ([ADR-0014](docs/adr/0014-endpoint-scopes.md))
- **`/api/registry/skills` endpoint** — exposes the local `~/.vcm/registry/`
  read-only so the dashboard can render a marketplace view. CLI was the
  only path before.

### Fixed

- **Flask decorator-order gotcha**: `@scopes_mod.require_scope("X") @app.route(...)`
  silently lost the scope check because Flask's `route()` returns the
  original function unchanged. Now documented in ADR-0014.
- **`_audit_forbidden` referenced free variables** that didn't exist in its
  scope; `except Exception: pass` swallowed the error. Now passes them as
  kwargs and the audit event fires correctly.

### Tests

- 191/191 (was 177 → +14)
- 15 ADRs (was 13 → +2)

---

## v0.6.0 — 2026-08-21

**Per-user accounts, structured audit, comprehensive doctor.** The "5 people
share one password" anti-pattern of v0.4 BasicAuth got replaced; audit log
went from JSONL grep to indexed SQLite; the 4-command ritual became one.

### Added

- **Per-user ACL** — bcrypt users + bearer tokens. Multiple users coexist
  with independent token scopes. CLI: `vcm user add/list/passwd/delete`,
  `vcm token grant/revoke/list`. Tokens live as sha256 hashes (breach can't
  replay). ([ADR-0011](docs/adr/0011-per-user-acl.md))
- **Audit log SQLite backing** — `audit_events` table with indexes on
  `(ts, event_type, project)`. JSONL kept as parallel ops stream for
  `tail -f | jq` workflows. New `/api/audit/stats` for bar charts.
  ([ADR-0012](docs/adr/0012-audit-sqlite.md))
- **`vcm doctor` CLI** — one-command comprehensive health check (governance
  + skills + repository + git hygiene). Output modes: human, `--json`,
  `--strict`. ([ADR-0013](docs/adr/0013-vcm-doctor.md))

### Tests

- 177/177 (was 155 → +22)
- 13 ADRs (was 10 → +3)
- 3 new SQL tables: `users`, `tokens`, `audit_events`
- WAL journal mode enabled for multi-process SQLite writes

---

## v0.5.0 — 2026-08-21

**Closure of the lifecycle story.** ADR-0009 (audit) + ADR-0010 (trends)
+ ADR-0008 (marketplace) gave the dashboard a soul; before this, the
server could answer "what is it now?" but not "how did it get here?" or
"what should I install?".

### Added

- **Audit log** — JSONL append-only at `~/.vcm/audit.log` /
  `$VCM_AUDIT_LOG`. Closes CHARTER §6 "审批可追溯". Captures
  auth_failure + state_pushed + state_rejected events.
  ([ADR-0009](docs/adr/0009-audit-log.md))
- **Trend dashboard** (`/trends`) — weekly buckets for compliance /
  td_count / skills / adrs / dirty / push count. No schema change; pure
  function on `states` table. ([ADR-0010](docs/adr/0010-trend-dashboard.md))
- **Skill marketplace** — local registry at `~/.vcm/registry/`. CLI:
  `vcm skill publish / unpublish / discover / install`. Refuses to
  publish retired skills; install validates schema before write.
  ([ADR-0008](docs/adr/0008-skill-marketplace.md))
- **9 new documentation marks** — `--replaced-by` flag for deprecate,
  `--force` for publish, `--days` for stale / sweep, `--tag` for
  discover, `--install-to` for install.

### Tests

- 155/155 (was 122 → +33)
- 10 ADRs (was 7 → +3)

---

## v0.4.0 — 2026-08-21

**Convergence of capability, completion, and communication.** The biggest
single release to date: 5 ADRs, 8 commits, +3322 / -53 lines.

### Added

- **MCP server** (`server/mcp_server.py`) — 5 read-only tools over stdio:
  `vcm_overview`, `vcm_project`, `vcm_skill_matrix`, `vcm_attention`,
  `vcm_health`. Token-friendly output for Claude Code / Codex / Cursor / pi.
  ([ADR-0002](docs/adr/0002-mcp-server.md))
- **Skill adapter layer** — 5 thin wrappers (vercel-labs, tech-leads-club,
  sickn33-aas, addyosmani, refly) + `vcm skill convert`. The adapter layer
  is explicitly NOT a fork: source schemas stay at their standards,
  wrapper converts JSON↔JSON. ([ADR-0003](docs/adr/0003-skill-adapter-layer.md))
- **Cross-project comparisons** (`/api/dashboard/leaderboard` +
  `/leaderboard` view, 6 sort dimensions: td_count, skills, adrs,
  governance_compliance, last_seen_days, dirty_clean). Answers "which
  project is most compliant / has most debt / is stale?"
  ([ADR-0005](docs/adr/0005-cross-project-comparisons.md))
- **Optional BasicAuth** — `VCM_AUTH_USER` + `VCM_AUTH_PASS` env vars gate
  all `/api/*` (excludes `/api/health`). Constant-time string compare
  via `hmac.compare_digest`. Malformed Authorization → 400 (no info leak).
  ([ADR-0004](docs/adr/0004-basicauth.md))
- **SSE live dashboard** (`/api/dashboard/stream`) — 5 event types:
  hello, project_push, attention_changed, heartbeat. Browser reconnect
  on error with 5s backoff. ([ADR-0007](docs/adr/0007-sse-live-dashboard.md))
- **CI/CD hardened** — `.github/workflows/ci.yml` with Python venv cache
  + adapter CLI smoke. New `.github/workflows/publish.yml` auto-bumps
  `package.json` on tag push, then `npm publish --provenance`.

### Tests

- 122/122 (was 42 → +80)
- 7 ADRs (was 1 → +6)

---

## v0.3.0 — 2026-08-21

**Design discipline established.** The repowise-inspired frontend
redesign was the first time this project had a written design system.
Before this, the dashboard was "what worked" — colors hardcoded,
nothing token-first, no URL state.

### Added

- **Frontend redesign** (repowise-inspired) — token-first CSS, "Answers:"
  header per view, 3-KPI grid per page, URL state for tabs.
  ([ADR-0001](docs/adr/0001-repowise-inspired-frontend.md))
- **Design system docs** (`docs/DESIGN.md`) — single source of truth for
  tokens, components, layout, "what not to do" mirror list.
- **HTML smoke tests** — verify `data-c=` hooks, `?tab=` URL state, that
  every view renders the design system primitives.
- **Dark / light theme** — `data-theme` toggle, persisted in localStorage.
- **New views** — `/peers`, `/settings`, `/projects/<name>` (multi-tab),
  `/skills` (registry).

### Tests

- 42/42 (was 27 → +15)
- HTML smoke tests + 1 design ADR

---

## v0.2.0 — 2026-08-21

**Initial usable release.** v0.1.0 was a stub; v0.2.0 shipped the seven
CLI commands that any vcm user touches (`init`, `snapshot`, `status`,
`validate`, `push`, `peers`, `skill add/list/validate`) plus the v0.2
flask server with five `/api/*` endpoints.

### Added

- 7 CLI commands
- Flask server with `/api/health`, `/api/collect`, `/api/projects[/<name>]`,
  `/api/dashboard/{overview,skill-matrix,attention,activity,skill-aging,summary,leaderboard,trend,stream}`
- 6 hard check scripts (vendored from sales-ai)
- 1 ADR (the eventual design discipline)

---

## Why a CHANGELOG and not just a ROADMAP

`ROADMAP.md` answers "what we plan to build next" — useful for contributors
and users tracking the project. `CHANGELOG.md` answers "what we built and
why" — useful for users upgrading between versions.

The two are mirrors, but the perspective is different. ROADMAP forward,
CHANGELOG backward. Both are needed; both align with the discipline
that every change starts with a written ADR.
