# ROADMAP

## v0.14.1 (current — 2026-08-22)

Latest release. All v0.8.0 – v0.14.1 items below are DONE.
v0.15.0 candidates at the bottom — pick one and write the ADR first.

---

## v0.1.0 ✅ DONE (2026-08-20)

- [x] CLI: init / snapshot / skill / status / validate / push / peers
- [x] Schemas: skill, state (JSON Schema with Ajv)
- [x] 6 hard check scripts (vendored from sales-ai)
- [x] vcm-server minimal (Flask + SQLite, multi-project dashboard)
- [x] Tests: schemas + cli smoke tests (vitest)
- [x] Self-governance: AGENTS.md + CHARTER.md + 6 checks
- [x] Docs: README, ONBOARDING, ARCHITECTURE, PHILOSOPHY, REFERENCES

## v0.2.0 ✅ DONE (2026-08-21)

- [x] Full cockpit dashboard (4 panels)
- [x] Skill registry cross-project page  
- [x] peers real implementation (GitHub API)
- [x] Alpine.js + ECharts + HTMX
- [x] Server dashboard tests

## v0.3.0 ✅ DONE (2026-08-21)

- [x] **Frontend redesign — repowise-inspired** (ADR-0001)
  - 3-layer CSS (tokens.css / base.css / components.css) with design system
  - Common layout (`_layout.html`) + per-tab URL state
  - "Answers:" header on every page, 3 parallel KPIs (no blended score)
  - New views: `/peers`, `/settings`
  - Dark theme by default, light via `data-theme`
- [x] **Design system docs** — `docs/DESIGN.md` (single source of truth)
- [x] **peers dashboard view** + `/api/peers` (reads `~/.vcm/peers.yaml`)
- [x] **CSS-token-based themability** — re-theme via `--accent` etc.
- [x] **6 hard check still passes**
- [x] **27/27 unit tests pass**

## v0.4.0 ✅ DONE (2026-08-21)

- [x] **MCP server** (server/mcp_server.py) — 5 read-only tools, stdio
- [x] **Skill adapter layer** (vercel-labs / tech-leads-club / sickn33-aas /
      addyosmani / refly + vcm pivot)
- [x] **CI/CD** — hardened .github/workflows/ci.yml (caching, MCP coverage)
      + new .github/workflows/publish.yml (auto-bump + provenance on tags)
- [x] **Optional BasicAuth** (VCM_AUTH_USER/PASS, ADR-0004)
- [x] **Cross-project comparisons** (/api/dashboard/leaderboard +
      /leaderboard view, 6 sort dimensions)
- [x] **Skill lifecycle automation** (deprecate / retire / stale / sweep)
- [x] **SSE live dashboard** (/api/dashboard/stream — 5 event types)

### v0.4.0 metrics
- 122/122 unit tests pass (was 42 in v0.3.0 → +80)
- 6/6 hard checks pass
- 7 ADRs (0001–0007) in docs/adr/
- 5 adapter modules + 5 new CLI commands + 2 new HTTP endpoints
- 8 new HTML pages / partials

## v0.5.0 ✅ DONE (2026-08-21)

- [x] **Audit log** (ADR-0009) — JSONL append-only at `~/.vcm/audit.log` /
      `$VCM_AUDIT_LOG`; auth_failure + state_pushed + state_rejected events
- [x] **Trend dashboard** (ADR-0010) — `/api/dashboard/trend` weekly
      buckets, no schema change (pure function on states table)
- [x] **Skill marketplace** (ADR-0008) — local registry at
      `~/.vcm/registry/`, publish/unpublish/discover/install

### v0.5.0 metrics
- 155/155 unit tests pass (was 122 in v0.4.0 → +33 tests)
- 6/6 hard checks pass
- 10 ADRs (0001–0010)
- 4 new endpoints (/api/audit, /api/dashboard/trend, /audit, /trends)
- 5 new CLI sub-commands (publish, unpublish, discover, install)

## v0.6.0 ✅ DONE (2026-08-21)

- [x] **Per-user ACL** (ADR-0011) — bcrypt users + bearer tokens
- [x] **Audit log SQLite backing** (ADR-0012) — `audit_events` table +
      JSONL parallel stream
- [x] **`vcm doctor` CLI** (ADR-0013) — 4-section single-command check

### v0.6.0 metrics
- 177/177 unit tests pass (was 155 in v0.5.0 → +22 tests)
- 6/6 hard checks pass
- 13 ADRs (0001–0013)
- `users` + `tokens` + `audit_events` tables in vcm.db
- WAL journal mode enabled for multi-process SQLite writes

## v0.7.0 ✅ DONE (2026-08-21)

- [x] **Per-endpoint ACL scopes** (ADR-0014) — `@require_scope` decorator
      closes the v0.6.0 scope-bypass gap. Token scope > user scope; `read`
      tokens can no longer POST writes.
- [x] **JSON Schema docs generator** (ADR-0015) — `vcm schema doc <name>`
      renders skill/state schemas as Markdown for humans.
- [x] **/api/registry/skills endpoint** — server-side read of the local
      `~/.vcm/registry/` so the dashboard can render a marketplace view
      (CLI was the only path before).

### v0.7.0 metrics
- 191/191 tests pass (was 177 in v0.6.0 → +14 tests)
- 6/6 hard checks pass
- 15 ADRs (0001–0015)
- 2 named free-variable bugs squashed as side effects of writing tests
- Flask decorator-order gotcha documented (out-of-order decorators → silent
  loss of scope check)

## v0.8.0 ✅ DONE (2026-08-21)

- [x] **CHANGELOG.md** — captures v0.2.0 → v0.7.0 history
- [x] **README modernization** — written for v0.7.0 reality
- [x] **/api/registry/publish endpoint** — server-side publish (push scope)
- [x] **Audit log: filtering UI** (event_type / project / source_ip facets)
- [x] **Per-endpoint ACL scopes: admin endpoints** — /api/audit/purge

## v0.9.0 ✅ DONE (2026-08-21)

- [x] **/api/audit/purge admin endpoint** (ADR-0016) + DELETE method
- [x] **/docs viewer with TOC + client-side search** (ADR-0017)
- [x] **/docs renders markdown to HTML** (ADR-0018, vendored commonmark)
- [x] **Tests for markdown_render** — `tests/markdown-render.test.js` (19 tests)

## v0.10.0 ✅ DONE (2026-08-21)

- [x] **Drift detection view** (ADR-0019) — `dashboard.py:get_drift_score`,
      `/api/dashboard/drift`, `/drift` view, nav link.
- [x] **/api/registry HTTP endpoints** — server-side publish + list

## v0.11.0 ✅ DONE (2026-08-21)

- [x] **MCP-HTTP transport** (replaces stdio for network reach)
- [x] **Peer gossip + marketplace** (LAN registry discovery)
- [x] **Docs full-text server-side search** (ADR-0020) — `server/docs_search.py`

## v0.12.0 ✅ DONE (2026-08-21)

- [x] **Audit log filtering UI + /api/audit/facets** (ADR-0024)
- [x] **Root-cause fix** to `_read_sqlite` (NameError swallowed by
      JSONL fallback that made `?source_ip=` silently return 0 rows)

## v0.13.0 ✅ DONE (2026-08-22)

- [x] **First persistent-runtime release** — `systemd` user unit
      (ADR-0025), `scripts/install-service.sh` / `uninstall-service.sh`,
      `~/.vcm/server.env` template. `loginctl enable-linger` enabled.
- [x] **StartLimit* in [Unit]** — moved from [Service] per `man systemd.service`
- [x] **Retry-based install probe** — 10 × 0.5s survives the
      systemd-active/in-process-bind race

## v0.14.0 ✅ DONE (2026-08-22)

- [x] **Bilingual UI** (ADR-0026) — server-side `t()` per ADR-0026,
      `?lang=` + cookie + Accept-Language resolution, nav toggle,
      default `zh`, zero new runtime deps, 220 keys per language.

## v0.14.1 ✅ DONE (2026-08-22)

- [x] **Comprehensive translation rollout** — 220 → 380 keys balanced
      en↔zh, Alpine JS bridge (`window.__vcm_i18n__` + `window.t`),
      all 11 templates end-to-end translated, +27 i18n test assertions
      (per-page zh + en presence, "no English leakage", JS bridge wired).

---

## v0.15.0 ✅ DONE (2026-08-22)

- [x] **macOS launchd `vcm-server.plist`** — ADR-0027. Mirrors the
      systemd user-unit install/uninstall flow under
      `~/Library/LaunchAgents/com.vibe-coding-mgr.vcm-server.plist`.
      Same `~/.vcm/server.env` contract as Linux, no new runtime
      deps (launchd is part of macOS). Smoke test verifies plist
      shape + install/uninstall --dry-run on Linux CI.
- [x] **Updated HANDOFF §11.2, README, ONBOARDING** to reflect
      launchd availability.

## v0.16.0 (next, ~2 months)

Candidates (no ADR written yet — pick one and write the ADR first):

- [ ] **SKILL.md files per CHARTER §10** — `docs/SKILLS.md` is referenced
      in AGENTS.md but per-skill `SKILL.md` files for "peer protocol",
      "MCP HTTP transport", "drift detection", "docs search", "launchd
      install" are not yet checked into `.pi/skills/`.
- [ ] **CONTRIBUTING.md + npm-published version polish** — minor.

Deferred (do not pick up without an explicit ask):
- WebSocket MCP transport — high-risk protocol migration
- Cross-server gossip / marketplace — networking surface
- Anything requiring mcp 2.0 or a new runtime dep — violates CHARTER §8

## v1.0.0 (~3 months, stability milestone)

- [ ] **Stable JSON Schema** (no breaking changes for 6 months)
- [ ] **Documented plugin API** (3rd parties can extend vcm)
- [ ] **Backstage integration** (optional, for teams already using Backstage)
- [ ] **Performance**: <100ms for `vcm status`, <500ms for `vcm validate`
- [ ] **Adoption**: 10+ projects actively using vibe-coding-mgr

## v1.0.0 (~3 months, stability milestone)

- [ ] **Stable JSON Schema** (no breaking changes for 6 months)
- [ ] **Documented plugin API** (3rd parties can extend vcm)
- [ ] **Backstage integration** (optional, for teams already using Backstage)
- [ ] **Performance**: <100ms for `vcm status`, <500ms for `vcm validate`
- [ ] **Adoption**: 10+ projects actively using vibe-coding-mgr

## v2.0.0 (~6 months, future)

- [ ] **Distributed mode**: Multiple vcm-server instances, gossip protocol
- [ ] **AI-generated skill suggestions**: Based on git history analysis
- [ ] **Skill marketplace**: Public registry of validated skills
- [ ] **Integration with Linear / Jira / GitHub Issues**
- [ ] **Time-series governance metrics**: Track governance health over time

## Non-goals

Things vibe-coding-mgr will **never** do:

- ❌ Be a code editor / IDE
- ❌ Replace your AI agent (Claude Code, Codex, Cursor, pi)
- ❌ Run code analysis (use [Repowise](https://github.com/repowise-dev/repowise) or [Graphy](https://github.com/rosshhun/graphy))
- ❌ Be a project management tool (use [Plane](https://github.com/makeplane/plane))
- ❌ Replace human judgment on architectural decisions
- ❌ Lock you in (always extractable, no vendor lock-in)

## How to influence this roadmap

- Open issues on GitHub
- File ADRs in your own project showing what you needed
- Submit PRs (small, focused, with tests)
