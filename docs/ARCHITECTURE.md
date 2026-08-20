# ARCHITECTURE

## Components

```
vibe-coding-mgr/
├── bin/vcm.js              CLI entry point (Node.js)
├── lib/
│   ├── cli/                Command implementations
│   │   ├── init.js         vcm init (generate governance files)
│   │   ├── snapshot.js     vcm snapshot (git tag + dirty backup)
│   │   ├── skill.js        vcm skill add/list/validate
│   │   ├── status.js       vcm status (local HTML report)
│   │   ├── validate.js     vcm validate (run 6 hard checks)
│   │   ├── push.js         vcm push (to vcm-server)
│   │   └── peers.js        vcm peers (stub in v0.1.0)
│   ├── schemas/            JSON Schema validators
│   │   ├── skill.schema.json
│   │   ├── state.schema.json
│   │   └── validate.js
│   └── templates/          Project bootstrap templates
│       ├── AGENTS.template.md
│       ├── CHARTER.template.md
│       └── .gitignore.additions
├── scripts/                6 hard check scripts (Python, vendored from sales-ai)
│   ├── check_charter.py
│   ├── check_doc_drift.py
│   ├── check_constraint_governance.py
│   ├── check_adr_index.py
│   ├── check_data_layout.py
│   └── routine_coverage.sh
├── server/                 Optional central dashboard (Flask)
│   ├── app.py
│   ├── requirements.txt
│   └── templates/
│       ├── dashboard.html
│       └── project.html
└── tests/
    ├── schemas.test.js
    └── cli.test.js
```

## Data flow

```
User runs `vcm init`
   ↓
Detect project name (from package.json / pyproject.toml / dir basename)
   ↓
Copy templates → AGENTS.md, CHARTER.md
   ↓
Append .vcm/ to .gitignore
   ↓
Done ✓
```

```
User runs `vcm snapshot foo`
   ↓
git rev-parse HEAD → get SHA
   ↓
Dump working tree diff → .git/snapshots/pre-foo-<sha>.diff
   ↓
git tag -a pre-foo-<sha> --allow-empty
   ↓
Done ✓ (rollback: git checkout pre-foo-<sha> + apply .diff)
```

```
User runs `vcm status`
   ↓
Detect:
  - AGENTS.md / CHARTER.md presence
  - .pi/skills or docs/skills (count + list)
  - docs/adr/ (count excluding INDEX.md)
  - docs/TECH_DEBT.md (count TD-XXX entries)
  - docs/post-mortems/ (count)
  - Git status (HEAD, branch, dirty)
   ↓
Build state JSON object
   ↓
Validate against state.schema.json
   ↓
Render HTML to .vcm/report.html
   ↓
Open in browser ✓
```

```
User runs `vcm push` (optional, requires vcm-server)
   ↓
Detect same state as `vcm status`
   ↓
Save to .vcm/state.json (local backup)
   ↓
POST to <server>/api/collect
   ↓
Server stores in SQLite, returns summary
```

## Integration model

### As npm package (recommended)

```
vibe-coding-mgr repo
   ├── published to npm as `vibe-coding-mgr`
   └── users install via:
       $ npm install -g vibe-coding-mgr   # global
       $ npm install vibe-coding-mgr      # local
```

### As git submodule (development)

```
sales-ai repo
   ├── submodule: vendor/vibe-coding-mgr → /path/to/vibe-coding-mgr
   └── package.json: "vibe-coding-mgr": "file:./vendor/vibe-coding-mgr"
```

### As local dev link

```
$ cd vibe-coding-mgr
$ npm link              # creates global symlink
$ cd my-project
$ npm link vibe-coding-mgr
```

## Adoption of ecosystem standards

vibe-coding-mgr **adapts** to 5 standards via thin wrapper layer (`lib/schemas/skill.schema.json`):

| Standard | What we adopt | What we don't |
|---|---|---|
| vercel-labs/skills | `name`/`description`/`tags` fields; npm distribution | Their CLI specific behavior |
| tech-leads-club/agent-skills | "validated" concept; security checks | Their registry backend |
| AAS Core (sickn33) | `manifest` idea; compose/validate flow | Their MCP server |
| addyosmani/agent-skills | 6-phase lifecycle idea | Their specific commands |
| refly-ai/refly | "durable skills" philosophy | Their web platform |

Unified schema: `lib/schemas/skill.schema.json` (source of truth) → adapters convert to/from each standard's metadata format.

## Schema

### `.vcm-state.json` (emitted by `vcm status` / `vcm push`)

See [lib/schemas/state.schema.json](../lib/schemas/state.schema.json).

Key fields:
- `schema_version` — for forward compatibility
- `project.{name, path}` — identifying
- `governance.{agents_md_present, skills_count, adrs_count, ...}` — metrics
- `health.{last_ci_pass, ci_failures, ...}` — health snapshot
- `git.{head_commit, branch, dirty, ...}` — git state

### `.vcm-skill.json` (skill metadata)

See [lib/schemas/skill.schema.json](../lib/schemas/skill.schema.json).

Key fields:
- `name` — slug (lowercase, hyphens)
- `description` — 30-200 chars, no banned words (skill-authoring §3)
- `tags` — array of slugs
- `authority` — `canonical` or `execution-index`
- `canonical_ref` — required for execution-index
- `source.compatible_with` — array of compatible standards
- `validation` — last validation timestamp + checks passed

## Failure modes

| Failure | Behavior |
|---|---|
| vcm-server down | `vcm push` saves locally, retries on next run |
| Python missing | `vcm validate` fails with clear error |
| Git missing | `vcm snapshot` fails with clear error |
| Node.js < 20 | `vcm` fails with version error |
| Schema invalid | `vcm status` writes report anyway + warns |
| Skill description has banned words | `vcm skill add` refuses + shows error |

## Security model

- vcm CLI runs locally, no network by default
- vcm-server binds 127.0.0.1 by default (not exposed publicly)
- `.vcm-state.json` contains no secrets
- `vcm push` uses HTTP (no auth) — for production add BasicAuth via `vcm-server` env vars

## Future roadmap

See [ROADMAP.md](./ROADMAP.md).
