# ADR-0001 — 前端重设计：repowise 启发

**状态**: 已采纳（v0.3.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

vibe-coding-mgr 的 `server/templates/*.html` 在 v0.2.0 已能用，但视觉与结构上仍是"凑出来的能用"。问题：

1. **没有设计系统**：dashboard.css 是一锅端的扁平化样式，颜色硬编码（`#1e293b`、`#86efac`、`#fbbf24`），新增页面就再加新样式，造成各页体验不一致。
2. **路由与视图分离弱**：`/api/...` 与 `/...` 完全分家，但页面之间没有 sidebar、没有 breadcrumb、没有"answers what question"的引导头。
3. **没有 URL 状态**：tab、模式、过滤器都活在 DOM/alpine state 里，分享链接丢失上下文。
4. **三主 KPI 混成一个 score**：当前把 `healthy / warning / needs_attention` 摆成三个色块，没有"3 个柱子永远平行"的纪律，正好是用户挑出的痛点。
5. **证据缺失**：当前 dashboard 没有数字支撑"为什么需要治理"，也没有 docs/ 设计文档承接设计决策。

## 决策

**以 repowise (`https://github.com/repowise-dev/repowise`) 的做法为设计模板**，重做本项目前端。具体规则来源见 [`docs/DESIGN.md`](../DESIGN.md)。核心要点：

1. **Token-first CSS**：颜色、字体、间距用 CSS Custom Properties 表达，`tokens.css` 是唯一源头。
2. **3 层 CSS**：`tokens → base → components`，每层只 import 下层，禁上调。
3. **公共 layout (`_layout.html`)**：顶部 nav + 主体 content 块，子模板只填两块。
4. **URL 状态**：tab 与 view 通过 `?tab=` 与 `?view=` 控制，刷新不丢。
5. **三 KPI 平行**：`healthy / warning / needs_attention` 是 3 个独立 KPI，不混。
6. **每个视图开头一行"Answers: …"** 直接告诉读者这页回答什么问题。
7. **Evidence 在侧栏**：指标卡 + 旁边小字解释，避免"指标无来历"。
8. **暗色优先**：与当前一致，但 token 让 light 也 1 个文件切换。
9. **保持轻栈**：保留 Alpine.js + HTMX + ECharts，**不引入** React/Vue/Tailwind。Tailwind 的设计纪律用 token + 一致命名 class 来还原。
10. **新视图**：增加 `/peers` 跨项目 attention 视图 + `/settings` 服务器元信息视图。

## 反对意见（self-argue）

- **Q**: 这是 repowise fanboy 式模仿？  
  **A**: 不是。repowise 解决"代码智能"，vibe-coding-mgr 解决"治理";但**前端作为信息密度的载体**,两件事的视觉纪律几乎一样：dark-first、token-first、URL-state、3-column KPIs。我借鉴的是这一层 pattern，不是它的领域逻辑。
- **Q**: 不上 Tailwind 是倒退吗？  
  **A**: 不是。我们没有 build step（vcm-server 是 Flask 直出），引入 Tailwind 就要 PostCSS → 增加依赖 → 违反 CHARTER §5 "净技术债最小"。用 token + 直接命名 class 也能做到 Tailwind 80% 的纪律，但**没有 build 步骤**，可读性更高。
- **Q**: 重做的工作量会不会留债？  
  **A**: 已规划偿还：ADR + DESIGN.md 让后人接得住；保留所有原 `/api/*` 端点；Jinja2 公共 layout 回归 `extends` 模式。新增的 3 个 `_partials/*.html` 是**减债**（不再在 4 个页面里 copy-paste nav）。

## 后果

### 正面

- 任何新模板都能直接 `{% extends "_layout.html" %}`，无 style drift。
- 分享 `/projects/foo?tab=health` 给协作者，他们看到完全相同的画面。
- 三 KPI 永远平行 — 再也不会有人误以为"warning=needs attention"。
- 设计决策有出处：所有规则都能 [`docs/DESIGN.md`](../DESIGN.md) 查到。

### 负面 / 风险

- **JS 体积**: HTMX 维持现状，Alpine.js 已用；不引入第三方框架。OK。
- **CSS 总量上升**: 从 ~3KB → ~10KB（分 3 文件）。仍是 single-flight，无 build step。
- **测试需更新**: 旧 `tests/server/dashboard.test.js` 检查 HTML 标签；新模板保留所有 `data-*` hook 但保留老 tests 兼容。

## 验收标准

```bash
bash scripts/routine_coverage.sh   # 6 hard check 全过
node bin/vcm.js validate          # 本项目自治理
ls -la server/static/css/         # 必须有 tokens.css / base.css / components.css 三件套
ls -la server/templates/_partials # 至少有 nav.html / attention_item.html
```

## 后续 (v0.3.0+)

- `/api/projects` 加 `?tab=` 过滤（已暗合路由）
- `/peers` 视图: 跨仓库 OSS attention（依赖 `vcm peers` 已有功能）
- `?focus=` 深链: 单个 TD / ADR 的 anchor URL

## 不做的事

- ❌ 不引入 React / Vue / Solid
- ❌ 不引入 Tailwind / PostCSS
- ❌ 不改 `/api/*` 契约（向后兼容层，本期不动）
- ❌ 不在本期引入 WebSocket / 实时（roadmap v0.3.0 已规划，留到下一 ADR）

## 参考

- [repowise docs/start/DASHBOARD.md](https://docs.repowise.dev) — 视图结构范本
- [repowise 首页](https://repowise.dev) — 排版与 token 命名范本
- [docs/DESIGN.md](../DESIGN.md) — 本项目设计系统（ADR 的执行文件）
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — 5 domain 边界，本 ADR 不改
