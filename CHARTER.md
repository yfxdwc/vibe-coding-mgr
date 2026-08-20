# CHARTER.md — vibe-coding-mgr 项目宪法

> 提炼自 sales-ai 的 5 价值观 + 10 元决策（销售-ai 是先驱者）。
> 本文件是 vibe-coding-mgr 的**最高规则**，所有决策不得违反。

## 第 1 条：治本优于治标

**根因 > 症状**。当发现问题时，问"根本原因是什么"而不是"怎么快速绕过"。

例：vibe coding 失控 → 装 Repowise（治本：让 AI 看代码架构）而不是加更多 prompt。

## 第 2 条：架构边界（5 类 domain）

vibe-coding-mgr 的 5 个 domain:

| Domain | 职责 | 反向依赖禁止 |
|---|---|---|
| **core** | CLI engine / schemas / adapters | ❌ 不依赖 user modules |
| **cli** | `vcm init/snapshot/skill/status/validate/push/peers` | ❌ 不依赖 server |
| **server** | Flask + SQLite + MCP | ❌ 不依赖 sales-ai 特定代码 |
| **standards** | 5 个生态标准的薄 wrapper | ❌ 不 fork / 不修改上游 |
| **templates** | 项目初始模板（AGENTS/CHARTER/scripts） | ❌ 不含业务特定代码 |

**跨域调用必须走 adapter**（不直接 import）。

## 第 3 条：长期稳定 > 短期"少 diff"

代码接受适度冗余，但拒绝**让未来人看不懂的设计**。

- ❌ 不为"少写 5 行"而引入 magic
- ❌ 不为"快 ship"而省略测试
- ✅ 接受"看起来多"的清晰设计

## 第 4 条：有勇气重构

当模块放不下 ≠ 再开新目录。**先看划分是否合理**。

- ❌ 在 `lib/` 下硬塞超出 scope 的代码
- ✅ 重命名 / 重新划分模块

## 第 5 条：净技术债最小

**净债 = 新增 - 偿还**。每加 1 个新能力，要评估是否会留债。

- 新增 6 hard check → 必须自己跑
- 新增 schema → 必须有 validator
- 新增 CLI 命令 → 必须有 test

## 第 6 条：数据是事实，写操作必经审批

vibe-coding-mgr 不直接修改用户项目，**只读 + 写自己仓库**。

- ✅ `vcm init` 在目标项目生成文件（用户主动调用）
- ✅ `vcm snapshot` 在 git 里写 tag（git 机制）
- ❌ 静默改用户文件
- ❌ 自动 commit / push 用户代码

## 第 7 条：数据库是事实唯一源（vcm-server 适用）

server 状态以 SQLite 为准，但**用户项目状态以 git tag 为准**（更可信）。

## 第 8 条：本地优先

- vcm 默认 offline 100% 可用
- server 是**可选中央视图**（fail gracefully）
- 没有"必须联网"的功能

## 第 9 条：文档维护纪律

任何代码变更同步改文档：

- 改 CLI → 同步 README
- 改 schema → 同步 ARCHITECTURE
- 改模板 → 同步 ONBOARDING
- 决策 → 写 ADR

## 第 10 条：规约承载（skill 化是规约的运行时形态）

任何"硬约束"必须：
1. 有 SKILL.md（5 原则 + 3 条件自审）
2. 有 ADR 编号
3. 有 CI 卡口

避免"规约只在文档里、agent 不会读"。
