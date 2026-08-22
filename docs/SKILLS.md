# SKILLS — vcm 项目规约索引

> 本文件是 `AGENTS.md §1` 引用的 skill 总览。**每个 skill 对应一个 governance 约束**,
> 对应一份 ADR, 对应一条 CI 卡口 — CHARTER §10 的"三项全满足"在这里具象化。

## 1. 阅读入口

- [`AGENTS.md` §1](../AGENTS.md) — 任务 → 必读 skill 的映射表
- [`CHARTER.md` §10](../CHARTER.md) — 元决策: 硬约束必须有 SKILL.md + ADR + CI
- [`scripts/check_skills.py`](../scripts/check_skills.py) — 7th hard check 实施

## 2. Skill 索引

| Skill | When to read | Authority | Canonical (ADR) | 路径 |
|---|---|---|---|---|
| [`skill-authoring`](skills/skill-authoring/SKILL.md) | 新建 / 修改 / 审查 SKILL.md 或 AGENTS.md / CHARTER.md 时 | execution-index | [sales-ai canonical](https://github.com/your-org/sales-ai/blob/main/.pi/skills/skill-authoring/SKILL.md) | [`skills/skill-authoring/SKILL.md`](skills/skill-authoring/SKILL.md) |
| [`persistent-runtime`](skills/persistent-runtime/SKILL.md) | 改 systemd 单元 / launchd plist / install-*.sh / 调试守护进程时 | canonical | [ADR-0025](adr/0025-persistent-vcm-server.md) + [ADR-0027](adr/0027-launchd-vcm-server.md) | [`skills/persistent-runtime/SKILL.md`](skills/persistent-runtime/SKILL.md) |
| [`i18n-authoring`](skills/i18n-authoring/SKILL.md) | 写新模板字符串 / 加翻译键 / 调语言切换逻辑时 | canonical | [ADR-0026](adr/0026-bilingual-ui.md) | [`skills/i18n-authoring/SKILL.md`](skills/i18n-authoring/SKILL.md) |
| [`drift-detection`](skills/drift-detection/SKILL.md) | 改 /drift 视图 / 调健康评分公式 / 加新漂移检测项时 | canonical | [ADR-0019](adr/0019-drift-detection.md) | [`skills/drift-detection/SKILL.md`](skills/drift-detection/SKILL.md) |
| [`mcp-transport`](skills/mcp-transport/SKILL.md) | 改 MCP server tool 注册 / transport 选择 / 调认证 scope 时 | canonical | [ADR-0021](adr/0021-mcp-http-transport.md) | [`skills/mcp-transport/SKILL.md`](skills/mcp-transport/SKILL.md) |
| [`docs-search`](skills/docs-search/SKILL.md) | 改 FTS5 索引 / /api/docs/search / 调 token 分词时 | canonical | [ADR-0020](adr/0020-docs-fulltext-search.md) | [`skills/docs-search/SKILL.md`](skills/docs-search/SKILL.md) |

## 3. 跨项目引用

- **skill-authoring 的 canonical 源** 在 sales-ai 项目:
  [`sales-ai/.pi/skills/skill-authoring/SKILL.md`](../sales-ai/.pi/skills/skill-authoring/SKILL.md)。
  vcm 的 `docs/skills/skill-authoring/SKILL.md` 是其执行层一屏精简版, 完整 5 原则 +
  3 条件 + 7 步 SOP 永远以 sales-ai 那份为准。canonical_ref 必须保持同步。

## 4. 命名与 frontmatter 规范

每个 SKILL.md 顶部 YAML frontmatter 必须满足 (由 `scripts/check_skills.py` 强制):

- `name`: lowercase slug, 3-64 字符, `[a-z][a-z0-9-]*[a-z0-9]`
- `description`: 30-200 字符, **不含 banned-words** (通用 / 最佳实践 / 总结 / 全局 / 整体 /
  一切 / 所有 / 完整 / 系统 / 架构)
- `tags`: 1-10 项, lowercase, `[a-z][a-z0-9-]*`
- `authority`: `canonical` (本项目权威) 或 `execution-index` (指外部 canonical)
- `canonical_ref`: 仅 `execution-index` 必填, 指向权威源 (ADR / 外部 SKILL.md / CHARTER)

## 5. 何时新增 skill

按 [skill-authoring §2](skills/skill-authoring/SKILL.md) 三条件自审:

1. 约束密度高 (红线 ≥ 5 条)?
2. 触发频率高 (每相关任务都会触及)?
3. description 能写成 1-2 句不含万能词?

三条件全满足 → 写 ADR → 写 SKILL.md → 加进本索引 → 加 CI 卡口 → 写测试 → commit。
