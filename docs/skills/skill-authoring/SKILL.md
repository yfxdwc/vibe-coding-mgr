---
name: skill-authoring
description: "新建、修改或审查 vcm 项目的 SKILL.md (docs/skills/<name>/SKILL.md) 或 AGENTS.md / CHARTER.md 时必读 — 含三条件自审、description 5 原则、banned-words 正则、SOP 与 CI 闭环。"
authority: execution-index
canonical_ref: ../../../../sales-ai/.pi/skills/skill-authoring/SKILL.md
tags: [skill, meta, governance, authoring, rule]
---

# Skill Authoring (skill 化元规约 — 执行层)

> **本 skill 是给 agent 自己用的"元 skill"** — 教 agent 怎么判断"该不该建 skill" + "怎么写 skill"。
> 价值观层: [`docs/CHARTER.md`](../../CHARTER.md) §10
> 操作层: [`AGENTS.md`](../../AGENTS.md) §1

## 1. 什么时候必须读取本 skill

- 新建 / 修改 / 审查 / 移除 `docs/skills/<name>/SKILL.md`
- 重大修改 [`AGENTS.md`](../../AGENTS.md) 或 [`CHARTER.md`](../../CHARTER.md)
- 在新会话里被问"这个该 skill 化吗?" / "要不要写成 skill?"

## 2. 三条件自审 (CHARTER §10 + sales-ai skill-authoring §2)

| 条件 | 判定 |
|---|---|
| 约束密度高? — 红线 / 禁止项 ≥ 5 条? | NO → 文档即可, 不必 skill 化 |
| 触发频率高? — 每个相关任务都会触及? | NO → 文档即可, 不必 skill 化 |
| description 能写成 1-2 句不含万能词? | NO → 拆细或放弃 |

三条件全满足 → 才动手写 SKILL.md。

## 3. description 5 原则 (skill-authoring §3, sales-ai canonical)

| # | 原则 | 错 | 对 |
|---|---|---|---|
| 1 | **句式** "修改 / 新增 X 时必读" | "skill 通用规约" | "新建 SKILL.md / 改 CHARTER 时必读" |
| 2 | **具体路径** 含文件路径或 ADR 编号 | "skill 相关文档" | "docs/skills/<name>/SKILL.md 或 CHARTER §10" |
| 3 | **触发清单** 列具体原子 / 红线 | "..." | "三条件自审 / 5 原则 / banned-words 正则" |
| 4 | **不含万能词** 避免"通用 / 最佳实践 / 总结 / 全局 / 整体 / 一切 / 所有 / 完整 / 系统 / 架构" | "skill 通用最佳实践" | "新建 SKILL.md 的硬约束" |
| 5 | **长度** 1-2 句, < 200 字符 | 一大段 500 字 | 紧凑 80-150 字符 |

**banned-words 正则** (与 sales-ai skill-authoring §3 同步, 修改需同步 `scripts/check_skills.py`):

```regex
通用|最佳实践|总结|全局|整体|一切|所有|完整|系统(?!化)|架构(?!边界)
```

任一命中 → 必须重写 description。

## 4. SOP: 新建 SKILL.md 的 7 步流程

1. **三条件自审** (§2) — 不满足 → 停下来, 不建。
2. **写 SKILL.md** 到 `docs/skills/<name>/SKILL.md`:
   - frontmatter 必须含 `name` (lowercase slug) / `description` (§3) / `tags` (lowercase, 1-10 个)
   - 可选: `authority: canonical | execution-index` + `canonical_ref` (execution-index 必须给)
   - 结构: 范围 → 触发场景 → authority + canonical_ref → 硬约束 → 反模式 → 验收 → 相关文档
   - 不复刻原文 — 用"链接 + 提炼 + 红线列表"
3. **在 [`docs/SKILLS.md`](../../SKILLS.md) 加一行索引** — name / description / ADR 编号 / canonical_ref
4. **写 ADR** (如果还没有) — SKILL.md 与 ADR 互为镜像, 缺一即违反 CHARTER §10
5. **CI 卡口**: 加 / 更新 `scripts/check_skills.py` 断言, 运行 `bash scripts/routine_coverage.sh`
6. **写测试**: `tests/<name>-meta.test.js` 校验 frontmatter / banned-words / canonical_ref 解析
7. **commit**: message 引用 CHARTER §10 + 对应 ADR 编号, `feat / fix / docs / chore`

## 5. 硬约束 (违反即视为违规)

- ❌ 手动 `mkdir docs/skills/<name>` 后忘了加索引 — 必须同步更新 `docs/SKILLS.md`
- ❌ SKILL.md 内复刻原文 ADR — agent 等于读两次, 浪费主上下文
- ❌ description 含万能词 (§3 正则命中) — pi 必滥加载
- ❌ 跳过 CI 验证直接 commit — 隐性违规, 下次 review 才被发现
- ❌ SKILL.md 缺 `canonical_ref` 且 `authority: execution-index` — 执行层无法追溯到权威源
- ❌ SKILL.md 与 ADR 内容漂移 (一个改了另一个没改) — 单一事实源被破坏

## 6. 验收清单

新建 / 修改 SKILL.md 后:

- [ ] 三条件自审 §2 全满足
- [ ] description 通过 §3 五条原则 + banned-words 正则
- [ ] frontmatter 含 `name` / `description` / `tags`, authority 已声明
- [ ] `docs/SKILLS.md` 索引已加行
- [ ] `scripts/check_skills.py` 通过 (`bash scripts/routine_coverage.sh` exit 0)
- [ ] 测试通过 (`npm test -- tests/skills-meta.test.js`)
- [ ] commit message 引用 CHARTER §10 + 对应 ADR

## 7. 相关文档

- [`docs/CHARTER.md` §10](../../CHARTER.md) — 元决策 (价值观层)
- [`AGENTS.md` §1](../../AGENTS.md) — 操作层 (任务→skill 映射)
- [sales-ai skill-authoring (canonical)](../../../../sales-ai/.pi/skills/skill-authoring/SKILL.md) — 5 原则 + 3 条件 + SOP 的完整版本
- [`ADR-0028`](../adr/0028-skill-rollout.md) — 本次 skill 落地的决策记录
- [`scripts/check_skills.py`](../../scripts/check_skills.py) — 7th hard check 的实现
- [`lib/schemas/skill.schema.json`](../../lib/schemas/skill.schema.json) — frontmatter 的 JSON Schema
