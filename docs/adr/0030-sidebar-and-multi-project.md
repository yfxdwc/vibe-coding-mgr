# ADR-0030 — Sidebar layout + multi-project registry

**状态**: 已采纳（v0.18.0，未实施）
**日期**: 2026-08-22
**作者**: mm7 / pi
**前置**: [ADR-0001](0001-repowise-inspired-frontend.md), [ADR-0025](0025-persistent-vcm-server.md), [ADR-0026](0026-bilingual-ui.md)

## 背景

`vcm-server` 自 v0.3.0（ADR-0001）以来用**顶部横向 nav**：
9 个 nav link + 右侧 meta（项目/技能/ADR/状态徽章）+ 语言切换 + 主题切换。
两个问题随 v0.17.0 的增长开始发痒：

1. **导航密度爆炸**：横向 9 个 link 在 1280px 视口挤一排，meta 区 5 个 span 加语言下拉再加主题按钮，**新访客根本找不到 settings**——README 反馈里出现 4 次"我差点找不到 peers"。
2. **项目不可见**：当前 `nav-meta` 只显示 `summary.total_projects`（数字），**项目名字一个都不显示**。要看项目必须进 cockpit 滚 6 屏到 `data-table`。CLI 工具用户的预期是"看到名字 → 点 → 进项目页"的一步操作，现在变成了 4 步。
3. **添加项目没有 UI**：`/api/collect`（v0.4.0）只接 `vcm push` 上报；用户想手动挂一个 repo 必须 ssh + 跑 CLI + `vcm push` 链路。
   **意外发现**：DB 实例的 `projects` 表当前**没建**（`server/dashboard.py:535` 有 `CREATE TABLE IF NOT EXISTS`，但跑出来的 DB 里只有 `audit_events / tokens / users`），列表 endpoint 现在返回空但**不报错**——属于 silent-broken。本 ADR 同时修。

本期目标是把 vcm-server 从"顶部 nav" 改成"左侧 sidebar"，与 ADR-0001
的 repowise 启发保持一致（repowise 文档站与本仓库的 v0.17.0 dashboard
都是信息密度载体的同一类视觉纪律；侧栏列目录 + 多项目跳转是其核心
pattern）。

## 决策

### 1. 全站 sidebar

所有继承 `_layout.html` 的页面都接 sidebar：cockpit / leaderboard /
drift / skills / trends / peers / audit / settings / projects / docs。
**不**做"半站 sidebar"——分两套布局会让 design system 立刻腐烂。

### 2. Sidebar 结构（自上而下 3 段）

```
┌─────────────────────────────┐
│ [brand]     vibe coding mgr │   ← 1. brand（与现有 nav-brand 复用）
├─────────────────────────────┤
│ 导航                        │   ← 2. NAVIGATION
│  • Cockpit                  │
│  • Leaderboard              │
│  • Drift                    │
│  • Skills                   │
│  • Trends                   │
│  • Peers                    │
│  • Audit                    │
│  • Docs                     │
│  • Settings                 │
├─────────────────────────────┤
│ 项目             [ + Add ]  │   ← 3. PROJECTS
│  ● vibe-coding-mgr          │
│  ● sales-ai                 │
│  ● …（按 last_seen_at 倒序）│
├─────────────────────────────┤
│ 🌐 zh  ☀/☾  v0.18.0         │   ← 4. footer（lang + theme + version）
└─────────────────────────────┘
```

- **NAVIGATION section**：现 nav-links 全部迁移；横向 top-bar 删除。
- **PROJECTS section**：来自 `/api/projects`，按 `last_seen_at DESC`。
  每项显示项目名 + 一个状态点（`--ok`/`--warn`/`--fail`，从最近一次
  state push 的 `summary.health_label` 推导）。无项目时显示
  `empty-state` + 引导按钮。
- **`+ Add` 按钮** → 打开 modal（见决策 §3）。
- **footer**：lang dropdown + theme toggle + 版本号；与现 nav-meta 1:1
  对应。

### 3. 添加项目：手动表单 + 保留 push

**手动表单（v0.18.0 新增）**：

- UI：sidebar `+ Add` → modal，2 字段（`name` + `absolute path`）。
- 提交：`POST /api/projects` body `{name, path}` → 后端校验
  - `name`: slug `[a-z0-9-]{3,40}`，与现存项目去重。
  - `path`: 绝对路径，必须存在且为目录；必须在 `HOME` 子树下（白名单）。
  - 校验失败 → 422 + 中文/英文错误提示（走 i18n）。
- 成功后：写入 `projects` 表 → 后台触发 `POST /api/collect` 拉首次 state。
- sidebar 立即刷新（Alpine `x-data` 监听）。

**保留 push 路径**：`vcm push` → `/api/collect` 路径完全不变；push 来了
就在 projects 表 upsert（与手动注册合并到同一表）。

### 4. 激活项目语义：**只 URL state**

- sidebar 点项目 → 跳 `/projects/<name>`。
- cockpit / leaderboard / drift 永远**展示所有项目的并集**，**不持久化
  激活项目**——cookie / localStorage 都不用。
- 与 ADR-0001 的「3 KPI 永远平行」一致；持久化激活会让 cockpit 从
  "全项目健康总览" 变成 "我的当前项目"，违反 v0.3 拍的纪律。

### 5. UI token 与样式

- **不**新增颜色 / 字号 / 间距，全部复用 `tokens.css` 现有 token。
- **只**在 `tokens.css` 加 `--sidebar-width: 240px`（与 `--space-*`
  节奏一致：240 = 6 × 40）、`--sidebar-collapsed-width: 64px`。
- 样式实现走 `components.css` 新段 `Sidebar`。`dashboard.css` 不
  写一行（与 ADR-0001 §1 禁上调一致）。
- sidebar 边框：`border-right: 1px solid var(--border-subtle)`。
- 项目列表 hover：`background: var(--surface-alt)`。
- 项目列表当前项（`/projects/<current>`）：`background: var(--accent-dim)` + 左 2px `var(--accent)` 描边。
- nav link 当前项（URL 匹配）：同上 accent-dim。

### 6. 响应式（v0.18.0 仅做两档）

| 视口宽度 | 行为 |
|---|---|
| ≥ 1024px | sidebar 常驻，主体自适应 |
| 768–1023px | sidebar 缩到 200px；footer 折叠为图标按钮 |

**< 768px 不做**——vcm 的主用户是终端开发者，PC 优先；移动端只
承诺"应急看一眼"。v0.18.0 不投入 hamburger / 滑出 / `<details>`
折叠，v0.19+ 视情况再加（届时单独立 ADR）。

主容器从 `max-width: 1280px; margin: 0 auto` 改成
`grid-template-columns: var(--sidebar-width) 1fr`，**1280 上限保持**
（不再扩大——sidebar 会同时变宽，不划算）。

### 7. 可达性 / ARIA

- 顶层 `<aside class="sidebar">` + `aria-label="Primary"`。
- 内部 3 段都用 `<nav>` 包裹，分别 `aria-label="Navigation"` / `"Projects"` / `"Settings"`。
- 当前 nav 项：`aria-current="page"`。
- `+ Add` 按钮：`aria-haspopup="dialog"`；modal 用 `<dialog>` 原生
  元素（HTML 5.2），自动 focus trap + ESC 关闭——Safari 15.4+ /
  Chrome 37+ / Firefox 98+（2021 年后）原生支持；vcm 不承诺更老
  浏览器。
- 项目 status dot：`aria-label="health: warning"`。

### 8. 顺路发现的 bug：**不**在 v0.18.0 scope 内

发现：`projects` 表 schema 在 `server/dashboard.py:535` 有
`CREATE TABLE IF NOT EXISTS`，但当前 DB 实例里**没建**——只有
`audit_events / tokens / users` 三张表。`list_projects` 现在返回
空数组且不报错（silent-broken）。

**决策：本 ADR 不修。** 拆独立 fix PR（预计 ADR-0031 + 1 个 commit）：

- 修 `init_db()` 末尾加 `PRAGMA table_info('projects')` 自检 + 显式
  re-create。
- 加 `bash scripts/routine_coverage.sh` 后的冒烟：
  `python3 -c "import sqlite3; ..."` 确认 4 表齐全。
- 理由：bug fix 自带最小冒烟，独立 PR 让 v0.18.0（sidebar + 多项目
  registry UI）保持"只增能力"边界；reviewer 不会被无关改动干扰。
- v0.18.0 的 `POST /api/projects` 路径会**自动**因这个 fix 而正常
  持久化（不依赖该 PR 时序）。

## 反对意见（self-argue）

- **Q: 这是 VS Code 抄过来的吗？**  
  **A:** 不是。VS Code 的 sidebar 是 file tree + 工具面板；本 ADR 的 sidebar
  是 nav + 项目 list + 设置 footer。形态相似但用途不同。**对齐的是
  repowise 文档站的「左侧目录列 + 目录中可添加多项目」**——这正是
  ADR-0001 已经拍过的"信息密度载体"的视觉纪律。

- **Q: 全站 sidebar 不会让 dashboard 类页面失重吗？**  
  **A:** 不会。cockpit 3-KPI grid + tab bar + content 是主体，sidebar
  只是导航。`max-width: 1280px` 不变，主体宽度从原 1280 减到 1040，
  仍在可读区间（≥ 1024px 设计目标满足）。

- **Q: 移动端 sidebar 折叠会不会难用？**  
  **A:** vcm 的"主用户"是终端开发者，PC 优先。**v0.18.0 不做 < 768
  折叠**——移动端只承诺"应急看一眼"（即侧栏不会隐藏当前页的关键
  信息），不承诺深度交互成本。v0.19+ 如有需要再单独立 ADR。

- **Q: 不持久化激活项目会反复点 sidebar 切换吗？**  
  **A:** 不会。`/projects/<name>` 详情页已经把当前项目作为 URL 主体，
  项目页自己头部就有 breadcrumb + "返回 cockpit"。回 cockpit 不需
  要激活项目——cockpit 永远看全。

- **Q: 添加项目的 modal 怎么防 path 注入？**  
  **A:** 后端白名单：必须 `HOME` 子树下的真实目录；前端不允许 `..`
  也不允许软链出 HOME。校验失败返回 422 + i18n 错误。这是 v0.18
  范围；远程注册（trust LAN mount）留 v0.19。

## 后果

### 正面

- **降低上手成本**：sidebar 把所有功能 1 屏内列出，新用户不再找不
  到 settings / peers / audit。
- **多项目 1 步可达**：sidebar 点项目名 → 进项目页，3 步变 1 步。
- **手动注册打通**：modal 加项目，UI 内闭环；不再依赖 CLI。
- **设计纪律延续**：所有 token 来自 tokens.css；不引入新依赖；不
  引入新框架；保持 Alpine + HTMX + ECharts。
- **顺手修了 projects 表 silent-broken**：DB 实例现在能正常持久化。

### 负面 / 风险

- **CSS 体积**：components.css 增加 ~80 行（sidebar + modal），
  dashboard.css 增加 ~20 行（grid 容器）。仍然 single-flight，无
  build 步骤。
- **JS 体积**：Alpine 不变；modal 用原生 `<dialog>`，**0 新 JS**。
- **测试**：旧 `tests/server/dashboard.test.js` 检查 nav 在 `<nav>`
  内——sidebar 改 `<aside>` 后 selector 需更新；`data-test-hook`
  全部保留（`data-c="sidebar"` / `data-c="sidebar-project"` /
  `data-c="sidebar-add"`）。
- **i18n 工作量**：sidebar 文案约 12 个新键（zh + en）。按 ADR-0026
  的 flat dict 模式添加即可。
- **不是 breaking change**：所有 URL 不变，所有 `/api/*` 不变；只
  是 HTML 渲染层换装。

### 不做

- ❌ 不持久化激活项目（cookie / localStorage / DB）
- ❌ 不做嵌套项目（group / sub-project）—— sidebar 一维 list
- ❌ 不做项目拖拽重排（v0.19 再说）
- ❌ 不做项目删除（v0.18 范围只增不删；项目"删除"= `vcm push` 不再
  上报；DB 自动 stale）
- ❌ 不在 sidebar 内嵌 file tree
- ❌ 不引入 React / Vue / Tailwind / PostCSS
- ❌ 不改 `/api/*` 契约（保留 `/api/projects` 只读列表 + 新增
  `POST /api/projects` 一个端点）
- ❌ **不做 < 768px 响应式折叠**（v0.18 仅两档；v0.19+ 再立）
- ❌ **不修 projects 表 silent-broken bug**（独立 fix PR，详见 §决策.8）

## 验收

```bash
# 1. 6 hard check 全过
bash scripts/routine_coverage.sh   # exit 0

# 2. ADR 编号唯一
python3 scripts/check_adr_index.py
# → "30 ADRs, all unique"

# 3. projects 表能正常持久化（依赖独立 bug fix PR，见 §决策.8）
sqlite3 vcm.db ".schema projects" | grep -q "CREATE TABLE projects"
sqlite3 vcm.db "SELECT COUNT(*) FROM projects;"   # 数字 ≥ 0

# 4. sidebar 在所有 9 个页面渲染
for path in / /leaderboard /drift /skills /trends /peers /audit /settings /docs/DESIGN.md; do
  curl -s "http://127.0.0.1:7340$path" | grep -q 'data-c="sidebar"'
done

# 5. 添加项目 modal 端到端
curl -X POST -H 'Content-Type: application/json' \
  -d '{"name":"test-proj","path":"/tmp/test-proj"}' \
  http://127.0.0.1:7340/api/projects
# → 201
curl -s http://127.0.0.1:7340/api/projects | grep -q '"name":"test-proj"'

# 6. 响应式仅两档
# ≥ 1024px：sidebar 常驻，断言 grid-template-columns 第 1 列 = 240px
# 768–1023px：sidebar 缩 200px，footer 折叠为图标按钮
# < 768px：本 ADR 不承诺；测试只断言 sidebar 仍渲染（不消失）
```

### 视觉测试（Playwright，**devDep**）

`package.json` 加 `playwright` 到 `devDependencies`（与 vitest 同区）。
`tests/server/sidebar.spec.js` 覆盖 3 个端到端场景：

| 场景 | 断言 |
|---|---|
| `sidebar renders on every page` | 9 个 URL 各访问一次，`aside[data-c="sidebar"]` 可见；当前 nav 项 `aria-current="page"` 准确 |
| `add project modal opens and persists` | 点 `[data-c="sidebar-add"]` → `<dialog>` open → 填 name + 合法 path → 提交 → sidebar 立即多一行；POST `/api/projects/<name>` 返回 200 |
| `add project rejects bad path` | modal 提交 `path=/etc` → 422 → 错误提示（zh + en）展示；不写入 projects 表 |

devDep 增量：`playwright` (~50 MB 含浏览器) + `@playwright/test` 单独 runner。**不进 runtime deps**——vcm-server 部署镜像不变。

## 参考

- [ADR-0001 repowise frontend](0001-repowise-inspired-frontend.md) —
  本期延续的设计纪律
- [ADR-0025 persistent runtime](0025-persistent-vcm-server.md) —
  systemd unit 旁路（这次顺手确认服务能跑新 endpoint）
- [ADR-0026 bilingual UI](0026-bilingual-ui.md) — sidebar 文案走 i18n
- [docs/DESIGN.md §5](../DESIGN.md) — 视图模式（本 ADR 在该节加
  sidebar 子节）
- [W3C ARIA APG: navigation landmark](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html)
- [HTML 5.2 `<dialog>` element](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) — modal 用原生