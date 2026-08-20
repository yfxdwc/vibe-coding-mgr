# AGENTS.md — vibe-coding-mgr 项目 Agent 行为规约

> vibe-coding-mgr 是销售-ai 提炼出的**通用 vibe coding 治理系统**。
> 本仓库自己也要被严格治理（dogfooding）。
>
> 引用规范: [CHARTER.md](./CHARTER.md) (5 价值观 + 10 元决策)

## 1. 强制：先读相关 Skill，再写代码

每次开发前查 [docs/SKILLS.md](./docs/SKILLS.md)。

| 任务 | 必读 |
|---|---|
| 改 vcm CLI / Node.js 代码 | 无特定 skill，用通用软件工程纪律 |
| 修改 6 hard check (Python scripts) | skill-authoring |
| 加新 skill / 改 description | skill-authoring §3 (5 原则) |
| 写文档 / ADR | skill-authoring (元决策) |
| 修改 schema | 无特定 skill |

## 2. 任务级快照

```bash
# 用 sales-ai 的 task-snapshot.sh（git 可访问）
/home/mm7/sales-ai/scripts/task-snapshot.sh start <task-name>
```

## 3. 6 Hard Check（每次 commit 前自动跑）

| Check | 用途 |
|---|---|
| check_charter.py | AGENTS.md / CHARTER.md / README 必备性 |
| check_doc_drift.py | 文档与代码漂移 |
| check_constraint_governance.py | 约束治理 |
| check_adr_index.py | ADR 编号唯一性 |
| check_data_layout.py | 关键文件存在 |
| add_pi_skill.py --check | skill 注册一致性 |

跑法:
```bash
bash scripts/routine_coverage.sh
```

## 4. Commit 纪律

- Conventional Commits: `feat / fix / docs / chore / refactor`
- 必须引用相关 ADR / issue
- Pre-commit hook 失败禁止 --no-verify 跳过（除非有 [no-charter] 标记）

## 5. 自治理的关键约束

- ❌ **不允许"理发师不理发"** —— vibe-coding-mgr 必须用自己产的工具
- ❌ **不允许 fork 任何 adopt 标准** —— 走薄 wrapper + 适配层
- ❌ **不允许把 vibe-coding-mgr 文件 commit 进 sales-ai** —— sales-ai 通过 `npm install` 接入
- ✅ **每个 PR 必须跑 6 check** —— `bash scripts/routine_coverage.sh`

## 6. 关联文档

- [CHARTER.md](./CHARTER.md)
- [README.md](./README.md)
- [docs/ONBOARDING.md](./docs/ONBOARDING.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/PHILOSOPHY.md](./docs/PHILOSOPHY.md)
- [docs/REFERENCES.md](./docs/REFERENCES.md)
