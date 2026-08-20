# ROADMAP

## v0.1.0 (current — 2026-08-20)

- [x] CLI: init / snapshot / skill / status / validate / push / peers
- [x] Schemas: skill, state (JSON Schema with Ajv)
- [x] 6 hard check scripts (vendored from sales-ai)
- [x] vcm-server minimal (Flask + SQLite, multi-project dashboard)
- [x] Tests: schemas + cli smoke tests (vitest)
- [x] Self-governance: AGENTS.md + CHARTER.md + 6 checks
- [x] Docs: README, ONBOARDING, ARCHITECTURE, PHILOSOPHY, REFERENCES

## v0.2.0 (next, ~2 weeks)

- [ ] **vcm peers — full implementation**
  - GitHub API integration (rate-limit-aware)
  - Watch list config (`.vcm-peers.yaml`)
  - Dashboard "OSS I'm following" view
- [ ] **MCP server** (server/mcp.py)
  - 3-5 MCP tools for AI agents
  - Compatible with Claude Code / Codex
- [ ] **Skill adapter layer** (5 standards adapters)
  - vercel-labs/skills adapter
  - tech-leads-club adapter
  - AAS Core adapter
  - addyosmani/agent-skills adapter
- [ ] **CI/CD**
  - GitHub Actions workflow (already drafted)
  - npm publish on tag

## v0.3.0 (~1 month)

- [ ] **Optional BasicAuth** for vcm-server
- [ ] **Cross-project comparisons** (which project has more TDs?)
- [ ] **Skill lifecycle automation** (deprecate unused, archive old)
- [ ] **Self-update mechanism** (vcm updates itself via npm)
- [ ] **WebSocket live dashboard** (real-time status updates)

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
