# ADR-0003 — Skill adapter layer (5 standards, no forks)

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

`README.md` 声明 vibe-coding-mgr adopt 5 个 skill standards：
- vercel-labs/skills — Vercel 的 skill 目录格式
- tech-leads-club/agent-skills — 含 validated 状态
- sickn33/agentic-awesome-skills (AAS Core) — manifest 概念
- addyosmani/agent-skills — 6 phase lifecycle
- refly-ai/refly — durable skills 哲学

CHARTER 第 2 条「adopt-not-fork」: **走薄 wrapper + 适配层**。`lib/schemas/skill.schema.json` 是 source-of-truth，但用户问 "我手头的 vercel-labs skills 怎么转成 vibe-coding-mgr 格式 / 反过来" 时没有具体实现。这导致 README 是承诺，但 CLI 里没有 `vcm skill convert` 命令。

## 决策

新增 `lib/adapters/` 目录，每个 standard 一个文件，提供 `to_vcm(skill) → VCM-Skill` 和 `from_vcm(skill) → StdX-Skill` 两个函数。`vcm skill convert` CLI 命令用这些函数做转换。

### 目录结构

```
lib/adapters/
  ├── index.js              # registry: { vercel, tech-leads-club, aas, addyosmani, refly }
  ├── vercel.js             # vercel-labs/skills 适配
  ├── tech-leads-club.js    # tech-leads-club/agent-skills 适配
  ├── aas.js                # sickn33/aas-core 适配
  ├── addyosmani.js         # addyosmani/agent-skills 6-phase 适配
  └── refly.js              # refly-ai/refly durable 适配
```

每个适配器 ~50-100 行，仅做 JSON ↔ JSON 翻译，**不调用网络，不下载标准定义**（CHARTER §8 本地优先）。

### CLI 接入

```bash
vcm skill convert --from vercel --to vcm < skill.json    # stdin → stdout
vcm skill convert --from vcm --to aas < skill.json
vcm skill convert --from vercel --to vcm path/to/*.json  # 多个文件
```

输出回 stdout，错误回 stderr，**exit code** 与 unix 习惯一致（0 成功 / 1 部分失败 / 2 schema invalid）。

### 反对意见

- **Q**: 为什么不把 5 个 standard 的 schema 直接 inline 到 vibe-coding-mgr？  
  **A**: **fork** 是禁令。Adapter 翻译源 schema → 我们的 schema，不复制源 schema。源的 schema 是大家的 truth。
- **Q**: 为什么不调用外部 validator？  
  **A**: 本地优先。每个 adapter 用 Ajv (项目已有) 验证输入，依赖我们自己的 schema validator。
- **Q**: 5 个文件会不会太多？  
  **A**: CHARTER §3 「少 diff」 反对偷懒。但 5 个适配器每个 ~80 行，比起 1 个 400 行 god module，**可读性更高**。这是务实冗余。

### 后果

#### 正面

- 用户 **真能跑** `vcm skill convert`——README 不再是空头支票。
- 保持 `lib/schemas/skill.schema.json` 是 vcm 内部 source of truth（5 适配器都向它收敛）。
- 测试容易：每个 adapter 1 个 vitest 文件，列举 source JSON → expected output。

#### 负面 / 风险

- 5 个 standard 的 schema 变了，本项目就得升级 adapter。**这是 true cost**——也正是 vendor lock 拒绝的实现。
- 测 5 个 adapter 的成本约 200 行测试代码。

### 验收

```bash
# 单元测试：每个 adapter 至少 1 个 round-trip test
vitest run tests/adapters/

# CLI smoke test
echo '{"name":"x","description":"y"}' | node bin/vcm.js skill convert --from vercel --to vcm
```

### 不做

- ❌ 把任何 standard 的 **schema 文本**复制进 `lib/schemas/`（fork）
- ❌ 调用外部 URL 拉最新版 schema（vendor lock 风险）
- ❌ 自动 sync（v0.4.0 是手写 snapshot）

## 参考

- [README.md §Adoption philosophy](../README.md) — 5 standards 列表
- [lib/schemas/skill.schema.json](../lib/schemas/skill.schema.json) — vcm 内部 schema
- [repowise 适配层 pattern](https://github.com/repowise-dev/repowise/tree/main/src/adapters)
- [ADR-0002](0002-mcp-server.md) — 同样薄 wrapper 哲学
