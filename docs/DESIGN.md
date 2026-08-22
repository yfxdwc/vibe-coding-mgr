# DESIGN.md — 前端设计系统（v0.3.0）

> 本文件是 vibe-coding-mgr 前端的**唯一设计源头**。所有新模板 / 新 CSS 必须先查这里。
> 缘起：见 [ADR-0001](./adr/0001-repowise-inspired-frontend.md)。
> 范本：repowise 的 docs/start/DASHBOARD.md + repowise.dev 首页排版。

## 1. 三层纪律

```
tokens.css        ← 唯一颜色 / 字号 / 间距 / 阴影 token 源
   ↓ import
base.css          ← reset + 全局排版 + 暗色背景
   ↓ import
components.css    ← 组件（card / button / badge / tabs / drawer / table）
   ↓ import
dashboard.css     ← 当前页特定 overrides（越来越薄，最终可空）
```

**禁上调**：`tokens.css` 不 `import` 任何东西。所有页面级 CSS 通过 `dashboard.css` 走。

## 2. Token 命名（CSS Custom Properties）

完整列表见 `server/static/css/tokens.css`。最小可记集合：

| Token | 含义 | 例子 |
|---|---|---|
| `--bg` | 页面底层 | `#0a0a0a` |
| `--surface` | 卡片 / panel | `#0f0f10` |
| `--surface-alt` | 表格 zebra / drawer 底 | `#161618` |
| `--bg-elevated` | 命令面板 / modal 抬升面 | `#1a1a1c` |
| `--text-primary` | 标题 / 主信息 | `#f5f5f4` |
| `--text-secondary` | 正文 / 描述 | `#a8a29e` |
| `--text-muted` | 辅助 / 时间戳 | `#78716c` |
| `--accent` | 主题色（橙，repowise 同源） | `#f59520` |
| `--accent-dim` | 主题色暗背景 | `rgba(245,149,32,.15)` |
| `--ok` / `--warn` / `--fail` / `--idle` | 状态色，独立 token | gre 绿 / 琥珀 / 暗红 / 灰 |
| `--border-subtle` | 卡片默认边 | `rgba(255,255,255,.08)` |
| `--border-medium` | 卡片 hover/active 边 | `rgba(255,255,255,.16)` |
| `--border-accent` | 描 accent 边 | `rgba(245,149,32,.4)` |
| `--radius-card` | 卡片圆角 | `16px` (repowise rounded-3xl) |
| `--radius-pill` | 胶囊 | `9999px` |
| `--space-1..6` | 4 8 12 16 24 32 px 间距 | |

### 状态色纪律

- 绿 (`--ok`) = 一切正常
- 琥珀 (`--warn`) = 需要关注但不紧急
- 红 (`--fail`) = 当前违规 / 失败
- 灰 (`--idle`) = 还没判定 / N/A

**始终以 token 名引用，绝不写死 hex。** 例外：`#0a0a0a` 出现在 `tokens.css` 一处。

## 3. 排版纪律

### 字体

```
font-serif (标题, h1/h2 关键决策)     → font-family: ui-serif, Georgia, serif; font-extralight
font-sans  (正文, li, p)              → system stack; text-[15px] leading-relaxed
font-mono  (数字, 代码, 元信息)       → ui-monospace; tabular-nums
```

### 字号节奏

| 用途 | class | 字号 |
|---|---|---|
| 页面 H1 | `h-display` | 28px / extralight / serif |
| 区段 H2 | `h-section` | 22px / extralight / serif |
| 区段小标题 | `h-card` | 16px / medium |
| 正文 | `text-body` | 15px / regular / text-secondary |
| 辅助 | `text-meta` | 12px / regular / text-muted |
| 标签/分类 | `text-label` | 10px / uppercase / tracking-[.08em] / text-muted |

### 数字

**所有数字必须 `font-mono tabular-nums`**，以便对齐。

### 行高 / 间距

- 正文：`leading-relaxed` (1.625)
- 列表项：`space-y-2.5` (10px)
- 卡片内 padding：`px-6 py-6` (24px)
- 卡片间距：`gap-6` (24px)

## 4. 组件 primitives

### Card (`c-card`)
```
c-card                 圆角 / border-subtle / bg-surface
c-card--interactive    hover 时 border-medium + translate-y-[-1px]
c-card--featured       border-accent + accent-dim 背景
```

### KPI Grid (`kpi-grid`)
**永远横排 3 个等宽格子**（repowise "Three co-equal readings"）。每个单元：

```
<kpi-cell>
  <kpi-label>  ← text-label / text-muted
  <kpi-value>  ← font-mono / 28px / tabular
  <kpi-meta>   ← text-meta / text-muted
</kpi-cell>
```

### Tabs (`tabs`)
- 顶部横排，左对齐
- 当前 tab 字色 `--accent`，其他 `--text-secondary`
- 当前 tab 下划线 2px `var(--accent)`
- URL 状态：`?tab=...`

### Drawer (`drawer`)
右侧滑出，宽 `420px`。点击 overlay 关闭，`ESC` 关闭。
URL state：`?focus=...&drawer=1`。

### Table (`data-table`)
- zebra：`even:bg-surface-alt`
- 当前行：`bg-accent-dim`
- 列头：`text-label uppercase`
- 行高：`py-3` (12px)

### Badge (`badge`)
4 种状态：`ok` / `warn` / `fail` / `idle`。永远不出现红绿混色。

### Tag (`tag`)
两种：`tag`（默认紫底白字）/ `tag-muted`（中性灰）/ `tag-soft`（accent 描边）。
代表 skill 标签、ADR 编号、TD 编号。

### Button (`btn`)
- `btn-primary`：圆角胶囊 `rounded-pill`，`bg-accent text-on-accent`，hover `brightness-110`，active `scale-[.96]`
- `btn-ghost`：透明 + `--text-secondary`，hover `--accent`
- 最小触控高度 44px (`min-h-11`)

### Sidebar (`sidebar`) — v0.18.0+ (ADR-0030)

**全站常驻左侧栏**，取代 v0.3.0–v0.17.0 的顶部横向 nav。3 段 + 1 footer：

```
┌─────────────────────────────┐
│ [brand]     vibe coding mgr │   ← brand：复用现 nav-brand
├─────────────────────────────┤
│ 导航                        │   ← section: NAVIGATION
│  • Cockpit                  │
│  • Leaderboard              │
│  • …（9 个 nav link）       │
├─────────────────────────────┤
│ 项目             [ + Add ]  │   ← section: PROJECTS（来自 /api/projects）
│  ● vibe-coding-mgr          │
│  ● sales-ai                 │
├─────────────────────────────┤
│ 🌐 zh  ☀/☾  v0.18.0         │   ← footer：lang + theme + version
└─────────────────────────────┘
```

| 行为 | token / class |
|---|---|
| 容器宽度 | `--sidebar-width: 240px`（< 1024px 缩 200px） |
| 边框 | `border-right: 1px solid var(--border-subtle)` |
| 当前项高亮 | `background: var(--accent-dim)` + 左 2px `var(--accent)` stripe |
| 项目 status 点 | `--ok` / `--warn` / `--fail` / `--idle` |
| hover | `background: var(--surface-alt)` |
| `+ Add` 按钮 | `btn--ghost`（小），modal 用原生 `<dialog>`（HTML 5.2） |

可达性：
- 顶层 `<aside class="sidebar" aria-label="Primary">`。
- 3 段各自 `<nav aria-label="Navigation|Projects|Settings">`。
- 当前 nav 项：`aria-current="page"`。
- 项目 status 点：`aria-label="health: warning"` 等。
- `+ Add`：`aria-haspopup="dialog"`。

响应式（v0.18.0 范围，仅两档）：
- ≥ 1024px：sidebar 常驻。
- 768–1023px：sidebar 缩 200px；footer 折叠为图标按钮。
- < 768px：**不做**——vcm 主用户是 PC；移动端仅应急。v0.19+
  视情况再立 ADR。

主容器从 `max-width: 1280px; margin: 0 auto` 改成
`grid-template-columns: var(--sidebar-width) 1fr`，**1280 上限保持**。

**不做**：嵌套项目 / 拖拽重排 / file tree / 持久化激活项目
（见 ADR-0030 §决策）。

## 5. 视图（page）模式

### 通用骨架 (v0.18.0+)

```
<sidebar>        ← 来自 _partials/sidebar.html (ADR-0030)
  <brand>
  <section nav>    ← 9 个 nav link（cockpit / leaderboard / …）
  <section projects>  ← 来自 /api/projects + [ + Add ] 按钮
  <footer>          ← lang + theme + version
<main>           ← 主体（grid 占位 1fr）
  <subtitle>       ← 当前视图主题描述
  <answers>        ← "Answers: what is this and what should I look at first?"
  <KPI grid>       ← 3 个等宽柱子
  <tab bar>        ← tabs (URL state)
  <content>        ← 当前 tab 的主体内容
```

> v0.3.0–v0.17.0 用顶部横向 nav；v0.18.0 改全站 sidebar。
> **所有 nav URL 不变**——sidebar 只是把同样的 9 个 link
> 换到左侧容器里。`_partials/nav.html` 保留作为 fallback / 测试 fixture。

### "Answers" 行（每页必备）

```html
<div class="answers-line">
  <span class="answers-tag">Answers</span>
  <p>what is this project, and what should I look at first?</p>
</div>
```

> 这条规则来自 repowise 的"each view answers one question"。它让 dashboard 从"看指标"变成"问对问题"。

### URL 状态

凡是 tab / view / 过滤器，**永远进 URL**。例：
- `/projects/foo?tab=health`
- `/skills?shared=2`
- `/?tab=attention`

## 6. 颜色 / 暗色纪律

**默认暗色**。理由：dashboard 在终端里粘在二屏上，与编辑器（暗色）共存更舒服；repowise 同款。

要切 light：在 `tokens.css` 内新增 `:root[data-theme="light"] {}` 块，**不动** 任何组件代码。

## 7. 不要做的事（mirror repowise）

- ❌ **不轮播** — 内容固定 3 列直铺，没有 carousel
- ❌ **不混合多个 KPI 出一个综合分** — 三个柱子永远平铺
- ❌ **不在产品文案承诺"能干 X"而无数字** — 所有指标带 n= / p= / 数据来源
- ❌ **不静默做 LLM 调用** — vibe-coding-mgr 不调用 LLM，但本规则同样适用
- ❌ **不在视图里用 alert(msg) 当 UI** — 用 drawer + url focus
- ❌ **不让 tab/view 活在 JS state** — 永远进 URL

## 8. 验收脚手架

每个新组件或新页面前，先看：
1. 这个组件用到哪些 token？（用 token 名而非 hex）
2. 它的字号属于哪个层（label / meta / body / card / section / display）？
3. 它在 URL 留状态吗？
4. 它有 data-test-hook 吗？（测试钩子与样式解耦）

测试钩子建议：`data-c="card"` / `data-c="kpi"` / `data-c="tab"` / `data-c="drawer"` / `data-c="badge"`。
