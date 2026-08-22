# Handoff Document — vibe-coding-mgr v0.9.0

> **For the next agent**: this document is the complete state of
> the project. It assumes the next agent has not been part of the
> v0.2 → v0.9 development. If you already know the codebase, you can
> skip to the bottom of the file and look at "Open work" only.

---

## 1. What is this project?

**vibe-coding-mgr** (CLI: `vcm`) is a personal / small-team governance
layer for **vibe coding** — the practice of using AI coding agents
(Claude Code, Codex, Cursor, pi) to write most of your code under
human direction.

**The problems it solves:**
- "Is this project set up so AI can be effective here?" → `vcm init`
- "What just got shipped; is anyone watching?" → `vcm status / push / snapshot`
- "Is this project still healthy; what's drifting?" → `vcm doctor / validate`
- "Where should I focus my attention across N projects?" → `vcm-server` dashboard

**Adopt-not-fork**: 5 ecosystem standards (vercel-labs/skills,
tech-leads-club/agent-skills, sickn33/agentic-awesome-skills,
addyosmani/agent-skills, refly-ai/refly) are adapted via thin wrapper
layers (`lib/adapters/`), never vendored.

**Local-first**: works offline. The `vcm-server` is optional.

---

## 2. Current state (v0.14.1)

| Item | Value |
|---|---|
| Version | `0.14.1` (in `package.json` + `bin/vcm.js` + `server/mcp_server.py`) |
| Tests | **368/368 passing** (29 test files, 53 in i18n.test.js alone) |
| 6 hard checks | 6 OK (`bash scripts/routine_coverage.sh` exit 0) |
| ADRs | **26** in `docs/adr/0001-` to `0026-` (latest: bilingual UI) |
| Routes | **39** `@app.route` decorators in `server/app.py` |
| Python modules | 10 in `server/` (`app`, `audit`, `dashboard`, `docs_search`, `i18n`, `markdown_render`, `mcp_server`, `peers`, `scopes`, `users`) |
| CLI commands | 11 (init/snapshot/skill/status/validate/push/peers/user/token/doctor/schema) |
| Templates | 11 in `server/templates/` (`_layout`, `_docs`, `_partials/nav`, audit/dashboard/drift/leaderboard/peers/project/settings/skills/trends) |
| Source files | ~140 in git tree |
| Bilingual UI | zh (default) + en, 380 keys, server-rendered (ADR-0026) |
| Repo | `https://github.com/your-org/vibe-coding-mgr` (URL in README; placeholder) |

**v0.14.1 is the latest release** (commits `92f5d8d` + `3ad52a8`). It is a
patch on v0.14.0 that expands the bilingual coverage from 220 → 380 keys
per language, adds the Alpine JS bridge (`window.__vcm_i18n__` +
`window.t`), and translates every user-visible string on all 11 templates.

**Release lineage since v0.9.0** (the version this handoff was originally
written for):
- v0.10.0: drift detection view (ADR-0019), market registry HTTP,
  244 → 259 tests
- v0.11.0: MCP-HTTP transport, peer gossip + marketplace, docs full-text
  search (ADR-0020), 259 → 279 tests
- v0.12.0: audit filtering UI + `/api/audit/facets` (ADR-0024), root-cause
  fix to `_read_sqlite`, 279 → 297 tests
- v0.13.0: **first persistent-runtime release**. systemd user unit
  (ADR-0025), `install-service.sh` / `uninstall-service.sh`,
  `~/.vcm/server.env`, 297 → 315 tests
- v0.14.0: **bilingual UI** (ADR-0026). 12 templates translated,
  `?lang=` + cookie + Accept-Language resolution, server-rendered nav
  toggle, default zh, 315 → 341 tests (+ 26 i18n tests)
- v0.14.1: **comprehensive translation rollout**. 220 → 380 keys, Alpine
  JS bridge, all 11 templates end-to-end translated, 341 → 368 tests
  (+ 27 i18n tests)

---

## 3. Repo layout

```
vibe-coding-mgr/
├── AGENTS.md                     # agent rules (CHARTER §10 — "read this first")
├── CHARTER.md                    # the 5-价值观 + 10-元决策 (project constitution)
├── README.md                     # user-facing entry point
├── CHANGELOG.md                  # v0.2.0 → v0.9.0 history
├── HANDOFF.md                    # ← you are here
├── ROADMAP.md (in docs/)         # forward-looking plans
├── package.json                  # npm metadata
├── bin/vcm.js                    # CLI entry (Node.js, commander)
├── lib/
│   ├── cli/                      # command implementations (Node.js)
│   │   ├── init, snapshot, status, validate, push, peers
│   │   ├── skill.js              # add/list/validate/convert/deprecate/retire/stale/sweep
│   │   ├── marketplace.js        # publish/unpublish/discover/install
│   │   ├── user.js / users_cli.py   # ADR-0011 ACL (mixed Node + Python shim)
│   │   ├── lifecycle.js          # ADR-0006
│   │   ├── doctor.js             # ADR-0013
│   │   └── schema-doc.js         # ADR-0015
│   ├── adapters/                 # 5 standards (vercel-labs, tech-leads-club, …)
│   ├── schemas/                  # skill.schema.json, state.schema.json
│   └── templates/                # AGENTS / CHARTER templates for `vcm init`
├── scripts/                      # 6 hard check Python scripts (called by validate)
├── server/                       # Flask server (vcm-server) — see §5
├── tests/                        # 21 vitest files (212 tests)
└── docs/
    ├── DESIGN.md                 # design system source of truth
    ├── ARCHITECTURE.md           # 5-domain architecture
    ├── ROADMAP.md                # v0.10.0 plan
    ├── PHILOSOPHY.md / ONBOARDING.md / REFERENCES.md
    ├── CHANGELOG.md              # per-version narrative
    └── adr/                      # 19 ADRs (0001-0019)
```

**Read these files in order if you're new:**
1. `AGENTS.md` (project-level agent rules)
2. `CHARTER.md` (the project's constitution: 5 价值观 + 10 元决策)
3. `docs/DESIGN.md` (frontend design system, for UI work)
4. `docs/adr/` (19 ADRs — every hard constraint has a written rationale)

---

## 4. The 5-domain architecture (CHARTER §2)

| Domain | Path | What lives here | Reverse-dep banned |
|---|---|---|---|
| **core** | `lib/` (CLI core) | schemas, adapters, command impls | can't depend on server/ |
| **cli** | `bin/vcm.js` | arg parsing, dispatch | can't depend on server/ |
| **server** | `server/` | Flask + SQLite dashboard | can't depend on sales-ai specifics |
| **standards** | `lib/adapters/` | thin wrappers around 5 skill standards | can't fork source |
| **templates** | `lib/templates/` | AGENTS/CHARTER project bootstrap | no business logic |

**Cross-domain calls go through adapters**, never direct imports.

---

## 5. The server (vcm-server)

`server/app.py` is the Flask app. It binds routes from several modules.

### 5.1 Python modules in `server/`

| File | What it does | Lines |
|---|---|---|
| `app.py` | Flask app, route registration, scope enforcement | ~970 |
| `dashboard.py` | Aggregated data queries (`get_overview`, `get_attention`, `get_leaderboard`, `get_trend`) | ~370 |
| `audit.py` | Append-only JSONL + SQLite audit log (`write_event`, `read_events`, `event_stats`) | ~290 |
| `users.py` | bcrypt users + bearer tokens (ADR-0011) | ~330 |
| `scopes.py` | `@require_scope('read'\|'push'\|'admin')` decorator (ADR-0014) | ~80 |
| `markdown_render.py` | Tiny stdlib markdown→HTML (ADR-0018) | ~125 |
| `mcp_server.py` | stdio MCP server with 5 tools (ADR-0002) | ~150 |

### 5.2 HTTP routes (30 total)

| Path | Method | Scope | Notes |
|---|---|---|---|
| `/api/health` | GET | public | always 200 |
| `/api/collect` | POST | `push` | state push, with SSE broadcast |
| `/api/audit` | GET | `read` | events list, paginated |
| `/api/audit/stats` | GET | `read` | event counters by type |
| `/api/audit/purge` | POST | `admin` | literal "PURGE" confirm word |
| `/api/dashboard/overview` | GET | `read` | all projects + summary |
| `/api/dashboard/skill-matrix` | GET | `read` | skill → projects |
| `/api/dashboard/attention` | GET | `read` | projects needing attention |
| `/api/dashboard/activity` | GET | `read` | recent pushes |
| `/api/dashboard/skill-aging` | GET | `read` | |
| `/api/dashboard/summary` | GET | `read` | |
| `/api/dashboard/trend` | GET | `read` | weekly trend buckets |
| `/api/dashboard/leaderboard` | GET | `read` | 6 sort dims |
| `/api/dashboard/stream` | GET | `read` | SSE: project_push, attention_changed, heartbeat |
| `/api/projects` | GET | `read` | |
| `/api/projects/<name>` | GET | `read` | |
| `/api/project/<name>/full` | GET | `read` | latest + history |
| `/api/registry/skills` | GET | `read` | local `~/.vcm/registry/` |
| `/api/registry/publish` | POST | `push` | server-side publish |
| `/api/audit/purge` | POST | `admin` | |
| `/api/docs/index` | GET | `read` | enumerate docs/*.md |
| `/api/peers` | GET | `read` | `~/.vcm/peers.yaml` |
| `/api/users` | * | n/a | not implemented yet |
| `/` | GET | public | cockpit dashboard |
| `/projects/<name>` | GET | public | project detail |
| `/skills` | GET | public | cross-project skill registry |
| `/leaderboard` | GET | public | |
| `/trends` | GET | public | |
| `/audit` | GET | public | audit log viewer |
| `/peers` | GET | public | |
| `/settings` | GET | public | |
| `/docs/<path>.md` | GET | public | rendered markdown |

### 5.3 Scope ladder (ADR-0014)

```python
SCOPE_RANK = {"read": 1, "push": 2, "admin": 3}

@require_scope("read")   # any auth user (token or basic)
@require_scope("push")   # can write state_pushed
@require_scope("admin")  # can purge audit log
```

Token scope WINS over user scope (delegation model).
`verify_token()` returns `(scope, user_id, label)`.

### 5.4 Audit log (ADR-0009, 0012)

**Dual-write** for redundancy:
- `~/.vcm/audit.log` (or `$VCM_AUDIT_LOG`) — JSONL, append-only
- `server/vcm.db` — SQLite `audit_events` table with indices

```sql
CREATE TABLE audit_events (
  id INTEGER PK, ts TEXT, event_type TEXT,
  project TEXT, source_ip TEXT, payload TEXT
);
-- indices: ts, event_type, project, (ts, event_type)
```

Event types: `auth_failure`, `state_pushed`, `state_rejected`,
`scope_forbidden`, `registry_publish`, `audit_purge`, `registry_publish`.

### 5.5 Run the server

```bash
cd /home/mm7/vibe-coding-mgr
.venv/bin/python3 server/app.py
# binds 127.0.0.1:7338 by default
# or: VCM_SERVER_PORT=8080 .venv/bin/python3 server/app.py
# with auth: VCM_AUTH_USER=alice VCM_AUTH_PASS=secret ...
```

Required env (any subset):
- `VCM_SERVER_PORT` (default 7338)
- `VCM_SERVER_DB` (default `./vcm.db`; same path as test DBs)
- `VCM_AUDIT_LOG` (default `~/.vcm/audit.log`)
- `VCM_AUTH_USER` / `VCM_AUTH_PASS` (enables BasicAuth)
- `VCM_REGISTRY_DIR` (default `~/.vcm/registry/skills`)

---

## 6. The CLI

`bin/vcm.js` (Node.js) dispatches to `lib/cli/*.js` for most commands.
Two commands (`vcm user`, `vcm token`) delegate to `lib/cli/users_cli.py`
because they need bcrypt + SQLite.

### 6.1 Commands

| Command | Purpose |
|---|---|
| `vcm init [dir]` | Generate AGENTS.md, CHARTER.md, scripts/ in a project |
| `vcm snapshot <name>` | git tag + dirty backup |
| `vcm status` | local HTML governance report at `.vcm/report.html` |
| `vcm validate [--ci]` | 6 hard check scripts (CHARTER §9 + §10) |
| `vcm push [--server URL]` | POST state to vcm-server |
| `vcm peers <action>` | GitHub API peer management (v0.4+ real impl) |
| `vcm skill add/list/validate/convert/deprecate/retire/stale/sweep/publish/unpublish/discover/install` | the central abstraction |
| `vcm user add/list/passwd/delete` | per-user ACL (ADR-0011) |
| `vcm token grant/revoke/list` | bearer tokens |
| `vcm doctor [--json] [--strict]` | comprehensive 4-section health check |
| `vcm schema doc <name>` | JSON Schema → Markdown |

### 6.2 vcm user / vcm token (cross-process)

These commands spawn a Python subprocess (`lib/cli/users_cli.py`) so
bcrypt + SQLite can be used. **Always pass `VCM_SERVER_DB` env** so
the subprocess writes to the same DB as the server reads.

Pattern from `tests/scopes.test.js`:

```javascript
import { spawnSync } from 'node:child_process';
const out = spawnSync(
  join(VCM_ROOT, '.venv', 'bin', 'python3'),
  [join(VCM_ROOT, 'lib/cli/users_cli.py'), 'token', 'grant', username, '--scope', scope, ...],
  { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: dbPath } }
).stdout;
const token = out.match(/Bearer\s+(\S+)/)[1];
```

---

## 7. Tests

`tests/` — 21 vitest files, 212 tests. They run server-spawning patterns
for integration coverage. Each test file picks a unique port to avoid
parallel-execution conflicts.

### 7.1 Test files (21)

| File | What it tests | Lines |
|---|---|---|
| `tests/cli.test.js` | CLI version, init, snapshot | ~150 |
| `tests/server.test.js` | basic API endpoints + auth | ~150 |
| `tests/templates.test.js` | HTML smoke for templates | ~150 |
| `tests/scopes.test.js` | ADR-0014 scope enforcement | ~210 |
| `tests/users.test.js` | ADR-0011 per-user ACL | ~210 |
| `tests/audit.test.js` | audit endpoints + JSONL | ~150 |
| `tests/audit-stats-view.test.js` | /audit UI uses /api/audit/stats | ~80 |
| `tests/audit-purge.test.js` | ADR-0016 admin purge | ~250 |
| `tests/registry-publish.test.js` | server-side publish | ~180 |
| `tests/docs-viewer.test.js` | ADR-0017 /docs viewer | ~110 |
| `tests/leaderboard.test.js` | ADR-0005 leaderboard | ~140 |
| `tests/trends.test.js` | ADR-0010 trends | ~120 |
| `tests/sse.test.js` | ADR-0007 SSE stream | ~150 |
| `tests/users.test.js` | ADR-0011 per-user (overlap) | — |
| `tests/marketplace.test.js` | ADR-0008 CLI marketplace | ~250 |
| `tests/lifecycle.test.js` | ADR-0006 lifecycle | ~250 |
| `tests/adapters.test.js` | ADR-0003 adapter layer | ~250 |
| `tests/doctor.test.js` | ADR-0013 doctor CLI | ~150 |
| `tests/auth.test.js` | ADR-0004 BasicAuth | ~200 |
| `tests/registry.test.js` | server-side read of local registry | — |
| `tests/schemas.test.js` | JSON Schema unit | — |

### 7.2 Server-spawning test pattern

Tests that need a live server use this pattern (see `tests/scopes.test.js`):

```javascript
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const PORT = 7480;  // pick a unique port to avoid parallel conflicts
let server, tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vcm-test-'));
  const venvPython = join(VCM_ROOT, '.venv', 'bin', 'python3');
  server = spawn(venvPython, ['server/app.py'], {
    cwd: VCM_ROOT,
    env: { ...process.env, VCM_SERVER_PORT: String(PORT),
           VCM_SERVER_DB: join(tmpDir, 's.db'),
           VCM_AUTH_USER: 'auditor', VCM_AUTH_PASS: 'secret',
           VCM_AUDIT_LOG: join(tmpDir, 'audit.log') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // wait for /api/health to be 200
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
          if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
}, 30000);

afterAll(() => {
  if (server) server.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Reset state between tests (user-cli subprocess writes the same DB):
  spawnSync(join(VCM_ROOT, '.venv', 'bin', 'python3'),
    ['-c', `import sqlite3; conn = sqlite3.connect('${join(tmpDir, 's.db')}');
conn.executescript('DELETE FROM tokens; DELETE FROM users;');
conn.commit(); conn.close()`],
    { encoding: 'utf8', env: { ...process.env, VCM_SERVER_DB: join(tmpDir, 's.db') } });
});
```

**Key gotchas:**
- Always pass `VCM_SERVER_DB` to subprocess CLIs so they write to the
  test's DB (not cwd-relative default).
- Each test file must use a **unique port** (7480–7490 range) to avoid
  parallel-execution port conflicts.
- `audit.write_event` uses `datetime.now()` and ignores any `at`
  parameter — for historical timestamps, do raw SQL with `ensure_events_table()`
  first.

### 7.3 Run tests

```bash
cd /home/mm7/vibe-coding-mgr
npm test                                # all 212 tests, ~18s
npm test -- tests/scopes.test.js        # single file
npm test -- tests/audit-purge.test.js -t "POST /api/audit/purge"
npm test 2>&1 | tail -3                  # summary
```

---

## 8. The 6 hard checks

`scripts/check_*.py` run by `scripts/routine_coverage.sh`:

| Script | What it checks |
|---|---|
| `check_charter.py` | AGENTS.md + CHARTER.md exist |
| `check_doc_drift.py` | docs/ has markdown files (drift detection) |
| `check_constraint_governance.py` | AGENTS + CHARTER both exist |
| `check_adr_index.py` | ADRs in docs/adr/ are unique |
| `check_data_layout.py` | required project files present |
| (skill registry check) | `.pi/skills` or `docs/skills` exists (warning, not error) |

Run individually: `bash scripts/routine_coverage.sh` or
`vcm validate`. Returns exit 0 on success.

---

## 9. CHARTER (project constitution)

Located in `CHARTER.md` (repo root). The 5 价值观:

1. **治本优于治标** (root cause > symptoms)
2. **架构边界** (5 domains — see §4)
3. **长期稳定 > 短期少 diff** (accept redundancy)
4. **有勇气重构** (refactor when modules grow)
5. **净技术债最小** (new feature ↔ debt repayment)

The 10 元决策 (10 meta-rules) include:
- §6: 数据是事实，写操作必经审批 (audit all writes)
- §7: 数据库是事实唯一源 (SQLite is truth)
- §8: 本地优先 (offline-first)
- §9: 任何修改代码同步文档 (docs go with code)
- §10: 规约承载 (every hard constraint has ADR + skill + test)

**`vcm doctor` is how the project verifies §6/§7/§10 in practice.**

---

## 10. ADR template (use for new constraints)

Every hard rule needs an ADR before code lands. Pattern from existing:

```markdown
# ADR-NNNN — short title (1 line)

**状态**: 待实施（v0.X.0）
**日期**: 2026-08-21
**作者**: <who>

## 背景
What problem? What triggered this?

## 决策
What we do. Be specific.

### 反对意见
**Q: Why not X?**  
**A: ...**

### 后果
#### 正面
- ...

#### 负面 / 风险
- ...

### 验收
```bash
# concrete commands
```

### 不做
- ❌ (out-of-scope items)

## 参考
- [other ADR](NNNN-...)
- [CHARTER §N](../CHARTER.md)
```

Place file at `docs/adr/NNNN-short-slug.md`. Then update
`scripts/routine_coverage.sh`'s `check_adr_index.py` if needed (it
counts files matching `\d{4}-` prefix).

---

## 11. Open work (v0.15.0 plan)

This section has been **mostly retired** — every item from the v0.10.0
plan is now shipped (drift view, docs full-text search, audit filtering,
plus more added since). What remains is genuinely future-looking.

### 11.1 What's left of the v0.10.0 list

| Item | Status | Notes |
|---|---|---|
| **WebSocket MCP transport** | not started | ADR deferred — stdio MCP works for AI agents today |
| **Cross-server leaderboard gossip** | not started | Single-server model is sufficient up to ~50 projects |
| **Skill marketplace cross-server** | not started | LAN-shared registry; low priority until demand emerges |
| **Docs full-text server-side search** | **done in v0.11.0** | ADR-0020; lives in `server/docs_search.py` |
| **`/drift` view (ADR-0019)** | **done in v0.10.0** | `/drift` route + `dashboard.py:get_drift_score` |
| **Tests for ADR-0018 markdown_render** | **done** | `tests/markdown-render.test.js` (19 tests) + `tests/docs-viewer.test.js` |

### 11.2 v0.15.0 candidates (post v0.14.1)

The user's most recent push-back ("翻译得不够彻底") closed v0.14.1 with
the bilingual UI fully covered. Natural next steps:

1. **macOS launchd `vcm-server.plist`** — ADR-0025 explicitly defers
   this; needed for Mac users who want the same "survives logout"
   guarantee that Linux gets from `systemd --user`. Estimate: 1 PR +
   ~10 lines of install/uninstall scripts mirroring the systemd flow.

2. **SKILL.md files per CHARTER §10** — `docs/SKILLS.md` is referenced
   in AGENTS.md but the per-skill `SKILL.md` files for "peer protocol",
   "MCP HTTP transport", "drift detection", "docs search" are not yet
   checked into `.pi/skills/`. This is the "self-document the
   system" pass.

3. **README modernization — minor polish** — the v0.14.1 README pass
   fixed version numbers + bilingual mention. Remaining: install
   commands on non-Ubuntu, npm-published versions, contributor
   workflow (no CONTRIBUTING.md yet).

4. **v0.15.0 scoped feature**: pick one of (a) launchd plist,
   (b) `SKILL.md` rollout, (c) cross-language server messaging
   protocol. None has a written ADR yet — write the ADR first.

### 11.3 Future-only items (do not pick up without explicit ask)

- WebSocket MCP transport (see §11.1) — high-risk protocol migration.
- Cross-server gossip / marketplace (see §11.1) — networking surface.
- Anything requiring mcp 2.0 or a new runtime dep — violates CHARTER §8.

---

## 12. Critical landmines for the next agent

### 12.1 Flask decorator order (silent bug)

Flask's `@app.route(...)` **returns the original function unchanged**.
So if you write:

```python
@scopes_mod.require_scope("push")  # outer
@app.route("/api/x", methods=["POST"])
def x(): ...
```

The scope check is **silently dropped** because `app.route()` already
stored the original function as the view by the time `@require_scope`
runs. Always put `@app.route` as the OUTER decorator:

```python
@app.route("/api/x", methods=["POST"])  # outer
@scopes_mod.require_scope("push")      # inner
def x(): ...
```

This is a famous Flask gotcha; we hit it in v0.7.0 and it took hours
to diagnose. Documented in commit `2bfe220` and ADR-0014.

### 12.2 Audit timestamp is `datetime.now()` only

`server/audit.py:write_event` always uses `datetime.now()`. It has
no `at=` parameter (the parameter name is ignored). For tests that
need historical timestamps, do raw SQL:

```python
spawnSync('python3', ['-c', f'''
import sys
sys.path.insert(0, '{VCM_ROOT}/server')
import audit, sqlite3
db = '{tmpDir}/s.db'
audit.ensure_events_table(sqlite3.connect(db))
conn = sqlite3.connect(db)
conn.executescript("""INSERT INTO audit_events (ts, event_type, project, source_ip, payload)
VALUES ('{past}', 'auth_failure', NULL, '127.0.0.1', '{{}}')""")
conn.commit(); conn.close()
'''], { env: { ...process.env, VCM_SERVER_DB: db } });
```

### 12.3 SQLite WAL mode for multi-process

`server/audit.py`, `server/users.py`, and `server/app.py` open the
same SQLite DB file from multiple processes (CLI + Flask). They all
call `_enable_wal(conn)` which sets `PRAGMA journal_mode=WAL` and
`PRAGMA synchronous=NORMAL`. **Always call this** on new connections
that share a DB file, or you get `database is locked` errors.

### 12.4 Path-resolution gotcha (in template-rendering helpers)

`lib/cli/*.js` and `bin/vcm.js` have helpers like:

```javascript
const HERE = dirname(new URL(import.meta.url).pathname);
const VCM_ROOT = resolve(HERE, '..', '..');
```

**Do NOT call `.pathname.replace(/^\//, '')`** — it strips the leading
slash from `pathname` and breaks `resolve()`. We hit this bug in
doctor.js in v0.6.0; the path ended up doubled like
`/home/.../home/...`. Symptom: file-not-found errors on existing
scripts. Fix: just use `pathname` directly.

### 12.5 Tests must use unique ports

When vitest runs in parallel (default), all test files spawn their
server on their declared port. If two files share a port, the
second one fails to bind. The current allocation:

| Test file | Port |
|---|---|
| `tests/scopes.test.js` | 7480 |
| `tests/users.test.js` | 7481 |
| `tests/registry-publish.test.js` | 7488 |
| `tests/audit.test.js` | 7338 (default, conflict-prone — see §13) |
| `tests/audit-purge.test.js` | 7485 |
| `tests/audit-stats-view.test.js` | 7482 |
| `tests/docs-viewer.test.js` | 7487 |
| others | 7338 (default) |

**Always pick a unique port (7480–7490) for new test files.**

---

## 13. Known issues / bugs to fix

This section tracks genuine outstanding issues. Items resolved in
recent releases have been **retired** to keep the list honest (don't
list a bug as "open" when it has a passing test).

### 13.1 ~~Port 7338 collisions~~ RETIRED

Resolved. Every test file now binds its own port in the 7338-7595
range (e.g. `audit-facets.test.js` → 7494, `i18n.test.js` → 7495,
`leaderboard.test.js` → 7380). Parallel `npm test` runs no longer
collide.

### 13.2 ~~No test for the markdown renderer~~ RETIRED

Resolved in v0.11.0. `tests/markdown-render.test.js` has 19 tests
covering headers/bold/italic/code/links/lists/fenced blocks + the
`<script>` XSS guard. `tests/docs-viewer.test.js` covers the
`/docs/` route integration. Live-verified in HANDOFF §11.1.

### 13.3 ~~The doc-tree nav highlight is unreliable~~ RETIRED

Resolved. `server/templates/_docs.html` was rewritten to use a plain
property `filtered: []` (Alpine 3.x doesn't track get/set accessor
functions the same way as plain properties). The active-link
highlight now reliably fires on the rendered page. 4 regression
tests added.

### 13.4 ~~Audit-purge test count of 1 instead of 3~~ RETIRED

The original "post-purge GET should have `events.length=2`" assertion
was correct in intent (it counted the events that survived the purge,
not the purge action itself). After several release cycles of test
refinement, the file has 5 passing tests covering: admin scope
required, non-admin rejected, purged events removed, `audit_purge`
event itself recorded, and purge idempotency.

### 13.5 `server/dashboard.py` has both `get_overview` and `get_attention` etc. that are similar. There's no abstraction.

**Status: STILL OPEN, low priority**. Don't refactor without a reason —
it works and the tests pin the behaviour. (Repeating verbatim from
the original handoff because the warning is still valid.)

### 13.6 NEW — i18n fallback keys leak through (v0.14.1 fix)

The v0.14.0 release shipped bilingual UI with ~220 keys; users reported
"翻译得不够彻底" — the rest of the strings were falling through to the
English default via the zh→en miss-fallback. v0.14.1 closed this
(380 keys, all 11 templates end-to-end translated, +27 i18n tests
asserting "no English leakage" on the most-visited pages). See CHANGELOG
v0.14.1 entry for the full audit.

---

## 14. Step-by-step "how to do X" recipes

### "I want to add a new CLI command"

1. Add to `lib/cli/<name>.js` (e.g., `lib/cli/mything.js`).
2. Export an `async function mythingCommand(args, options) { ... }`.
3. In `bin/vcm.js`, add:
   ```javascript
   import { mythingCommand } from '../lib/cli/mything.js';
   program.command('mything').description('...').action(mythingCommand);
   ```
4. Test in `tests/<name>.test.js` (vitest).
5. Add a row to `README.md`'s CLI table.

### "I want to add a new HTTP route"

1. In `server/app.py`, choose a unique route path.
2. Decide scope: most reads are `read`, writes are `push`, deletes are `admin`.
3. Add the route:
   ```python
   @app.route("/api/my-route")
   @scopes_mod.require_scope("read")  # ALWAYS put @app.route FIRST
   def my_route():
       return jsonify({...})
   ```
4. Test in `tests/<feature>.test.js` using the server-spawning pattern (§7.2).
5. Update ARCHITECTURE.md endpoint table.

### "I want to add a new audit event type"

1. Pick a string name (e.g., `state_rejected`).
2. Where the event happens: `audit.write_event("state_rejected", **fields)`.
3. Add a row to the `event_stats` colors/badge logic in `server/templates/audit.html` if you want a colored badge.
4. Tests don't need explicit changes — they just check that audit events get recorded.

### "I want to add a new ADR"

1. Create `docs/adr/NNNN-short-slug.md` using the template (§10).
2. ADR number = next sequential number after the last (currently 0019).
3. Tests don't reference ADRs by number — just reference by file path.

### "I want to add a new dashboard tab"

1. Edit the relevant template (e.g., `templates/leaderboard.html`).
2. Add a `<nav class="tabs">` block.
3. Add Alpine.js `setTab(name)` and `<button @click="setTab('x')">`.
4. Update nav link in `_partials/nav.html` if a top-level nav entry.

---

## 15. Final inventory

```
$ tree -L 2 -I 'node_modules|.venv|__pycache__' /home/mm7/vibe-coding-mgr
```

(See live tree for current state. Key top-level entries listed in §3.)

```
$ wc -l server/*.py lib/cli/*.js bin/vcm.js
```

Approximate sizes (growing fast — refresh yourself before quoting):
- `server/app.py`: ~970 lines
- `server/dashboard.py`: ~370
- `server/audit.py`: ~290
- `server/users.py`: ~330
- `server/scopes.py`: ~80
- `server/markdown_render.py`: ~125
- `server/mcp_server.py`: ~150
- `bin/vcm.js`: ~120
- `lib/cli/*.js` (12 files): ~1500 total

---

## 16. TL;DR for the next agent

1. The project is **v0.14.1, healthy, 368/368 tests passing**.
2. **Read `AGENTS.md` and `CHARTER.md` first** — they define the rules.
3. **Read the most recent ADRs** (0025–0026) — they describe the
   "what we just decided" trajectory. ADR-0025 is the
   persistent-server one, ADR-0026 is the i18n one. v0.14.1
   does not introduce a new ADR — it extends the same i18n
   scope (catalog growth + Alpine JS bridge).
4. **Don't refactor without an ADR.** If you find yourself wanting
   to, write ADR-0027 first.
5. **Tests use unique ports** (7480+) to avoid parallel conflicts;
   audit-facets claims **7494** (next free above 7493).
6. **The 6 hard checks** must pass before any commit
   (`bash scripts/routine_coverage.sh`).
7. ✅ **All handoff items closed through v0.13.0**:
   - §11.1 markdown-render tests (19) + double-escape template fix
   - §11.2 /drift view + /api/dashboard/drift (13 tests)
   - §13.3 docs sidebar nav highlight (replaced get/set accessors
     with plain property in `_docs.html`, +4 regression tests)
   - §13.4 audit-purge post-purge surviving-event assertion
   - v0.11.0: docs full-text search (12), MCP-HTTP (11), peer gossip
     + marketplace (9), `init_db()` moved to `dashboard.py` to break
     the circular import.
   - v0.12.0: audit filtering UI + `/api/audit/facets` (9), plus the
     **root cause fix** to `_read_sqlite` (NameError swallowed by
     JSONL fallback) that made `?source_ip=` silently return 0 rows.
   - v0.13.0: **first persistent-runtime release**. systemd user unit
     `scripts/vcm-server.service` + `install-service.sh` /
     `uninstall-service.sh` + `~/.vcm/server.env` template. ADR-0025
     reconciles with ADR-0022's "no in-process daemon complexity"
     by making the daemon *around* the process, not *inside* it.
     **Post-release bugfixes (commit 4770d0b)**: (a) StartLimit*
     directives moved [Service] → [Unit] per man page; (b)
     install-script /api/health probe is now retry-based
     (10 × 0.5s = ~5s budget) to survive the systemd-active/
     in-process-bind race.
   - v0.14.0: **bilingual UI** (ADR-0026). 12 templates translated,
     `?lang=` + cookie + Accept-Language resolution, server-rendered
     nav toggle, default zh. +26 i18n tests.
   - v0.14.1: **comprehensive translation coverage**. +160 i18n
     keys (220 → 380, balanced en↔zh), Alpine JS bridge
     (`window.__vcm_i18n__` + `window.t`) so Alpine components
     can translate dynamic strings (sort buttons, KPI labels,
     badge text), all 9 templates now end-to-end translated.
     +27 i18n test assertions across 9 pages × 2 langs +
     6 "no English leakage" + 3 JS-bridge. 3 pre-existing
     test files updated for i18n compatibility
     (`templates.test.js`, `markdown-render.test.js`,
     `leaderboard.test.js`).
   - **368/368 tests passing, 29 files, all 6 hard checks green**
   - vcm-server is **live on http://127.0.0.1:7339/** (was 7340
     mid-session; uninstall+reinstall auto-picked 7339 because
     repowise had 7338 again). Process: systemd user-1 service
     under `/user.slice/user-1002.slice/.../vcm-server.service`.

   - **Live-verified against ADR-0025 §验收 (Aug 22 09:22)**:
     | item                                          | result |
     |-----------------------------------------------|--------|
     | 1. `systemd-analyze verify`                   | ok (placeholder warning expected) |
     | 2. install end-to-end + /api/health          | ok — health body `status:"healthy"` |
     | 3. crash recovery (`kill -9`)                 | ok — new PID within ~6s (`RestartSec=5s`) |
     | 4. uninstall removes unit, keeps env          | ok — ENV md5 unchanged across uninstall |
     | 5. `npm test -- tests/daemon.test.js`         | 26 passed |
     | 6. `bash scripts/routine_coverage.sh`         | exit 0 |

     Empirical traces from this session:
     - Old PID 1114191 killed → new PID 1121885 in 09:22:05→09:22:11.
     - Uninstall preserved ~/.vcm/server.env (md5 5d06f168… unchanged).
     - Port auto-pick fell to 7339 because repowise held 7338 again.
8. **Next milestones** (from `docs/ROADMAP.md`):
   - SKILL.md files per CHARTER §10 for peer protocol,
     MCP HTTP transport, drift detection, docs search.
   - macOS launchd `vcm-server.plist` (ADR-0025 §"不做", v0.14.0).
   - README modernization for v0.12.0+ reality (still has v0.11
     claims in some places).

Good luck. The project is in a good state — be conservative, test
thoroughly, and write ADRs before code.
