# AGENTS.md — {{PROJECT_NAME}} Agent 行为规约

> 本文件由 `vcm init` 自动生成。基于 vibe-coding-mgr 的 [AGENTS.template.md](https://github.com/your-org/vibe-coding-mgr/blob/main/lib/templates/AGENTS.template.md)。
>
> **必读**：[vibe-coding-mgr/AGENTS.md](https://github.com/your-org/vibe-coding-mgr/blob/main/AGENTS.md) —— vcm 自己的治理规约。

## 1. 任务级快照

```bash
vcm snapshot <task-name>    # 任务快照（自动 git tag + dirty backup）
vcm rollback <task-name>    # 回滚
vcm list                     # 列所有 snapshot
```

## 2. 6 Hard Check

```bash
vcm validate                 # 跑 6 hard check（CHARTER §9 + §10）
bash scripts/routine_coverage.sh  # 等价底层
```

| Check | 用途 |
|---|---|
| check_charter.py | AGENTS / CHARTER 必备性 |
| check_doc_drift.py | 文档漂移 |
| check_constraint_governance.py | 约束治理 |
| check_adr_index.py | ADR 编号唯一 |
| check_data_layout.py | 数据布局 |
| skill 注册一致性 | skill 注册 |

## 3. Skill 治理

```bash
vcm skill add <name> --desc "..."   # 注册新 skill
vcm skill list                       # 列出
vcm skill validate <name>            # 验证 5 原则 + 3 条件
```

新 skill 自动满足 skill-authoring §3 描述 5 原则。

## 4. 项目特定规约（按需填写）

<!-- 在下方写本项目的具体规则 -->

## 5. 关联文档

- [CHARTER.md](./CHARTER.md)
- [README.md](./README.md)
- [vcm ONBOARDING](https://github.com/your-org/vibe-coding-mgr/blob/main/docs/ONBOARDING.md)
