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
│   ├── dashboard.py        # Data assembly for dashboard endpoints
│   ├── requirements.txt
│   ├── static/
│   │   ├── css/            # 3-layer CSS architecture (v0.3.0+)
│   │   │   ├── tokens.css       # color/typography/spacing tokens (single source)
│   │   │   ├── base.css         # reset + global typography
│   │   │   ├── components.css   # card/kpi-grid/tabs/drawer/table/badge/tag
│   │   │   └── dashboard.css    # thin compat wrapper, old .panel aliases
│   │   └── js/
│   │       ├── alpine.min.js    # reactivity (3.x)
│   │       └── echarts.min.js   # radar + bar charts
│   └── templates/
│       ├── _layout.html         # common shell (Jinja2 extends)
│       ├── _partials/
│       │   ├── nav.html         # top-nav with active state + theme toggle
│       │   └── attention_item.html
│       ├── dashboard.html       # cockpit (?tab=overview|attention|activity)
│       ├── project.html         # single project (?tab=overview|governance|health|history)
│       ├── skills.html          # skill registry (?tab=matrix|coverage|registry)
│       ├── peers.html           # OSS peer watch list
│       └── settings.html        # server meta + design tokens palette
└── tests/
    ├── schemas.test.js
    ├── cli.test.js
    ├── server.test.js           # API smoke tests
    └── templates.test.js        # HTML data-c= hook smoke tests (v0.3.0+)
```

## Front-end architecture (v0.3.0+)

The dashboard is a Jinja2-rendered, Alpine.js-hydrated, single-page-per-route app.
No SPA, no build step, no Tailwind. See [DESIGN.md](./DESIGN.md) for the design system.

### URL-routed state (DESIGN.md §5)

Every interactive state goes into the URL, so links are deep-linkable:

| URL                                       | View                       | Tab param                          |
|-------------------------------------------|----------------------------|------------------------------------|
| `/`                                       | Cockpit                    | `?tab=overview\|attention\|activity` |
| `/projects/<name>`                        | Single project             | `?tab=overview\|governance\|health\|history` |
| `/skills`                                 | Skill registry             | `?tab=matrix\|coverage\|registry`     |
| `/peers`                                  | OSS peer watch list        | —                                  |
| `/settings`                               | Server meta                | —                                  |

Implementer's note: `setTab()` in each template uses `history.replaceState`, so
back/forward navigation behaves like a real router.

### CSS layering rule

```
tokens.css  ← 唯一颜色 / 字号 / 间距 token 源 (CHANGE in DESIGN.md §2)
   ↓ @import
base.css    ← reset + 排版层 + 工具类 (text-display, kpi-grid 等)
   ↓ @import
components.css ← 组件 (c-card / .badge / .tag / .tabs / .drawer / .data-table)
   ↓ @import
dashboard.css ← 兼容别名 (旧 .panel / .cell-ok)，新视图禁写这里
```

**纪律**：tokens.css 不 import 任何东西。所有页面级 CSS 通过 dashboard.css 走。

### Component primitives (DESIGN.md §4)

| Class          | 作用                          | 关键 token 引用              |
|----------------|-------------------------------|------------------------------|
| `c-card`       | 内容卡片                      | `--surface` `--border-subtle` |
| `kpi-grid`     | 三列 KPI 永远等宽             | `--space-4`                   |
| `tabs` / `.tab`| tab 行 + 当前状态             | `--accent` `--text-secondary` |
| `data-table`   | zebra + 行状态条              | `--surface-alt`               |
| `badge--ok\|warn\|fail\|idle` | 4 种状态胶囊  | `--ok-dim` 等                  |
| `tag / tag--soft / tag--muted` | skill/ADR/TD 标签 | `--accent-dim`                 |
| `attention / .attention--critical` | need-attention 条 | `--warn-dim` `--fail-dim`     |
| `drawer`       | 右滑上下文抽屉（preparation） | `--bg-elevated`               |

新增组件前先查 DESIGN.md §4 §5。已实现组件全部 token-based，
从未硬编码 hex / px。

### "Answers:" discipline

Every view must start with a one-line `answers-line` block answering the
question that view exists to address:

```html
<div class="answers-line">
  <span class="answers-tag">Answers</span>
  <p>which projects are unhealthy, what they lack, and what's changed.</p>
</div>
```

This is from repowise's "each view answers one question" pattern, codified
into the project. Skip the line and the review rejects.

### Data-test hooks

Components ship with `data-c="<name>"` attributes for smoke tests:

```
data-c="kpi-grid", data-c="card-projects", data-c="projects-table",
data-c="card-skills-xref", data-c="card-attention",
data-c="tab-panel" data-tab="overview", data-c="peers-list",
data-c="badge", data-c="kpi", data-kpi="..." ...
```

See `tests/templates.test.js` for the assertions.

### Light / dark theming

Toggle via `document.documentElement.dataset.theme = 'light' | 'dark'`.
Choice persisted in `localStorage` under key `vcm-theme`. Token definitions
for light theme live in the same `tokens.css` file
(`:root[data-theme="light"] { ... }`) — components never reference hex.
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
