# ROADMAP

## v0.1.0 (current — 2026-08-20)

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

## v0.6.0 (next, ~2 months)

- [ ] **WebSocket** transport for MCP (stdio current; v0.6 adds HTTP/WS)
- [ ] **Per-user ACLs** (replace single-password BasicAuth)
- [ ] **Cross-server leaderboard** (gossip protocol, no central DB)
- [ ] **Audit log: SQLite backing** + filtering UI
- [ ] **Skill marketplace: GitHub / GitLab sync**

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
