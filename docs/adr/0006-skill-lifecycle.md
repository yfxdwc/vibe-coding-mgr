# ADR-0006 — Skill lifecycle automation (deprecate / retire)

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

`vcm skill add/list/validate` 完整，但**没有 deprecate / retire**。v0.2.0 之后用户累积了一堆 skill：有些发现 obsolete（如 `vercel-labs-only` 被 `tech-leads-club` 取代），有些纯属实验（`my-test-skill-2024-01-01`），有些只在 1 个项目用过（"single-project" badge）。

CHARTER §5「净债最小」：每个加的能力都要评估是否留债。skill 注册而不清理 = 债累积。

## 决策

新增两个 CLI 命令 + 一个 `.vcm-skill.json` 字段：

### CLI

```bash
vcm skill deprecate <name>                    # 标记为 deprecated
vcm skill deprecate <name> --replaced-by <new>
vcm skill retire <name>                       # 完全删除 .vcm-skill.json
vcm skill stale [--days N]                    # 列出 N 天未 validate 的
vcm skill sweep                              # 干跑，去除真正 stale 的（需 --yes）
```

`.vcm-skill.json` 新增字段：
```json
{
  "name": "...",
  "status": "active|experimental|deprecated|retired",
  "deprecated_at": "2026-08-21T...",
  "replaced_by": "newer-skill",
  "last_validated": "2026-08-01T...",
  "validation_count": 12
}
```

### 默认行为

- `add` 新 skill status = `experimental`（强制人 review）。后续 `validate` 后可改 active。
- `validate` 后写 `last_validated` + ++ `validation_count`。
- `deprecate` 不删文件，加 `status: deprecated` 元数据。CLI 在 `list` 显示 strike-through（已对齐 v0.3.0 DESIGN.md 的 `tag--withdrawn` 类）。
- `retire` 删文件，需 `--yes` 二次确认。
- `stale` 默认 90 天未 validate 的 list。

### 反对意见

- **Q**: 这是不是把 CHARTER §3「少 diff」拉爆？  
  **A**: 是 CLI commands，不是新 view，也不破坏 schema。是 v0.4.0 的「闭环」。  
- **Q: 为什么不是 web UI 操作？  
  **A: CLI-first。`vcm status` 配 `vcm validate` 配 `vcm skill lifecycle` —— 全程 CLI。
- **Q: 哪些字段可省略？  
  **A: 全部 optional；旧 .vcm-skill.json 没这些字段时向后兼容（status 默认 active）。

### 后果

#### 正面

- 用户对 skill 心智模型有「生命周期」维度
- 主动清理 stale skill，避免长期债
- 与未来 `vcm skill publish`（v0.5.0）兼容：status 字段 = 决定 publish 规则

#### 负面 / 风险

- 写逻辑复杂：4 个新 CLI 命令 + ~150 行 lifecycle 处理 + 测试 ~80 行
- 新 schema 字段需要 docs/SKILLS.md 更新

### 验收

```bash
node bin/vcm.js skill deprecate foo --replaced-by bar
node bin/vcm.js skill list  # foo is shown strike-through
node bin/vcm.js skill stale --days 30  # lists never-validated skills >30d old
```

### 不做

- ❌ 自动 prune（用户必须显式 sweep）
- ❌ GitHub PR bot 自动提 deprecate PR
- ❌ Web UI 端 lifecycle 管理

## 参考

- [`lib/cli/skill.js`](../../lib/cli/skill.js) — 现有 skill CLI
- [CHARTER §5](../CHARTER.md) — 净技术债最小
