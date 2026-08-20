# PHILOSOPHY — 5 价值观 + 为什么这样设计

## Why vibe-coding-mgr exists

Vibe coding (using AI agents like Claude Code, Codex, Cursor, pi to write most of your code) creates a unique governance challenge:

- **Speed**: AI writes code 10-100x faster than humans
- **Loss of context**: AI doesn't know what you know about your project's history
- **Drift**: Without structure, AI-generated code accumulates technical debt faster
- **Coordination**: When AI modifies files across the project, who tracks what?

Traditional governance (code review, CI tests, docs) was designed for human-speed code. It doesn't fit vibe coding.

vibe-coding-mgr exists to fill that gap: **governance at AI speed**.

## The 5 价值观

Inherited from sales-ai (see [sales-ai/CHARTER.md](https://github.com/your-org/sales-ai/blob/main/CHARTER.md)):

### 1. 治本优于治标 (Root cause > symptoms)

When something breaks, don't patch it. Ask why it's broken, and fix the system, not the symptom.

**Example**: When AI agent kept producing inconsistent code styles, we didn't add lint rules — we added a skill that taught the agent our style guide first.

### 2. 架构边界 (Architecture boundaries)

5 separate domains, no cross-domain imports.

For vibe-coding-mgr:
- `core` (CLI engine, schemas) — pure logic, no user-facing
- `cli` (commands) — depends on `core`, no `server`
- `server` (Flask) — depends on `core` for schema validation
- `standards` (5 adapters) — wrap external standards, no business logic
- `templates` (text files) — pure data, no logic

### 3. 长期稳定 > 短期少 diff (Long-term stability > short-term less-diff)

Accept redundancy. Refuse cleverness that future-you won't understand.

### 4. 有勇气重构 (Courage to refactor)

When a module is full, don't add more files. Rename and re-divide.

### 5. 净技术债最小 (Net tech debt minimum)

Every new feature: assess if it adds debt. If yes, plan repayment.

## Design choices driven by 价值观

### Why Node.js for CLI (not Python)

Even though sales-ai is Python-heavy, vibe-coding-mgr uses Node.js because:

1. **Distribution**: `npm install` is simpler than `pip install` for global CLI tools
2. **Standards alignment**: vercel-labs/skills (the standard we want to adopt) is npm
3. **No Python deps for users**: Python scripts are vendored (no pip install needed)
4. **Single binary option**: Can be packaged with `pkg` for distribution without Node

### Why JSON Schema (not YAML or TOML)

For `.vcm-state.json` and `.vcm-skill.json`:

1. **Validation ecosystem**: Ajv is mature, well-tested
2. **Standard**: JSON Schema is a W3C standard
3. **Tooling**: Many editors support JSON Schema for autocomplete
4. **Self-documenting**: Schema doubles as documentation

### Why Flask for server (not Express)

For the optional `vcm-server`:

1. **Python ecosystem alignment**: Matches the 6 hard check scripts
2. **Simple**: Flask is minimal, no SPA needed
3. **Standard templates**: Jinja2 is widely understood
4. **SQLite support**: Zero-config persistence

### Why 6 hard checks (not 1, not 20)

The 6 checks are the minimum that catches real issues without slowing developers:

1. **check_charter.py** — Required files exist
2. **check_doc_drift.py** — Docs aren't lying
3. **check_constraint_governance.py** — Rules are documented
4. **check_adr_index.py** — Decisions aren't duplicated
5. **check_data_layout.py** — Layout is sensible
6. **skill registry check** — Skills are consistent

Each catches a class of bugs. None are redundant.

### Why local-first (not cloud-first)

For `vcm` CLI:

1. **Privacy**: Code never leaves the machine
2. **Offline**: Works on planes, in trains
3. **Speed**: No network round-trip
4. **Trust**: Users don't need to trust a server with their governance state

The server is **optional**. It's for cross-project view, not for the CLI to function.

## Anti-patterns we avoid

- ❌ **Not forking**: We adopt standards, don't fork them
- ❌ **Not the "5 system" trap**: One tool, one purpose
- ❌ **Not AGPL**: License is MIT
- ❌ **Not requiring cloud**: Local-first by default
- ❌ **Not magic**: Schemas and scripts are inspectable

## What we're NOT

- Not a replacement for [Repowise](https://github.com/repowise-dev/repowise) — Repowise does code intelligence, vibe-coding-mgr does governance
- Not a replacement for [Backstage](https://github.com/backstage/backstage) — Backstage is too heavy; vibe-coding-mgr is personal/small-team focused
- Not an AI agent — it's a tool for humans and AI agents to use

## See also

- [CHARTER.md](../CHARTER.md) — vibe-coding-mgr's own constitution
- [AGENTS.md](../AGENTS.md) — vibe-coding-mgr's own agent rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Component layout
- [REFERENCES.md](./REFERENCES.md) — ADRs that drove design decisions
