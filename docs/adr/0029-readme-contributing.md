# ADR-0029 — README modernization + CONTRIBUTING.md (v0.17.0)

**状态**: 已实施（v0.17.0）
**日期**: 2026-08-22
**作者**: mm7 / next-agent
**引用**: [CHARTER §1](../../CHARTER.md) (adopt-not-fork), [CHARTER §8](../../CHARTER.md) (0 new deps),
[ADR-0028](0028-skill-rollout.md) (skill registry precedent),
[HANDOFF §11.2 #3](../../HANDOFF.md)

## 背景

`README.md` is the project's user-facing entry point. The current
text was last meaningfully refreshed in the v0.14.1 pass
(commit `24191b1`, "modernize README/ONBOARDING/HANDOFF/ROADMAP
for v0.14.1"). Since then, **three releases** shipped without a
README sync:

- **v0.14.1** itself (comprehensive translation rollout, ADR-0026)
- **v0.15.0** (macOS launchd LaunchAgent, ADR-0027)
- **v0.16.0** (SKILL.md rollout, ADR-0028)

The stale README now misleads readers on at least 6 counts:

1. `vcm --version` banner shows `0.14.1` (line 7); real is `0.16.0`
2. `vcm doctor` example output says `26 ADRs` (line 11); real is `28`
3. Default port references are split between `7338`, `7339`, `7340`
   depending on which section was written when; the actual live
   value auto-picks from `7338..7399`
4. Project structure block (lines 246-274) lists `tests (368
   tests across 29 files)`; real is `436 tests across 31 files`,
   and `scripts/add_pi_skill.py` is referenced but does not exist
   in vcm (it lives in sales-ai — see ADR-0028 §"Why a CI check,
   not just a manual audit")
5. Project structure block does not list `docs/SKILLS.md`,
   `docs/skills/`, or `scripts/check_skills.py` — the v0.16.0
   additions
6. Release cadence table (lines 343-358) is missing v0.14.1,
   v0.15.0, v0.16.0; v0.14.1 is shown as the head

Additionally, **CONTRIBUTING.md does not exist**. Per
[HANDOFF §11.2 #3](../../HANDOFF.md) and [ROADMAP §v0.17.0](../ROADMAP.md),
this is the second half of the v0.17.0 work. The contributor
workflow is currently undocumented: someone landing their first
PR has no doc that says "write an ADR first, run
`scripts/routine_coverage.sh` before commit, never skip the
pre-commit hook, follow Conventional Commits, tag releases with
`git tag -a v<X>.<Y>.<Z>`."

## 决策

Two coordinated deliverables, shipped together as v0.17.0:

### 1. `README.md` — modernize to v0.16.0 reality

Six concrete edits, no structural rewrite:

1. Banner: `0.14.1` → `0.16.0`
2. `vcm doctor` example output: ADR count `26` → `28`, add the
   7th hard check row to the governance section
3. Port references: collapse to "7338 (or whatever free port the
   installer picked — see `install-service.sh`'s last line)"
4. Project structure: replace `tests (368 tests across 29 files)`
   with `tests (436 tests across 31 files, including the new
   `skills-meta.test.js` from ADR-0028)`, and replace
   `scripts/add_pi_skill.py` (does not exist in vcm) with the
   actual 7 scripts: `check_charter.py`, `check_doc_drift.py`,
   `check_constraint_governance.py`, `check_adr_index.py`,
   `check_data_layout.py`, `check_skills.py`, `routine_coverage.sh`
5. Project structure: add `docs/SKILLS.md` + `docs/skills/`
   block referencing the 6 skill files (1 meta + 5 governance)
6. Release cadence table: prepend `v0.16.0`, `v0.15.0`, `v0.14.1`
   rows (HEAD moves from `v0.14.1` to `v0.16.0`)

Add a short "Contributing" section at the bottom that points at
`CONTRIBUTING.md` (deliverable #2).

### 2. `CONTRIBUTING.md` — first-time contributor workflow

Six sections, ~80 lines:

1. **Code of conduct** — single line ("Be conservative, write
   ADRs before code, follow the 6 hard checks") linking
   `CHARTER.md` for the full rule set
2. **Before you code** — three conditions (mirror of
   skill-authoring §2): (a) is there an ADR? (b) have you run
   `bash scripts/routine_coverage.sh` and seen exit 0?
   (c) does `npm test` pass?
3. **ADR discipline** — the project rule: "every hard constraint
   has an ADR". How to write one (template at `docs/adr/NNNN-...md`,
   update `INDEX.md`, reference the ADR from commit messages)
4. **Hard checks** — the 7-check harness, what each check does,
   why you cannot `--no-verify` skip them
5. **Commit style** — Conventional Commits, must reference the
   related ADR, must not break tests
6. **Releases** — `git tag -a v<X>.<Y>.<Z> -m "..."` triggers
   `.github/workflows/publish.yml` which runs tests then
   `npm publish`. The README banner version is the same as the
   most recent tag. Patch-level bumps (v0.X.Y) for ADR follow-ups;
   minor bumps (v0.X.0) for new features; major bumps (v1.0.0+)
   for the stability milestone tracked in ROADMAP.

### Why a v0.17.0 release, not a v0.16.x patch

- The README modernization is **content-only** (no new
  constraint), but it ships alongside `CONTRIBUTING.md` which
  formalizes the existing contributor workflow as a hard
  convention. The minor bump signals to readers "the
  contributor contract has changed" — even if the change is
  additive.
- v0.16.0's git tag is already on the master branch
  (commit `a44f8dd`). Adding a docs-only patch under v0.16.1
  would feel like diluting the SKILL.md rollout's signal.
- ROADMAP §v0.17.0 already lists "CONTRIBUTING.md + npm-published
  version polish" as a candidate, so this ADR formalizes that
  list item.

### Why an ADR for docs work

`AGENTS.md §1` says "改文档 / ADR → skill-authoring (元决策)".
The contributor workflow *is* a meta-decision (CHARTER §1:
"adopt-not-fork" + "long-term stability > short-term less diff"
both bear on how contributors behave), so it merits an ADR
even though no code changes. ADR-0028 used the same logic for
the SKILL.md rollout.

## 后果

#### 正面

- **README accuracy restored**: a reader who runs `vcm --version`
  in their terminal and then reads the README will see the same
  version number. Same for ADR count, test count, and the
  project structure listing.
- **CONTRIBUTING.md as a contract**: first-time contributors
  have one doc to read that answers "do I need an ADR first?",
  "can I `--no-verify` skip?", "how do I cut a release?" —
  questions that previously required reading 3 HANDOFF sections
  + CHARTER.md + AGENTS.md to answer.
- **v0.17.0 release** advances the version lineage past
  v0.16.0's SKILL.md rollout, signaling that vcm's governance
  surface is now mature enough to expect external contributions.
- **Hand-off improvement**: HANDOFF §11.2 #3 (README polish) and
  #4 (v0.17.0 candidates) are both closed by this ADR, leaving
  #3 (still not yet done — see ROADMAP §v0.17.0 candidates
  listed after this) as the only remaining item.

#### 负面 / 风险

- **README drift will recur**: every future release that does
  not touch the README re-opens the same gap. Mitigation: the
  v0.17.0 CONTRIBUTING.md §"Releases" section makes it
  explicit that the README banner version is part of the
  release checklist.
- **CONTRIBUTING.md as soft constraint**: unlike the 7 hard
  checks, CONTRIBUTING.md is documentation only. A contributor
  who skips reading it does not fail CI. This is acceptable —
  the project's hard constraints are already encoded in the
  shell harness; CONTRIBUTING.md is onboarding, not enforcement.

## 验收

```bash
# 1. README version banner matches package.json
grep -E '^\$ vcm --version' README.md
# 期望: shows v0.17.0 (after this ADR)

# 2. ADR count in README matches docs/adr/
grep "ADRs" README.md
ls docs/adr/*.md | grep -v INDEX | wc -l
# 两个数字应相等

# 3. Test count in README matches vitest
grep "tests across" README.md
npm test 2>&1 | grep "Tests"
# 两个数字应相等

# 4. CONTRIBUTING.md exists with 6 sections
test -f CONTRIBUTING.md
grep -c '^## ' CONTRIBUTING.md
# 期望: ≥ 6

# 5. 项目结构 block 列出全部 7 个 check 脚本
grep -c "check_" README.md
# 期望: ≥ 6 (5 hard check scripts + 1 routine_coverage.sh)

# 6. CI 验证
bash scripts/routine_coverage.sh        # exit 0
npm test                                 # 436+ passed
```

## 不做

- ❌ 不重写 README 的整体结构 — 仅 6 处编辑, 保持现有章节顺序
- ❌ 不创建 `LICENSE` 文件 (项目根已有 LICENSE)
- ❌ 不翻译 README — README 是英文文档, 中文 onboarding 在 `docs/ONBOARDING.md`
- ❌ 不添加 npm badge / CI badge — 项目还未发布到 npm, badge 是占位符
- ❌ 不引入 CONTRIBUTING 模板 (`.github/ISSUE_TEMPLATE/` 等) — 超出 v0.17.0 范围

## 参考

- [CHARTER §1](../../CHARTER.md) — adopt-not-fork (项目设计纪律)
- [CHARTER §8](../../CHARTER.md) — 0 new runtime deps
- [HANDOFF §11.2 #3](../../HANDOFF.md) — "README modernization — minor polish"
- [ROADMAP §v0.17.0](../ROADMAP.md) — CONTRIBUTING.md + npm polish 候选
- [ADR-0028](0028-skill-rollout.md) — 同等 docs-only release pattern (skill 注册)
- [AGENTS.md §1](../../AGENTS.md) — 任务级 skill 映射
- [`scripts/routine_coverage.sh`](../../scripts/routine_coverage.sh) — 7 hard checks
