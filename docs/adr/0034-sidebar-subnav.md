# ADR-0034 — Sidebar sub-nav (project-as-folder with collapsible children)

**状态**: 已采纳 + 修订 (v0.18.3)
**日期**: 2026-08-22（v0.18.2 实施）；2026-08-22 修订加 §9 整栏收起
**作者**: mm7 / pi
**修订**: v0.18.3 — 删除 §不做 中 "不新增 sidebar 折叠模式" 红线，新增 §9
"整栏收起" 决策段；详见文末 "修订历史" 小节
**前置**: [ADR-0030](0030-sidebar-and-multi-project.md), [ADR-0032](0032-project-internal-features.md), [ADR-0033](0033-htmx-spa-navigation.md)
**备选**: [ADR-0032 横排 tabs](0032-project-internal-features.md)

## 背景

ADR-0032（v0.18.1 已实施）把项目内 7 个子入口（overview / drift /
skills / trends / peers / audit / docs）放在 `/projects/<name>` 顶部
横排 tabs。实施后主人反馈：

1. **tabs 在 project.html 内** — 离开项目页就消失，回首页 (cockpit)
   想再进子功能必须先点项目名 → 等页面加载 → 再点 tab。**3 跳**。
2. **sidebar 已经显示了项目名** — 但不能直接展开子功能，让"项目名"
   这个 sidebar 入口变成**只有概览**的虚链接。
3. **viewport 占用**：横排 7 个 tab 在 1280px 下 ≈ 360px 留白 + 标签
   压缩；与 sidebar 项目列表一起看时，主内容区有效宽度比预期窄。
4. **操作习惯**：现代 IDE / 文档站（VS Code Explorer / GitLab 侧栏 /
   Notion workspace 树）都是**项目作为文件夹展开**——视觉模型与
   用户心智一致。

主人决定：**保留 ADR-0032 的顶级 sidebar 减到 3 项决策**，把项目内
子入口从横排 tabs 改成 sidebar 二级目录。本 ADR 描述这套备选方案。

## 决策

### 1. sidebar 项目从"平面链接"变成"可折叠文件夹"

```
sidebar-project
  ├─ Overview          → /projects/<name>
  ├─ Drift             → /projects/<name>/drift
  ├─ Skills            → /projects/<name>/skills
  ├─ Trends            → /projects/<name>/trends
  ├─ Peers             → /projects/<name>/peers
  ├─ Audit             → /projects/<name>/audit
  └─ Docs              → /projects/<name>/docs
```

**7 项二级菜单**（ADR-0032 §决策.5 同构；本 ADR 不删 overview 而是保留
作为"回项目首页"的入口）。

### 2. Accordion + 默认首个展开 (v0.18.3 final)

**v0.18.2 初版**采用 “默认全部折叠 + 仅当前项目展开” 策略。主人反馈
两个问题：

1. **同时只能展开一个**——多项目对比场景下手动展开多个会冲突 →
   accordion (单选) 已在 v0.18.2 fix-up 实施。
2. **默认项目全折叠，首页过于“静默”**——主人打开 cockpit 页面
   (`/`) 时所有项目子菜单都是隐藏的，需要手动点 chevron 才能看到
   子页面入口。

**最终决策**（v0.18.3）：syncToCurrent() 用 4 级 fallback 链：

```
current (from URL) 非空？
  → expanded = [current]                   （项目页：当前项目展开）
  ↓
localStorage['vcm-sidebar-expanded'] 非空？
  → expanded = stored                       （保留手动预览）
  ↓
sidebar 第一个项目 (按 last_seen_at DESC)？
  → expanded = [firstProject]              （非项目页：默认展开首个）
  ↓
expanded = []                              （无项目：折叠）
```

**为什么“第一个项目”是 “last_seen_at DESC”：**

- sidebar 渲染顺序已是 SQL `ORDER BY last_seen_at DESC` (逗今)，
  与“最近活跃项目”在视觉顶部一致。用户从顶往下扫视，“第一个”
  = “最近活跃的” = 用户最可能想看的 = 默认展开是合理的。
- 不需要额外代码——该顺序由 `_render()` 侧端决定。

**与主人原文 spec 的调和**：

主人原始 spec：“点 sales-ai 标签时展开 sales-ai 的二级目录 (其他
项目的目录全部折叠)。如果点其他项目的标签，则在展开新项目的二级
目录的同时折叠原项目目录。”

§2 决策严格落实了 accordion 核心（同一时间最多展开一个项目），同时
通过 fallback 解决“首页静默”问题。手动点击 chevron 在任一 fallback
阶段都可覆盖，自动以最后一次点击为准。

**手动覆盖**：

- 用户点击 chevron 收起默认展开的首个项目 → `expanded = []` →
  `writeSet([])` → localStorage 记为 `[]`。
- 下次 syncToCurrent：stored = `[]`，长度 == 0 → 回落 “默认首个”。
  ⚠ **此时 user 的手动收起只生效一次**——下个 sync 又会展开首个。
  这是设计选择：手动操作是“临时覆盖”，不是“锁定偏好”。如需
  “锁定某个项目为始终展开”，可以走 v0.19+ 加一个 “pin default”
  菜单项（需额外 UI）。

**跨页保持**：

实现：Alpine.js `x-data` 持 `expanded: Set<string>`，初始化时
hydrate from localStorage；切换时同步写入。HTMX `htmx:afterSwap` 后
不需重 hydrate（sidebar 在 `<main>` 之外，跨页保持挂载）。

**测试覆盖**：`tests/server/subnav.spec.js` 包含 7 个 scenario
覆盖本节 accordion 行为（点击标签、点击 chevron、浏览器后退/前进、
非项目页 、深链接初始化、 htmx config 必须真生效等）。

### 3. sidebar 宽度保持 240px

**不**扩宽。原因：

- 二级菜单缩进 12px（项目本身 0px，二级 12px，再深 24px——本设计最
  深只到二级，所以**只需 12px 缩进**）。
- 二级菜单文字用 `font-size: var(--fs-meta)` (12px，比一级小一档)。
- 项目名 + 二级菜单 `padding-left: 8px` 留出图标位置。
- 多项目场景：sidebar 自带 `overflow-y: auto`，超长滚动。

预估视觉（240px 视口下）：

```
vibe coding mgr
─────────────
驾驶舱
排行榜
设置
─────────────
▾ vcm-smoke         (项目一级目录，已展开)
  Overview
  Drift
  Skills
  Trends
  Peers
  Audit
  Docs
▸ vibe-coding-mgr   (折叠)
▸ sales-ai          (折叠)
─────────────
🌐  ☀/☾  v18
```

### 4. active 状态：高亮 + 嵌套

- **当前项目一级目录** active 样式沿用 ADR-0030（`.sidebar-project.active`
  accent + left border）。
- **当前子页面** active：二级菜单项加 `.sidebar-sub-link.active`，样式
  与一级目录一致（accent + box-shadow），但**缩进**更明显。
- 路径匹配逻辑沿用现有 `is_active(prefix)` 宏：
  - `/projects/<name>/drift` → 项目 active + Drift 二级 active
  - `/projects/<name>` → 项目 active + Overview 二级 active

### 5. project.html `{% block tabs %}` 整体删除

ADR-0032 §决策.5 把 governance / health / history 折进 Overview section；
本 ADR 进一步把 **Overview section 本身**也吸收到 sidebar 二级目录的
Overview 入口（路径相同 `/projects/<name>`），故 `{% block tabs %}` 块
**整块删除**，`<main>` 直接渲染 Overview content。

7 个 tab → sidebar 二级目录后，`project.html` 顶部 **不再有横排 nav**。

### 6. 路由不变

`/projects/<name>` + `/projects/<name>/<feature>` 6 个路由**全部保留**。
ADR-0032 §决策.3 的 6 个旧顶级 redirect 路由也保留（向后兼容）。

### 7. i18n key 复用 + 新增 1 个

复用 `nav.drift / nav.skills / nav.trends / nav.peers / nav.audit /
nav.docs`（已存在，i18n.py line 61-65 / 69）。**新增**：

| Key | en | zh |
|---|---|---|
| `sidebar.subnav.overview` | Overview | 概览 |
| `sidebar.subnav.toggle_aria` | Toggle sub-navigation | 展开/收起子导航 |

### 8. CSS 新增

仅追加：

- `.sidebar-project` 内增加 `<button class="sidebar-project-toggle">`
  和嵌套 `<div class="sidebar-subnav">` 样式
- `.sidebar-sub-link` / `.sidebar-sub-link.active`
- `.sidebar-project-toggle` chevron 旋转动画

**不**新增 token；颜色 / 间距 / 字号全部用现有 tokens.css 变量。

### 9. 整栏收起 (v0.18.3 加) — icon-only 64px

> **本节为修订新增**，推翻原 §不做 中 "不新增 sidebar 折叠模式" 红线。
> 详细理由见文末 "修订历史" 小节。

把 **整条侧栏**从 240px 收到 64px icon-only 模式，触发器在 brand 行
("vibe coding mgr" 标题右边的 `‹` 按钮)。状态写 `localStorage['vcm-sidebar-collapsed']`,
刷新 + 跨页保留。

**9.1 触发器位置**

```
┌──────────────────────────────┐
│ [v] vibe coding mgr     [‹]  │ ← brand 行 + 收起按钮
├──────────────────────────────┤
│ 🚗 驾驶舱                       │
│ ⚙ 设置                        │
├──────────────────────────────┤
│ PROJECTS                  +  │
│ • vcm-smoke                    │ ← active 项目
│ • sales-ai                     │
│ • vibe-coding-mgr              │
├──────────────────────────────┤
│ 🌐  ☀/☾  v18                  │
└──────────────────────────────┘
```

按钮位于 `.sidebar-brand` 行**右侧** (`brand-line` 方案)。`‹` / `›`
字符分别表示 "收起" / "展开"。点击切换。

**9.2 收起态视觉 (64px)**

```
┌────┐
│ v  │
├────┤
│ 🚗 │
│ ⚙  │
├────┤
│ (S) │  ← 18→24px 项目图标（avatar <img> 或 hash 色 monogram 块）
│ (V) │
├────┤
│ 🌐 │
│ ☀  │
└────┘
```

- **brand**：只保留 `.sidebar-mark` ("v" 圆)，文字隐藏。
- **顶级 nav**：`.sidebar-link` 只显示 `<svg class="sidebar-icon">`，文字隐藏。
- **section head**：`.sidebar-section-head > span` 隐藏 (`PROJECTS` 标签不显示)。
  `+` add 按钮隐藏 (收起态禁用新增项目——避免误触，且 64px 装不下 dialog 触发)。
- **project 行**：`.sidebar-project` 只显示项目图标（§9.9：有 git remote
  时是 avatar `<img>`，否则 hash 色 monogram 块），名字隐藏。整行可点击，
  鼠标悬停 `title` 属性显示完整项目名。active 项目图标加 2px accent 外环。
- **chevron 收起按钮**：隐藏 (`/projects/<name>/<feature>` 子菜单在 64px
  下塞不下；收起态下点击项目 → 直接进 overview，不展开子菜单)。
- **footer**：`.sidebar-footer-version` 隐藏 ("v18" 在 64px 下太挤)。
  🌐 / ☀ 按钮保留。

**9.3 主区域调整**

`.shell-grid` 模板列由 `--sidebar-width` (240px) 改 `--sidebar-icon-width`
(64px)，主区域 `<main>` 多出 176px 可用宽度。**不**重新计算 `<main>`
padding，由 tokens.css 一处控制。

**9.4 子菜单展开与整栏收起的冲突**

当用户**收起整栏**时，项目内子菜单 (`/projects/<name>/<feature>`) 无法
显示——`64px` 宽度物理上无法放 7 个子链接。**处理规则**：

- 收起态下：项目 sub-nav **强制折叠** (`x-show="!collapsed || isExpanded(name)"`)。
- 展开态下：恢复 ADR-0034 §决策.2 行为 (默认折叠 + 当前项目自动展开)。
- 用户在收起态点击项目 → 进 `/projects/<name>` (Overview)，返回首页
  路径仍可在导航中找到 (因为 `.sidebar-project` 仍是 `<a>` 链接)。

**9.5 localStorage 键**

| key | type | 说明 |
|---|---|---|
| `vcm-sidebar-expanded` | JSON 数组 (ADR-0034 已用) | 项目子菜单展开列表 |
| `vcm-sidebar-collapsed` | `"1"` / `"0"` (本节新增) | 整栏是否收起 |

两个 key 互不干扰——一个管 "哪些项目的子菜单展开"，一个管 "整栏是
不是收起来了"。

**9.6 CSS 新增 (~25 行)**

仅追加：

- `--sidebar-icon-width: 64px` token
- `.sidebar[data-collapsed="true"]` 宽度收缩 + 子元素隐藏
- `.shell-grid:has(.sidebar[data-collapsed="true"])` 模板列收缩
- `.sidebar-collapse-btn` 样式 (transparent bg + hover bg)
- `.sidebar-project-icon` (avatar <img> / hash 色 monogram 块)
  18px 展开态 / 24px 收起态 + active accent 外环
- 响应式：`< 1024px` 时收起态也生效 (override media query)

**9.7 i18n 新增 2 个**

| Key | en | zh |
|---|---|---|
| `sidebar.collapse.button_title` | Collapse sidebar | 收起侧边栏 |
| `sidebar.expand.button_title` | Expand sidebar | 展开侧边栏 |

`button_title` 同时用于 `aria-label` 和 `title` (鼠标悬停 tooltip)。

**9.8 Alpine 状态合并**

`sidebarNav()` 函数新增 1 个字段 + 1 个方法：

```js
collapsed: localStorage.getItem('vcm-sidebar-collapsed') === '1',
toggleCollapse() {
  this.collapsed = !this.collapsed;
  localStorage.setItem('vcm-sidebar-collapsed', this.collapsed ? '1' : '0');
}
```

`<aside>` 上加 `:data-collapsed="collapsed ? 'true' : 'false'"`，CSS
按 `[data-collapsed="true"]` 渲染收缩态。

**9.9 项目图标自动获取 (v0.18.3 二次修订)**

> **本节为修订新增**，替代 §9.2 中 "status dot + 1 字母 monogram" 的
> 初版方案。主人反馈折叠后的图标需要优化 → 决策升级为"真实项目图标"。

**动机**：初版 monogram（点 + 首字母）在 64px 下不可区分——
`vcm-smoke` / `vibe-coding-mgr` 同以 `v` 开头，折叠态下只能靠
hover tooltip 猜。主人要求：**添加项目时自动获取图标**，展开态
项目名前也显示。

**9.9.1 图标来源（服务器不出网）**

- `projects` 表新增 2 列：`icon_url TEXT` + `icon_color TEXT`
  （init_db 幂等迁移：`PRAGMA table_info` 检查缺列则 `ALTER TABLE`）。
- 添加项目 (`POST /api/projects`) 或首次推送 (`POST /api/collect`
  INSERT 分支) 时调用 `server/project_icon.resolve_project_icon(path, name)`：
  1. `git -C <path> remote get-url origin`（subprocess，timeout 3s）
  2. 解析 host → GitHub / GitLab 构造 owner avatar URL：
     `https://github.com/{owner}.png?size=32` / `gitlab.com/{owner}.png`
  3. 无 remote / 非托管平台 / 目录缺失 → `icon_url=None`，
     `icon_color` = 项目名 md5 hash → HSL(48%, 42%) → hex 稳定色
- **服务器不发起任何网络请求**：只存 URL，浏览器 `<img>` 加载。
  离线 / API rate-limit / 代理环境全部安全；头像 404 时浏览器静默。
- 现有项目启动时懒回填（`_backfill_project_icons()`：只处理
  `icon_url IS NULL AND icon_color IS NULL` 行，幂等，失败静默）。

**9.9.2 渲染**

- 展开态：项目名前显示 18px 圆形图标 —— 有 `icon_url` 用
  `<img class="sidebar-project-icon" loading="lazy">`，否则
  `<span class="sidebar-project-icon--mono" style="background: {color}">S</span>`
  （首字母大写 + hash 色背景，白字）。
- 收起态：同一图标放大到 24px，项目名隐藏。active 项目图标加
  2px accent 外环 (`box-shadow: 0 0 0 2px var(--accent)`)。
- 旧 `.sidebar-project-name-first-letter`（纯字母）**废弃删除**。
- status-dot 在两种模式下都隐藏（图标接管状态/识别职责）。

**9.9.3 为什么不直接请求 GitHub API 拿 repo 专属头像**

owner avatar 已足够区分项目（每个 owner 一个头像），且零网络依赖。
Repo 专属 social preview 需要 API 调用（rate limit + 超时 + 缓存），
v0.19+ 可升级。

## 反对意见（self-argue）

- **Q: 二级菜单把 sidebar 撑得很长，与 cockpit 列表视觉冲突？**  
  **A:** 默认折叠（§2）让没访问过的项目不占视觉空间。当前项目展开
  的 7 行 ≈ 7 × 26px = 182px，sidebar 总高度通常 800+px，足够。可
  通过 `overflow-y: auto` 处理极端长 sidebar。

- **Q: 当前项目自动展开会不会太"自动"，让用户失去对 sidebar 的
  控制感？**  
  **A:** 自动展开是"侧栏文件夹"的通用习惯（VS Code / GitLab /
  Notion 都自动展开当前选中节点）。手动 chevron 允许强制覆盖。

- **Q: 不扩宽 240px 不挤吗？**  
  **A:** 240px - 12px 缩进 - 8px padding - 8px chevron ≈ 212px 文本
  区。子菜单文字 12px 平均 6 字符 ≈ 60px 宽。**余 152px**，远超够用。
  项目名（一级）可能 8-12 字符（mono font），仍能完整显示。

- **Q: localStorage 持久化展开状态，跨设备会不会让人迷惑？**  
  **A:** 主人用一台机器开发 + 一台机器演示的场景——本 ADR 不解决
  跨设备同步（v0.19+ 再说）。localStorage 是「本地 UI 偏好」，
  类比 IDE 的侧栏展开。

- **Q: 与 ADR-0032 横排 tabs 是同一份功能的不同呈现，为什么要 ADR？**  
  **A:** 因为这是**导航形态**的根本变化（位置 + 交互模式 + 状态管理
  + 删除 `{% block tabs %}`）。二选一会有不同后果（实施量 / 视觉 /
  习惯）。**值得**单独 ADR 记录决策，主人后续在两个 ADR 间选一个
  实施，决策路径清晰。

- **Q: 如果同时存在 ADR-0032 tabs + ADR-0034 sidebar subnav，岂不
  重复？**  
  **A:** 本 ADR §决策.5 **明确删除** `{% block tabs %}` 块。如果
  选 ADR-0034 实施，要把 ADR-0032 实施回滚（删除 project.html 的
  `<nav class="tabs">` 段）。如果保留 ADR-0032，本 ADR 标 "未实施"
  即可。

## 后果

### 正面

- **sidebar 是完整 sitemap**：任何子功能 1 跳可达，无需进项目页
- **视觉模型统一**：项目 = 文件夹 = 树，与 IDE / 文档站习惯一致
- **viewport 利用率高**：主区域不再被 360px 横排 tabs 占用
- **回项目首页方便**：Overview 一直在 sidebar 二级菜单里
- **HTMX 友好**：sidebar 在 `<main>` 外，跨页不重渲染；localStorage
  持久化也对 HTMX 无影响

### 负面 / 风险

- 实施比 ADR-0032 多：sidebar template 改 + Alpine state + localStorage
  + CSS 新增 3-4 条规则 + 删除 project.html tabs 块
- localStorage 在 SSR 首屏没 hydrate 时会闪一下（fallback：未读
  localStorage 时**默认折叠**，包括当前项目——已访问过的项目要等
  Alpine `init()` 后才展开。视觉影响 ≤ 100ms）
- 与 ADR-0032 二选一：选了本 ADR 就要撤销 0032 实施的 tabs 段
- 视觉层级比 ADR-0032 多一层：用户首次访问要"学"展开操作
  （折叠 chevron + 鼠标悬停提示）

## 验收

```bash
# 1. 7 hard check exit=0
bash scripts/routine_coverage.sh

# 2. Sidebar 顶级仍 3 项
curl -s http://127.0.0.1:7340/ | grep -c 'data-link='
# → 3

# 3. Sidebar 项目列表存在且每项含 subnav
curl -s http://127.0.0.1:7340/projects/vcm-smoke \
  | grep -c 'data-c="sidebar-subnav"'
# → N（N = 项目数）

# 4. project.html 不再有 <nav class="tabs">
curl -s http://127.0.0.1:7340/projects/vcm-smoke \
  | grep -c 'class="tabs"'
# → 0

# 5. /projects/<name>/<feature> 6 路由全工作
for f in drift skills trends peers audit docs; do
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:7340/projects/vcm-smoke/$f")
  echo "$f: $status"
done
# → 200 for all 6

# 6. Playwright: 当前项目自动展开
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:7340/projects/vcm-smoke/drift');
  await p.waitForLoadState('networkidle');
  const expanded = await p.\$eval(
    '[data-project=\"vcm-smoke\"] + .sidebar-subnav',
    el => getComputedStyle(el).display !== 'none'
  );
  console.log('auto-expanded:', expanded);
  await b.close();
})();
"
# → auto-expanded: true
```

## 不做

- ❌ 不删 6 个顶级 redirect 路由（向后兼容，沿用 ADR-0032 §决策.3）
- ❌ 不实现 `/projects/<name>/peers` per-project peer 引用 schema（v0.19）
- ❌ 不实现 `/projects/<name>/docs` per-project docs 目录扫描（v0.19）
- ❌ **不实施本 ADR**（主人后续从 ADR-0032 / ADR-0034 二选一再实施）
- ❌ 不扩 sidebar 宽度（保持 240px）
- ~~❌ 不新增 sidebar 折叠模式（v0.18.x sidebar 永远挂在左侧）~~  
  **v0.18.3 修订删除本条** —— 已新增 §9 整栏收起方案 (icon-only 64px)。
- ❌ 不重命名 i18n 现有 key（`nav.drift` 等原样复用）

## 修订历史

### v0.18.3 (2026-08-22) — 整栏收起

**为什么修订**：主人 (mm7) v0.18.2 上线后试用，发现：

1. **主区域挤**：1280px 视口下，sidebar 240px + main padding 32px × 2
   + content padding 24px × 2 ≈ 主区域可用 928px。ECharts cockpit 在小
   数据集下经常出现 y 轴标签被裁切，需要缩小字体或旋转标签。
2. **演示场景**：给团队演示 dashboard 时，希望"侧栏不要抢戏"——只留
   icon 列作为导航锚点，把视觉焦点让给图表。
3. **桌面 vs 笔记本**：mm7 用 13 寸笔记本外接显示器，主屏 1280×800，
   sidebar 240px 在小屏下占用 18.75% 横向空间——比例过高。

**推翻了什么**：

- §不做 中 "❌ 不新增 sidebar 折叠模式（v0.18.x sidebar 永远挂在左侧）"
- **没**推翻 ADR-0030 sidebar 基础设计 (仍是 sticky left rail, 仍是
  primary layout, 仍是 240px 默认) —— 仅在默认态基础上加了一个可切换
  的 icon-only 态。

**保留了什么**：

- ADR-0034 §决策.1-8 全部不变 (sub-nav / 项目 chevron / active state
  / `{% block tabs %}` 删除 / 路由不变 / i18n key 复用 / CSS 不新增 token)
- §9 是 §1-8 的**正交扩展**，不冲突：§1-8 管 "sidebar 内部子菜单展
  收"，§9 管 "sidebar 整条收不收"。

**迁移成本**：0 个老用户受影响 (默认态不变，新增按钮为 opt-in)；CSS
仅追加，不改 token；Alpine state 是新增字段。

### v0.18.3b (2026-08-22) — 折叠图标优化 + 项目图标自动获取

**为什么再修**：v0.18.3 初版折叠态 monogram（点 + 首字母）上线后，
主人反馈"折叠后的图标需要优化"——`vcm-smoke` / `vibe-coding-mgr`
同首字母不可区分。主人决策升级：**添加项目时自动获取项目图标**，
展开态项目名前也显示。

**推翻了什么**：

- §9.2 "status dot + 1 字母 monogram" 初版方案 → §9.9 项目图标
  (avatar `<img>` / hash 色 monogram 块)
- `.sidebar-project-name-first-letter` 纯字母元素 → 废弃删除
- status-dot 在 sidebar 隐藏（图标接管识别职责）

**没推翻什么**：§9.1-9.8 全部保留（64px 宽度 / brand 触发器 /
localStorage / grid 收缩 / i18n key / Alpine state）。

**新增落地物**：

- `server/project_icon.py` — git remote 解析 → avatar URL / hash 色
- `projects` 表 +2 列 (`icon_url` / `icon_color`)，init_db 幂等迁移
- `_backfill_project_icons()` — 启动时懒回填旧项目，幂等
- `POST /api/projects` + `/api/collect` INSERT 分支接入 resolve
- `.sidebar-project-icon` / `.sidebar-project-icon--mono` CSS
- `check-collapse.cjs` 更新为 icon 断言

## 参考

- [ADR-0030 sidebar 基础](0030-sidebar-and-multi-project.md)
- [ADR-0032 project-internal 横排 tabs（备选方案）](0032-project-internal-features.md)
- [ADR-0033 HTMX SPA navigation](0033-htmx-spa-navigation.md) — sidebar
  在 `<main>` 外，HTMX swap 不影响 Alpine state
- [docs/DESIGN.md §4 tabs component](../DESIGN.md) — 备选方案复用
- [docs/DESIGN.md §5 视图模式](../DESIGN.md) — 顶级 nav 减负
- VS Code Explorer / GitLab sidebar / Notion workspace tree — 视觉模型参考