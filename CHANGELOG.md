# CHANGELOG

vibe-coding-mgr (vcm) follows a deliberate, design-disciplined release cadence.
Every feature has a written ADR before code lands. This file captures the
user-visible history; [docs/ROADMAP.md](docs/ROADMAP.md) tracks the future.

The format is loosely: version, date, summary, list of changes, and a
'design notes' block pointing to the ADRs that drove the work.

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
