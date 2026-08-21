# vibe-coding-mgr

**Vibe Coding Manager** — governance + tooling + cross-project attention for AI-assisted coding projects.

Originally extracted from sales-ai where it was developed as the `dev domain`. Now standalone.

```bash
$ vcm --version
0.9.0
$ vcm doctor                          # one-command health check
vcm doctor — 4 sections
[governance]  6 hard checks       OK (5 OK, 1 WARN, 0 FAIL)
[skills]       1 registered        1 active
[repository]   15 ADRs             newest: 0015-schema-doc
[git hygiene]  working tree        clean
VERDICT: 1 WARN, 5 OK
```

## What it does in 30 seconds

vcm is a personal / small-team governance layer for **vibe coding** —
the practice of having AI agents (Claude Code, Codex, Cursor, pi) write
most of your code under human direction. The questions it answers:

- **Before AI starts**: "Is this project set up so AI can be effective here?"
  (`vcm init` writes `AGENTS.md`, `CHARTER.md`, and 6 hard-check scripts)
- **As AI works**: "What just got shipped; is anyone watching?"
  (`vcm status`, `vcm push`, `vcm snapshot`)
- **After AI ships**: "Is this project still healthy; what's drifting?"
  (`vcm doctor`, `vcm validate`, `vcm skill deprecate/retire/stale`)
- **Across many projects**: "Where should I focus my attention?"
  (the optional `vcm-server` dashboard at `127.0.0.1:7338`)

Adopt-not-fork: 5 ecosystems standards are adapted via thin wrapper
layers (`vcm skill convert`), never forked.

## CLI at a glance

```bash
# Project setup
vcm init                         # generate AGENTS.md, CHARTER.md, scripts/
vcm snapshot <name>             # git tag + dirty backup
vcm status                       # local HTML governance report

# Validation
vcm validate                     # 6 hard checks (CHARTER §9 + §10)
vcm doctor                       # comprehensive health check (4 sections)
vcm doctor --json | jq           # machine-readable

# Skills (the central abstraction)
vcm skill add <name> --desc "..." --tags a,b
vcm skill validate               # validate frontmatter
vcm skill convert --from vercel --to vcm < skill.json
vcm skill deprecate <name> --replaced-by <new>
vcm skill retire <name> --yes
vcm skill stale --days 30
vcm skill sweep --days 180 --yes

# Local marketplace (ADR-0008)
vcm skill publish <name>         # ~/.vcm/registry/
vcm skill discover --tag demo
vcm skill install <name> --install-to <path>

# Schema docs (ADR-0015)
vcm schema doc skill             # stdout markdown
vcm schema doc state --output docs/STATE-SCHEMA.md

# Per-user ACL (ADR-0011)
vcm user add alice
vcm user list
vcm token grant alice --label laptop --days 90
vcm token revoke <id>

# Multi-project (optional)
vcm push --server http://vcm-host:7338
vcm peers add owner/name
```

## Optional central dashboard (`vcm-server`)

```bash
# Server runs on http://127.0.0.1:7338 by default
python3 server/app.py

# Browser views:
#   /              Cockpit (3-KPI dashboard, URL-state tabs)
#   /projects/<n>  Single project (4 tabs: overview / governance / health / history)
#   /skills        Cross-project skill registry
#   /leaderboard   Project ranking (6 sort dimensions)
#   /trends        Weekly governance time-series
#   /audit         Auth + push event audit log
#   /peers         OSS peer attention
#   /settings      Server meta + design tokens
```

For AI agents (Claude Code, Codex, pi, Cursor), `python3 server/mcp_server.py`
exposes 5 read-only tools over stdio:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
↓
{"jsonrpc":"2.0","id":1,"result":{"tools":[
  {"name":"vcm_overview",   "description":"All registered projects with summary KPIs"},
  {"name":"vcm_project",    "description":"Single-project detail + history"},
  {"name":"vcm_skill_matrix","description":"Skill → projects (sorted by reach)"},
  {"name":"vcm_attention",  "description":"Projects needing attention"},
  {"name":"vcm_health",     "description":"Server liveness"}
]}}
```

## Running persistently (systemd user unit, v0.13.0+)

For a long-lived `vcm-server` that survives logout, reboot, and crashes,
install it as a systemd user unit (ADR-0025; Linux only):

```bash
# One-shot install: picks a free port (7338..7399), writes env to
# ~/.vcm/server.env (chmod 600), renders the unit, daemon-reloads,
# and enable+starts vcm-server. Idempotent.
bash scripts/install-service.sh

# Expected final line:
#   vcm-server installed: http://127.0.0.1:7338/

# Day-to-day:
systemctl --user status vcm-server          # current state
journalctl --user -u vcm-server -n 50 -f   # live logs

# Edit config (port, DB path, auth, audit log) without restarting
# by hand: $EDITOR ~/.vcm/server.env then
systemctl --user restart vcm-server
```

The installer:

- **Does NOT** require sudo. The unit lives at
  `~/.config/systemd/user/vcm-server.service` (XDG-default).
- **Does NOT** depend on pm2 / supervisord / forever. systemd is already
  on every modern Linux; this respects CHARTER §8 (0 new deps).
- **Auto-picks a free port** if 7338 is taken (e.g. by `repowise serve`).
  The chosen port is written to `~/.vcm/server.env` and surfaced in the
  install script's success line.
- **Enables `loginctl enable-linger`** so the unit survives SSH logout.

Uninstall:

```bash
bash scripts/uninstall-service.sh    # stops the unit, removes it,
                                    # preserves ~/.vcm/server.env
                                    # and any DB files
```

macOS / Windows users fall back to the manual launch path (above):

```bash
python3 server/app.py &              # or inside tmux for survival
```

A `vcm-server.plist` for launchd is on the v0.14.0 roadmap.

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
npm link                          # makes `vcm` global from this checkout
```

## Quick start

```bash
# 1. Initialize a project with VCM governance
cd my-vibe-project
vcm init
# → Creates AGENTS.md, CHARTER.md, scripts/routine_coverage.sh

# 2. Customize AGENTS.md and CHARTER.md for your project

# 3. Take a snapshot before risky changes
vcm snapshot refactor-auth

# 4. Generate local governance report
vcm status                        # opens .vcm/report.html

# 5. Run the comprehensive health check
vcm doctor

# 6. (Optional) Push state to central dashboard
vcm-server &                       # start the dashboard server
vcm push --server http://127.0.0.1:7338

# 7. (Optional) Multi-user with bearer tokens
vcm user add alice
vcm token grant alice --label laptop --days 90
# → store the Bearer secret safely
```

## Project structure

```
vibe-coding-mgr/
├── bin/vcm.js                  # CLI entry point (Node.js)
├── lib/
│   ├── cli/                    # Command implementations
│   │   ├── init, snapshot, status, validate, push, peers
│   │   ├── skill (add/list/validate/convert/deprecate/retire/stale/sweep)
│   │   ├── marketplace (publish/unpublish/discover/install)
│   │   ├── lifecycle, user, doctor, schema-doc
│   ├── schemas/                # JSON Schema validators
│   │   ├── skill.schema.json
│   │   └── state.schema.json
│   └── templates/              # AGENTS/CHARTER templates
├── scripts/                    # 6 hard check scripts (Python)
│   ├── check_charter.py
│   ├── check_doc_drift.py
│   ├── check_constraint_governance.py
│   ├── check_adr_index.py
│   ├── check_data_layout.py
│   └── add_pi_skill.py
├── server/                     # Flask server for multi-project dashboard
│   ├── app.py                  # routes + scopes
│   ├── dashboard.py            # data assembly
│   ├── audit.py                # JSONL + SQLite audit log
│   ├── users.py                # per-user ACL (bcrypt + bearer tokens)
│   ├── scopes.py               # @require_scope decorator (ADR-0014)
│   ├── mcp_server.py           # stdio MCP for AI agents
│   └── templates/ + static/   # HTML + CSS + JS
├── tests/                      # vitest (191 tests)
└── docs/                       # DESIGN, ARCHITECTURE, ONBOARDING, PHILOSOPHY
    ├── adr/                    # 15 ADRs (one per hard constraint)
    ├── DESIGN.md               # design system source of truth
    ├── ARCHITECTURE.md
    └── ROADMAP.md
```

## Design discipline

vcm is held to a strict set of self-applied rules captured in
[CHARTER.md](CHARTER.md). The most important ones:

- **Adopt, never fork** — 5 ecosystem standards are adapted via thin
  wrappers (`lib/adapters/`), not vendored.
- **Local first** — works offline; the server is optional. Plain JSON
  files as the source of truth for skill registry, peer config.
- **Hard constraints have ADRs** — any rule that the system enforces
  must be written down in `docs/adr/` before code lands (191 tests
  document 15 ADRs).
- **Long-term stability > short-term less diff** — accept redundancy
  if it makes the system clearer.

The dashboard design follows [repowise's](https://docs.repowise.dev)
three principles: token-first CSS, "Answers:" header on every view, and
a strict 3-KPI grid per page (no blended score). See [DESIGN.md](docs/DESIGN.md).

## Adoption philosophy

vibe-coding-mgr **adopts** 5 ecosystem standards (not forks):

| Standard | What we adapt |
|---|---|
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | `name`/`description`/`tags` fields; npm-style distribution |
| [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) | "validated" concept; security checks |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) (AAS Core) | manifest idea; file/expression matching |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 6-phase lifecycle |
| [refly-ai/refly](https://github.com/refly-ai/refly) | durable-skills philosophy |

Unified via the `.vcm-skill.json` schema in `lib/schemas/skill.schema.json`.
Convert with `vcm skill convert --from <fmt> --to vcm < skill.json`.

## What vcm is NOT

- ❌ Not a code editor / IDE
- ❌ Not a replacement for Claude Code / Codex / Cursor / pi
- ❌ Not a code analysis tool (use [Repowise](https://docs.repowise.dev) for that)
- ❌ Not a project management tool (use [Plane](https://plane.so) for that)
- ❌ Not a lock-in — every artifact is plain text, easily migrated

## Quick health check

Run this on any vcm-tracked project to see the full picture:

```bash
vcm doctor                  # human-readable
vcm doctor --json | jq     # machine-readable for CI
```

A clean doctor output looks like:

```
vcm doctor — 4 sections
[governance]  6 hard checks       OK (6 OK, 0 WARN, 0 FAIL)
[skills]       3 registered        3 active
[repository]   15 ADRs             newest: 0015-schema-doc
[git hygiene]  working tree        clean
VERDICT: all OK (6/6)
```

CI integration: `vcm doctor --strict` exits 1 on any warning
(without `--strict`, only FAIL exits 1).

## Release cadence

| Version | Highlights |
|---|---|
| v0.9.0 | Audit purge endpoint, docs viewer with TOC + search |
| v0.7.0 | Per-endpoint scopes, schema doc generator, registry endpoint |
| v0.6.0 | Per-user ACL, audit log SQLite, `vcm doctor` |
| v0.5.0 | Audit log + trend dashboard + skill marketplace |
| v0.4.0 | MCP server, 5-standard adapter layer, SSE live updates, leaderboard |
| v0.3.0 | Repowise-inspired frontend redesign |
| v0.2.0 | Initial usable release (7 CLI commands, Flask server) |

See [CHANGELOG.md](CHANGELOG.md) for the full history. [ROADMAP.md](docs/ROADMAP.md)
tracks the future.

## License

MIT
