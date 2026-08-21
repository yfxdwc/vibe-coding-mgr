# vibe-coding-mgr

**Vibe Coding Manager** — governance + tooling + cross-project attention for vibe coding projects.

Extracted from [sales-ai](https://github.com/your-org/sales-ai) where it was developed as `dev domain`. Now standalone.

## What it does

| Command | Purpose |
|---|---|
| `vcm init` | Set up a project with VCM governance templates (AGENTS.md, CHARTER.md, scripts) |
| `vcm snapshot <name>` | Task-level snapshot using git tag + dirty backup |
| `vcm skill add/list/validate` | Skill registry with 5 原则 + 3 条件 enforcement |
| `vcm skill convert` | Convert between 5 standards (vercel / tech-leads-club / AAS / addyosmani / refly / vcm) |
| `vcm skill deprecate/retire/stale/sweep` | Skill lifecycle automation (ADR-0006) |
| `vcm skill publish/unpublish/discover/install` | Local skill marketplace (ADR-0008) |
| `vcm status` | Local HTML governance report (skills, ADRs, TDs, post-mortems, git) |
| `vcm validate` | Run the 6 hard checks (CHARTER §9 + §10) |
| `vcm push` | Push state to vcm-server (optional central dashboard) |
| `vcm peers` | Peer project attention (v0.1.0: stub) |

## vcm-server (optional central dashboard)

| Endpoint | Purpose |
|---|---|
| `GET /` | Cockpit: 3-KPI dashboard with tabs (overview / attention / activity) |
| `GET /leaderboard` | Project ranking (6 sort dimensions) |
| `GET /projects/<name>` | Single project detail (4 tabs) |
| `GET /skills` | Cross-project skill registry (3 tabs) |
| `GET /trends` | Governance time-series (weekly buckets) |
| `GET /audit` | Auth + push event audit log |
| `GET /peers` | OSS peer attention |
| `GET /settings` | Server meta + design tokens |

All endpoints + MCP server `vcm-server` (5 read-only tools) + SSE live
updates are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Install

### Global install (recommended for personal use)

```bash
npm install -g vibe-coding-mgr
vcm --version
```

### Local install (per-project)

```bash
cd my-project
npm install vibe-coding-mgr
npx vcm init
```

### From source (development)

```bash
git clone https://github.com/your-org/vibe-coding-mgr
cd vibe-coding-mgr
npm install
npm link             # makes `vcm` available globally from this checkout
```

## Quick start

```bash
# 1. Initialize a project with VCM governance
cd my-vibe-project
vcm init
# → Creates AGENTS.md, CHARTER.md, scripts/routine_coverage.sh

# 2. Customize AGENTS.md and CHARTER.md for your project

# 3. Snapshot your work before risky changes
vcm snapshot refactor-auth
# → Creates git tag pre-refactor-auth-<sha>
# → Dumps dirty working tree to .git/snapshots/

# 4. Generate governance status report
vcm status
# → Opens .vcm/report.html in browser

# 5. Validate against 6 hard checks
vcm validate
# → Runs check_charter.py, check_doc_drift.py, etc.

# 6. (Optional) Push state to central dashboard
vcm push --server http://my-vcm-server:7338
# → Sends state to vcm-server for multi-project view
```

## Optional: run vcm-server for multi-project dashboard

```bash
# One-time setup
cd vibe-coding-mgr
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt

# Start server (binds 127.0.0.1:7338 by default)
python3 server/app.py
# → Dashboard at http://127.0.0.1:7338/

# From each project, push state:
cd my-project
vcm push
```

## Architecture

```
vibe-coding-mgr/
├── bin/vcm.js              # CLI entry (Node.js)
├── lib/
│   ├── cli/                # Command implementations
│   ├── schemas/            # JSON Schema validators
│   └── templates/          # AGENTS/CHARTER templates
├── scripts/                # 6 hard check scripts (Python)
├── server/                 # Flask server for multi-project dashboard
├── tests/                  # vitest unit tests
└── docs/                   # ARCHITECTURE, ONBOARDING, PHILOSOPHY, etc.
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for details.

## v0.5.0 highlights

- **Audit log** (`/audit`): every auth failure + state push is JSONL-recorded to `$VCM_AUDIT_LOG` or `~/.vcm/audit.log`. Closes CHARTER §6 "审批可追溯".
- **Trend dashboard** (`/trends`): weekly buckets for compliance, td_count, skills, adrs, dirty. No new schema — pure function over `states` table.
- **Skill marketplace** (`vcm skill publish/discover/install`): local registry at `~/.vcm/registry/` closes the lifecycle loop (publishes install as new skill, retiring removes from registry).
- **MCP server** (`python3 server/mcp_server.py`): 5 read-only tools over stdio for Claude Code / Codex / Cursor / pi.
- **BasicAuth** (optional): `VCM_AUTH_USER` + `VCM_AUTH_PASS` env vars gate `/api/*` (excludes `/api/health`). Constant-time compare; malformed header → 400.
- **SSE live dashboard** (`/api/dashboard/stream`): 5 event types, browser `EventSource` reconnect on error.
- **Front-end redesign** (repowise-inspired, ADR-0001): token-first CSS, "Answers:" header per view, 3-KPI grid per page, DESIGN.md as single source of truth.

## Adoption philosophy

vibe-coding-mgr **adopts** 5 ecosystem standards (not forks):

- [vercel-labs/skills](https://github.com/vercel-labs/skills) — skill distribution
- [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) — validated registry
- [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) (AAS Core) — stack manifest
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — 6-phase lifecycle
- [refly-ai/refly](https://github.com/refly-ai/refly) — skill builder

Unified via `.vcm-skill.json` schema (see `lib/schemas/skill.schema.json`).

## License

MIT
