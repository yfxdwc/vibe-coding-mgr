# CHANGELOG

vibe-coding-mgr (vcm) follows a deliberate, design-disciplined release cadence.
Every feature has a written ADR before code lands. This file captures the
user-visible history; [docs/ROADMAP.md](docs/ROADMAP.md) tracks the future.

The format is loosely: version, date, summary, list of changes, and a
'design notes' block pointing to the ADRs that drove the work.

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
