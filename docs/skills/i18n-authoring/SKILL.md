---
name: i18n-authoring
description: "新增 / 修改 server/templates/*.html 字符串, 或新增 server/i18n.py 翻译键, 或调整 ?lang= / cookie / Accept-Language 解析逻辑前必读 — 含 zh/en 双语键命名、Alpine JS bridge、banned 字面量防泄漏 5 条硬约束。"
authority: canonical
canonical_ref: ../../adr/0026-bilingual-ui.md
tags: [i18n, translation, bilingual, ui, template, frontend]
---

# i18n Authoring (zh/en 双语 UI)

> **When to read**: 写新模板、改 Jinja 字符串、加翻译键、调语言切换时必读。
> **Authority**: [`ADR-0026`](../../adr/0026-bilingual-ui.md)

## 1. 范围

- `server/i18n.py` — 380 个 zh/en 键, `t(key, lang)` server-side renderer
- `server/templates/*.html` — 11 模板, 默认 zh, 通过 `?lang=` / cookie / `Accept-Language` 切换
- Alpine JS bridge: `window.__vcm_i18n__` + `window.t(key)` 用于动态字符串
- 测试: `tests/i18n.test.js` (53 assertions: 每页 zh + en 覆盖, "no English leakage", JS bridge wired)

## 2. 硬约束

- ❌ **不要在模板里硬编码英文 / 中文字符串** — 必须走 `{{ t('key', lang) }}` (server) 或 `window.t('key')` (Alpine)
- ❌ **不要只翻译一个语言** — 新增键必须 zh + en 同步加, 否则 fallback 泄漏英文
- ❌ **不要让 key 超过 80 字符** — 长 key 提示应拆成层级 (例如 `audit.filter.title` 而非 `auditFilterTitleForTheDashboard`)
- ❌ **不要在描述里复用 banned 字面量** — `TBD` / `TODO` / `__` 在 zh 翻译里都算"未翻译", 必须填值
- ✅ zh 文案默认精炼, 单条字符串 ≤ 30 字符 (中文宽度); 英文 ≤ 60 字符
- ✅ 导航 / 按钮 / KPI label 三类必须出现在 `tests/i18n.test.js` 的"no English leakage"断言里

## 3. 反模式

- 直接 `{{ '搜索' }}` 硬编码中文 — 切英文后留下 zh 残留
- 只在 zh 里加 key, en 留空 — `t()` 会 fallback 到 en, 出现英文泄漏
- 用 `{% if lang == 'en' %}English{% else %}中文{% endif %}` 替代 `t()` — 双倍维护成本
- 给模板加 `class="i18n-skip"` 跳过翻译检查 — 立即触发测试失败

## 4. 验收

```bash
# 1. 所有 key 在两个语言都有值
python3 -c "from server.i18n import CATALOG; print(sum(1 for k,v in CATALOG.items() if v.get('zh') and v.get('en')))"
# 期望 = 380 (当前总数)

# 2. 模板里没有硬编码的 zh / en 字面量 (粗检)
grep -rn '>[A-Z][a-z]\{3,\} \?</' server/templates/ | head
# 期望 = 空 (排除合法 HTML)

# 3. 测试覆盖
npm test -- tests/i18n.test.js     # 53 passed
npm test                            # all passed

# 4. CI 卡口
bash scripts/routine_coverage.sh   # exit 0
```

## 5. 相关文档

- [`ADR-0026`](../../adr/0026-bilingual-ui.md) — 双语 UI 的决策记录
- [`server/i18n.py`](../../server/i18n.py) — CATALOG + `t()` 实现
- `tests/i18n.test.js` — zh/en 覆盖 + Alpine bridge 验证
- [`docs/i18n-onboarding.md`](../i18n-onboarding.md) (如果存在) — 翻译者 onboarding
