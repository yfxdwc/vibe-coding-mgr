# REFERENCES

Architecture Decision Records and external resources that shaped vibe-coding-mgr.

## Internal ADRs

Extracted from sales-ai's ADR series. See sales-ai's `docs/adr/INDEX.md` for the full list.

- **[sales-ai ADR-0027](../sales-ai-docs/adr/0027-vibe-coding-governance-authority.md)** — Vibe Coding governance authority hierarchy
- **[sales-ai ADR-0020](../sales-ai-docs/adr/0020-task-snapshot-semantics-and-dirty-backup.md)** — task-snapshot semantics + dirty backup
- **[sales-ai ADR-0018](../sales-ai-docs/adr/0018-monthly-rebalance-routine.md)** — Monthly rebalance routine (6 hard checks)
- **[sales-ai ADR-0031](../sales-ai-docs/adr/0031-repowise-integration.md)** — Repowise integration (limited adoption)
- **[sales-ai ADR-0032](../sales-ai-docs/adr/0032-vibe-coding-mgr-extraction.md)** — vibe-coding-mgr extraction plan

## External standards adopted

| Standard | License | URL | What we adopt |
|---|---|---|---|
| vercel-labs/skills | Apache 2.0 | https://github.com/vercel-labs/skills | Skill distribution (npm CLI) |
| tech-leads-club/agent-skills | TBD (review before use) | https://github.com/tech-leads-club/agent-skills | Validated registry concept |
| sickn33/agentic-awesome-skills (AAS Core) | MIT | https://github.com/sickn33/agentic-awesome-skills | Stack manifest + compose/validate |
| addyosmani/agent-skills | Apache 2.0 | https://github.com/addyosmani/agent-skills | 6-phase lifecycle methodology |
| refly-ai/refly | ReflyAI License (review) | https://github.com/refly-ai/refly | "Durable skills" philosophy |

## Tools integrated

| Tool | Purpose | URL |
|---|---|---|
| Node.js 20+ | CLI runtime | https://nodejs.org/ |
| Python 3.10+ | Check scripts + server | https://python.org/ |
| Flask | Server | https://flask.palletsprojects.com/ |
| Ajv | JSON Schema validation | https://ajv.js.org/ |
| Commander.js | CLI parsing | https://github.com/tj/commander-js/commander.js |
| Vitest | Testing | https://vitest.dev/ |

## Patterns referenced

- **ADR (Architecture Decision Records)** by Michael Nygard — https://cognitect.com/blog/2014/11/17/architecture-decision-records
- **Skills (Claude/PI conventions)** — `.pi/skills/` directory pattern
- **task-snapshot (sales-ai)** — git tag + dirty backup
- **6 hard checks (sales-ai)** — CHARTER §9 + §10 enforcement

## Inspiration

- **Claude Code** — AI coding agent
- **Cursor** — AI coding IDE
- **Backstage** — Internal developer portal (we explicitly don't use as base, too heavy)
- **Plane** — Open-source project management
- **Repowise** — Code intelligence (we use for Tier 3 docs/arch)

## Note on license compatibility

All adopted standards are reviewed for license compatibility:
- ✅ MIT (AAS Core) — OK for any use
- ✅ Apache 2.0 (vercel-labs, addyosmani) — OK for any use
- ⚠️ TBD (tech-leads-club) — License not yet confirmed; review before use
- ⚠️ ReflyAI License (refly-ai) — Custom license; review for commercial use restrictions

vibe-coding-mgr itself is **MIT**.
