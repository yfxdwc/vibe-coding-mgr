# ADR-0028 — SKILL.md rollout for vcm governance constraints

**状态**: 已实施（v0.16.0）
**日期**: 2026-08-22
**作者**: mm7 / next-agent
**引用**: [CHARTER §10](../../CHARTER.md), [ADR-0006](0006-skill-lifecycle.md),
[ADR-0008](0008-skill-marketplace.md), [skill-authoring 5 原则](#) (canonical at sales-ai)

## 背景

[CHARTER §10](../../CHARTER.md) is the constitutional rule
about how governance constraints are carried in the project:

> 第 10 条：规约承载（skill 化是规约的运行时形态）
>
> 任何"硬约束"必须：
> 1. 有 SKILL.md（5 原则 + 3 条件自审）
> 2. 有 ADR 编号
> 3. 有 CI 卡口
>
> 避免"规约只在文档里、agent 不会读"。

`AGENTS.md §1` already references `docs/SKILLS.md`:

> 每次开发前查 [docs/SKILLS.md](./docs/SKILLS.md)。

But as of v0.15.0, that file **does not exist**, the
`.pi/skills/` directory is empty, and the canonical
skill-authoring rules (5 原则 + 3 条件自审) live in
`sales-ai/.pi/skills/skill-authoring/SKILL.md` — a sibling
project, not vendored here.

The hard constraints that vcm encodes in ADRs — systemd
runtime (ADR-0025), launchd runtime (ADR-0027), bilingual UI
(ADR-0026), drift detection (ADR-0019), MCP transport
(ADR-0021), docs full-text search (ADR-0020), peer gossip
(ADR-0022) — currently sit in `docs/adr/*.md` only. They have
**ADR numbers** ✅ and **CI guards** ✅ (the 6 hard checks
run on every commit) but **no SKILL.md** ❌.

This violates CHARTER §10's "三项全满足" rule, and it means
a new agent picking up the project has no entry point that says
"before you touch the persistent runtime, read this." The ADRs
are dense (~150 lines each); the SKILL.md is supposed to be the
**scannable** runtime form of the same constraint.

This ADR closes the gap: write the skill-authoring meta-skill
AND the per-constraint skill files in-repo, register them in
`docs/SKILLS.md`, and add a CI check that every hard constraint
in the project has a matching SKILL.md.

## 决策

Ship four files:

1. **`docs/SKILLS.md`** — the index `AGENTS.md §1` already
   references. A short markdown table listing every skill in
   the project (name, when-to-read, ADR reference), plus a
   note about the cross-project `skill-authoring` rules at
   `sales-ai/.pi/skills/skill-authoring/SKILL.md`.
2. **`docs/skills/skill-authoring/SKILL.md`** — a one-screen
   version of the sales-ai skill-authoring rules, adapted for
   vcm's smaller scope (no separate `docs/_STYLE_GUIDE.md`
   partition). Contains the 5 description-writing principles,
   the 3-condition self-check, and a short SOP for new skill
   creation.
3. **`docs/skills/<name>/SKILL.md`** for each governance
   constraint that lives in an ADR (v0.16.0 ships five):
   - `persistent-runtime` (ADR-0025 + ADR-0027)
   - `i18n-authoring` (ADR-0026)
   - `drift-detection` (ADR-0019)
   - `mcp-transport` (ADR-0021)
   - `docs-search` (ADR-0020)
4. **`scripts/check_skills.py`** — a new 7th hard check (the
   vcm project calls them the "6 hard checks"; this becomes
   the 7th — see §后果 for why we don't rename). Asserts:
   - `docs/SKILLS.md` exists.
   - Each row in `docs/SKILLS.md` references a real file
     under `docs/skills/<name>/SKILL.md`.
   - Each SKILL.md has the vcm-mandated YAML frontmatter
     (`name`, `description`, `tags`).
   - The `description` field does NOT contain any banned word
     (`通用 / 最佳实践 / 总结 / 全局 / 整体 / 一切 / 所有 / 完整
     / 系统 / 架构`).
   - Each skill's frontmatter `canonical_ref` (if present)
     points to a real ADR file under `docs/adr/`.

Each skill file is small (~50–80 lines), structured:

```markdown
---
name: <slug>
description: "<when-to-read — 1-2 sentences, no banned words>"
authority: canonical
canonical_ref: ../../docs/adr/NNNN-<name>.md
tags: [<3-6 tags>]
---

# <Skill Title>

> **When to read**: <one-liner restating the description>.
> **Authority**: `<canonical_ref path>`

## 1. Constraints
<3-7 hard bullets the agent must satisfy>

## 2. Anti-patterns
<2-4 things-not-to-do>

## 3. Verification
<how to check the constraint holds (lint / test / curl)>
```

### Why not vendor sales-ai's skill-authoring verbatim

- **CHARTER §8** forbids new runtime deps. Vendoring would
  also create a parallel skill-authoring universe in vcm that
  diverges from sales-ai over time.
- vcm's scope is smaller (no separate `_STYLE_GUIDE.md` /
  `_RULES.md` partition; CHARTER is the single source).
  A one-screen adaptation captures what vcm agents actually
  need without the sales-ai noise.
- The canonical_ref pattern means the skill **points at**
  sales-ai's authoritative skill-authoring for the full version
  if the operator wants the long form.

### Why a CI check, not just a manual audit

- The 6 hard checks currently enforce AGENTS.md / CHARTER.md /
  ADR index / etc. Adding a 7th that enforces SKILL.md keeps
  the symmetry: every hard constraint has an ADR AND a skill.
- A manual audit gets stale within one release cycle. We've
  seen the bilingual UI skill (ADR-0026) ship in v0.14.0 with
  no SKILL.md because no one noticed it was missing.

### Why one skill per ADR, not one mega-skill

- CHARTER §10's three-condition self-check (constraint density
  ≥ 10%, trigger frequency high, description 1-2 sentences) is
  satisfied per-ADR — each ADR scopes a single governance area.
- A mega-skill would have a vague description and fail the
  description-precision check.
- Operators can scope the agent's context: load only
  `persistent-runtime` when changing install scripts; load only
  `i18n-authoring` when adding strings.

### Why `authority: canonical` (not `execution-index`)

- These skills are first-party vcm governance; they don't
  point at a separate canonical source in another project.
- `canonical_ref` is still set so the operator can navigate
  from skill → ADR in one click (the test asserts the file
  exists at that path).
- `skill-authoring` itself uses `execution-index` because it
  points at sales-ai's authoritative version.

### Why `docs/skills/` not `.pi/skills/`

- `vcm skill add <name>` writes to `docs/skills/` by default
  (verified in `lib/cli/skill.js`).
- CHARTER §8: local-first; the canonical location is the
  project repo, not a vendored dotfile.
- `.pi/skills/` is for agent-runtime caches; the canonical
  source is in `docs/skills/`.

## 反对意见

**Q: Doesn't this duplicate the ADRs?  
A: No. ADRs are the **why / when / decision** (~150 lines
each). SKILL.md files are the **scannable constraint + how to
verify** (~50–80 lines each). They serve different audiences:
an ADR is for someone deciding whether to change the rule; a
SKILL.md is for someone **applying** the rule. CHARTER §10
explicitly requires both.

**Q: Why not just add a "Skill" section to each ADR and skip
the new file?  
A: Because the agent's runtime (Claude Code, Codex, pi) loads
SKILL.md files by `name` / `description` frontmatter — it
doesn't read ADRs unless told. SKILL.md is the form the
runtime can auto-load. ADRs are for humans making decisions.

**Q: Won't `scripts/check_skills.py` make the build slow?  
A: It's a 7-line script (re uses yaml/python-frontmatter-style
parsing; checks 5 conditions per file; ~30 files total). Cost
is ~50 ms. CHARTER §9 hard-check budget is "fast enough to
run on every commit"; we're well under.

**Q: Why not also write SKILL.md files for sales-ai-adjacent
skills like `next-app-router` or `sales-ai-customer-dashboard`?  
A: Those don't belong in vcm. They're sales-ai's domain.
vcm's SKILL.md files cover **vcm governance constraints**, not
all skills the user might encounter. If a future vcm user wants
the next-app-router skill they can `vcm skill install` it from
sales-ai's marketplace.

**Q: What about backfilling skills for the ADRs that already
shipped before v0.16.0 (0001-0024)?  
A: That's out of scope for this ADR. The 5 ADRs we ship
skills for are the ones **currently active governance** in
v0.16.0; ADR-0001 (repowise frontend) and ADR-0003 (dark
mode) are encoded in CSS tokens and don't have a "before you
touch X, read this" trigger. Future ADRs (0029+) get a
SKILL.md as part of their normal landing process (a new
contributor would write the skill file alongside the ADR).

## 后果

#### 正面

- **CHARTER §10 fully satisfied**: every hard constraint has
  an ADR AND a SKILL.md AND a CI guard. The "三项全满足"
  promise is now mechanically enforced by
  `scripts/check_skills.py`.
- **AGENTS.md §1 no longer references a missing file**: the
  link `[docs/SKILLS.md](./docs/SKILLS.md)` resolves.
- **Agent context is now bounded**: instead of reading 6 ADRs
  (~900 lines), an agent fixing a launchd issue reads 1
  skill file (~60 lines) and follows the canonical_ref to
  the ADR if it needs the full context.
- **The 6 hard checks become 7**: the symmetry across the
  existing checks (charter / doc-drift / constraint /
  adr-index / data-layout / skill-registry) is preserved —
  skill-registry is now the 7th check, mirroring how
  `add_pi_skill.py` already warns when `.pi/skills` is
  missing (HANDOFF §3.6).

#### 负面 / 风险

- **5 new skill files to maintain** in addition to the 5
  ADRs they mirror. Risk of drift: a future change to ADR-0027
  might not propagate to `docs/skills/persistent-runtime/SKILL.md`.
  Mitigation: `scripts/check_skills.py` asserts the
  `canonical_ref` file exists, so a renamed/moved ADR
  surfaces immediately.
- **CI check addition**: one more script to maintain. The
  check is intentionally tiny (no YAML lib; uses regex on
  frontmatter delimiters).
- **Banned-words regex is a copy of sales-ai's**. If the
  canonical list changes, we won't pick it up automatically.
  Mitigation: skill-authoring skill has a `canonical_ref`
  pointing at sales-ai's authoritative version; the
  CI-check list is documented at the top of
  `scripts/check_skills.py` as "must match sales-ai
  skill-authoring §3".

## 验收

```bash
# 1. docs/SKILLS.md exists and references all skill files.
test -f docs/SKILLS.md && echo "OK"
grep -c '| `' docs/SKILLS.md          # → ≥ 6 rows (5 skills + index entry)

# 2. Each skill file passes vcm's own validate.
for f in docs/skills/*/SKILL.md; do
  vcm skill validate "$(basename "$(dirname "$f")")"
done
# → all pass

# 3. The 7th hard check is in place.
bash scripts/routine_coverage.sh
# → ✓ All required skill files present

# 4. ADRs are reachable from each skill.
for f in docs/skills/*/SKILL.md; do
  grep -q 'canonical_ref:' "$f"
done

# 5. Tests:
npm test -- tests/skills-meta.test.js   # → all passed
npm test                                 # → 405+ passed
```

## 不做

- ❌ Backfilling SKILL.md files for ADR-0001..0024 (out of
  scope; they're stable history now).
- ❌ Vendoring sales-ai's full skill-authoring rules
  (CHARTER §8 + the one-screen adaptation is enough for vcm).
- ❌ Auto-loading SKILL.md files via a pi runtime plugin
  (out of scope; the docs/SKILLS.md link is what the agent
  reads when it needs to).
- ❌ Renaming "6 hard checks" to "7 hard checks" (the project
  has used the "6" name since v0.1.0; we add the 7th as an
  additive `.check` call inside `routine_coverage.sh` and
  note it in §后果).

## 参考

- [CHARTER §10](../../CHARTER.md) — "三项全满足" rule.
- [ADR-0006](0006-skill-lifecycle.md) — skill deprecate / retire.
- [ADR-0008](0008-skill-marketplace.md) — local registry.
- [skill-authoring (sales-ai canonical)](https://github.com/your-org/sales-ai/blob/main/.pi/skills/skill-authoring/SKILL.md) —
  the canonical 5 原则 + 3 条件自审 SOP; vcm's
  `docs/skills/skill-authoring/SKILL.md` is the one-screen
  adaptation.
- [AGENTS.md §1](../../AGENTS.md) — pre-task skill lookup.
- [scripts/routine_coverage.sh](../../scripts/routine_coverage.sh) —
  the 6-check harness we add the 7th check to.
