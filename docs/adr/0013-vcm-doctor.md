# ADR-0013 — `vcm doctor` comprehensive health check CLI

**状态**: 待实施（v0.6.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

到 v0.5.0，已经有这些自检命令：

| 命令 | 做什么 |
|---|---|
| `vcm validate` | 6 hard check（自治理） |
| `vcm skill validate` | SKILL.md frontmatter schema + banned-words |
| `vcm status` | HTML report |
| `vcm skill stale / sweep` | skill 时间性 |

但用户**没有**一个"一次看清健康状况"的入口。典型工作流：

```bash
vcm validate                    # 6 check
vcm skill validate              # 验证 SKILL.md
cat .vcm/report.html | grep warn # 检查 status 报告
vcm skill stale --days 30       # 检查时间
```

4 命令。**应该 1 个**。

## 决策

新增 `vcm doctor` CLI：

```bash
vcm doctor                        # human-readable output
vcm doctor --json                  # machine-readable (CI use)
vcm doctor --push                  # send report to vcm-server as audit event
vcm doctor --strict                # exit 1 if ANY warning (default: only FAIL)
```

### 输出结构

```
vcm doctor — 7 checks in 4 sections

[governance]     AGENTS.md present    ✓
                 CHARTER.md present   ✓
                 6 hard checks        ✓ (5 OK, 1 historical WARN)

[skills]         12 registered        8 validated <30d
                                      3 deprecated (used in 1 project each)
                                      1 needs-replacement

[repository]     8 ADR documents      newest: 2026-08-15
                 12 TD entries        0 critical (>30d stale)
                 3 post-mortems      all addressed

[git hygiene]    working tree        dirty
                 last commit         2h ago by alice
                 last vcm validate   2026-08-12 (9d ago)

VERDICT: 1 warning, 0 fail   (exit code: 1 if --strict and warning, else 0)
```

### 反对意见

- **Q: 为什么不直接扩充 `vcm status`?  
  **A: `status` 写 HTML，**太重**。`doctor` 走 stdout/stderr，专给 CI / 终端。
- **Q: 为什么是 7 项不 100 项?  
  **A: 一次只回答 "我还健康吗"。深查用 `validate` + `stale` + `sweep`。

### 后果

#### 正面

- CI 加 `vcm doctor` 一行就完
- `--json` 解锁 aggregator / Grafana 抓取
- `--push` 把结果纳入 audit log（v0.6.0 还要看 audit 容量）

#### 负面 / 风险

- 增量 ~80 LOC + 30 LOC tests
- **`--strict` 行为** 必须明确：默认容忍 WARN（history 类）；`--strict` 严格

### 验收

```bash
vcm doctor                       # exits 0
vcm doctor --strict              # 在有 warning 时 exit 1
vcm doctor --json | jq .verdict  # 可解析
```

### 不做

- ❌ Interactive selection
- ❌ Remote-doctor (跨机器)
- ❌ 自动 fix (`--fix`)

## 参考

- [ADR-0006](0006-skill-lifecycle.md)
- [ADR-0011](0011-per-user-acl.md) — audit event 类型靠它
- [CHARTER §9](../CHARTER.md) — 任何新命令必须文档
