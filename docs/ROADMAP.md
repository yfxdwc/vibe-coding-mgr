# ROADMAP

## v0.18.3 (current — 2026-08-22)

Latest release. Three layered features shipped in a combined tag:

- [x] **Sidebar sub-nav** (ADR-0034) — each project row wraps a chevron
      toggle + 7-entry sub-nav (overview / drift / skills / trends /
      peers / audit / docs). Replaces ADR-0032's horizontal tabs.
- [x] **Leaderboard demoted to cockpit tab** (ADR-0032 §v0.18.2 update)
      — `/leaderboard` → 302 to `/?tab=leaderboard`. Top-level sidebar
      3 → 2 items. Default sort `td_count desc`, no sort UI.
- [x] **Sidebar collapse (icon-only 64px)** (ADR-0034 §9) — ‹ button
      toggles 240px ↔ 64px, persists in localStorage.
- [x] **Project icon auto-fetch** (ADR-0034 §9.9) — git remote parse
      → `icon_url` + `icon_color` DB columns + monogram fallback.

**Accordion decision (ADR-0034 §2 final)**: 4-level fallback chain
when syncing the sidebar to the current URL:
`current > stored > first > []`. Single expanded project at any time.
Owner's original spec ("仅展开当前选中的二级目录") is honored by the
core accordion invariant; the `first` fallback only fires on
non-project pages (cockpit / settings) where there is no current
selection and localStorage is empty.

**Bugfixes shipped in this tag**: HTMX config silent no-op fixed
(htmx.onLoad hook); sidebar auto-expand uses live pathname instead
of stale `body[data-active-project]`; CLI VERSION synced with
package.json; vitest `pool: 'forks', singleFork: true` to stop
parallel suites racing for the same free port; markdown-render
sweep baseline bumped 4 → 10 to track the actual current layout
script count; 23 vitest redirect test debt cleared by adapting
tests to ADR-0032's project-scoped URLs.

---

## v0.18.1 ✅ DONE (2026-08-22)

- [x] **Project-internal feature architecture** (ADR-0032) — 6 new
      `/projects/<name>/<feature>` routes (drift / skills / trends /
      peers / audit / docs). Top-level sidebar drops from 9 → 3
      items. `/projects/<name>/peers` shows the per-project
      placeholder (v0.19+ will reference per-project).
- [x] **`project_peers_placeholder.html`** — closes the route +
      secondary nav now so the architecture is in place.
- [x] **`docs/adr/0032-project-internal-features.md`** — design record.

---

## v0.18.0 ✅ DONE (2026-08-22)

- [x] **Sidebar layout + multi-project registry** (ADR-0030) — left
      rail (brand / nav / projects section / footer) replaces the v0.17
      top nav. Top-level sidebar 9 items (cockpit / leaderboard / drift /
      skills / trends / peers / audit / docs / settings). Server now
      reads `projects` table from SQLite to populate the registry.
- [x] **`POST /api/projects`** — `Add Project` modal in the sidebar
      lets the user register a repo via the UI (no longer CLI-only).
- [x] **`docs/adr/0030-sidebar-and-multi-launch.md`** — design record.

---

## v0.17.0 ✅ DONE (2026-08-22)

- [x] **README modernization** (ADR-0029) — 6 edits restoring accuracy
      after 3 skipped releases (v0.14.1, v0.15.0, v0.16.0): banner
      version, `vcm doctor` example output, project structure block,
      design discipline section, release cadence table, port
      references. No structural rewrite.
- [x] **CONTRIBUTING.md** (ADR-0029) — first-ever contributor
      workflow doc. 9 sections: TL;DR, code of conduct, before-you-code
      (3 questions), ADR discipline, the 6 hard checks, Conventional
      Commits, release process, local sanity check, where to ask.
- [x] **Release process codified** — 5-surface version bump pattern
      (`package.json` / `bin/vcm.js` / `server/mcp_server.py` /
      `tests/cli.test.js` / `tests/server.test.js`) + annotated tag
      (`git tag -a v<X>.<Y>.<Z>` triggers `.github/workflows/publish.yml`).

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

## v0.16.0 ✅ DONE (2026-08-22)

- [x] **SKILL.md rollout for governance constraints** (ADR-0028).
      `docs/SKILLS.md` index + `docs/skills/<name>/SKILL.md` for
      `skill-authoring` (meta) + `persistent-runtime`,
      `i18n-authoring`, `drift-detection`, `mcp-transport`,
      `docs-search` (5 governance). New 7th hard check
      `scripts/check_skills.py` enforces: frontmatter present,
      banned-words regex (synced with sales-ai skill-authoring §3),
      canonical_ref resolves. `tests/skills-meta.test.js` (36
      assertions) mirrors the check at the unit-test layer. AGENTS.md
      §1's reference to `docs/SKILLS.md` now resolves.
- [x] **CHARTER §10 "三项全满足"** mechanically enforced — every
      governance constraint now has SKILL.md + ADR + CI check.

- [x] **macOS launchd `vcm-server.plist`** — ADR-0027. Mirrors the
      systemd user-unit install/uninstall flow under
      `~/Library/LaunchAgents/com.vibe-coding-mgr.vcm-server.plist`.
      Same `~/.vcm/server.env` contract as Linux, no new runtime
      deps (launchd is part of macOS). Smoke test verifies plist
      shape + install/uninstall --dry-run on Linux CI.
- [x] **Updated HANDOFF §11.2, README, ONBOARDING** to reflect
      launchd availability.

## v0.17.0 ✅ DONE (2026-08-22)

- [x] **README modernization** (ADR-0029) — 6 edits restoring accuracy
      after 3 skipped releases (v0.14.1, v0.15.0, v0.16.0): banner
      version, `vcm doctor` example output, project structure block,
      design discipline section, release cadence table, port
      references. No structural rewrite.
- [x] **CONTRIBUTING.md** (ADR-0029) — first-ever contributor
      workflow doc. 9 sections: TL;DR, code of conduct, before-you-code
      (3 questions), ADR discipline, the 6 hard checks, Conventional
      Commits, release process, local sanity check, where to ask.
- [x] **Release process codified** — 5-surface version bump pattern
      (`package.json` / `bin/vcm.js` / `server/mcp_server.py` /
      `tests/cli.test.js` / `tests/server.test.js`) + annotated tag
      (`git tag -a v<X>.<Y>.<Z>` triggers `.github/workflows/publish.yml`).

## v0.18.4 (next, ~2 weeks)

Candidates (no ADR written yet — pick one and write the ADR first):

- [ ] **Backfill SKILL.md for older ADRs** — ADR-0028 §"不做" explicitly
      defers this, but if SKILL.md count stays at 6 long-term the
      governance surface drifts.
- [ ] **CONTRIBUTING.md + npm-published version polish** — minor.
- [ ] **WebSocket MCP transport** (deferred since v0.10.0).
- [ ] **Per-project docs scanning** (ADR-0032 §"不做") — the
      `/projects/<name>/docs` route currently reuses the global
      `/docs/` scan; v0.19 was the planned ship target.
- [ ] **Per-project peer references** (ADR-0032 §"不做") — currently
      the `/projects/<name>/peers` route shows a v0.19+ placeholder.

> **Resolved in v0.18.3 (no longer candidates)**: the "stale test
> fixes" bullet listed audit-purge / users / mcp / registry-publish /
> peers / scopes / sse / templates suites as asserting legacy
> `/audit /drift /trends /skills /peers` URLs. Re-verified after the
> release: those suites were failing only because vitest's default
> `threads` pool raced suites for the same free port (ECONNREFUSED),
> not because of stale assertions. The `pool: 'forks',
> singleFork: true` fix (shipped in `037ad15`) makes them pass:
> 436 / 436 vitest, 12 / 12 playwright, 6 hard check exit 0.

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
