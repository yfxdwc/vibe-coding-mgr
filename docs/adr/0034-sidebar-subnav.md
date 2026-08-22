# ADR-0034 — Sidebar sub-nav (project-as-folder with collapsible children)

**状态**: 已采纳（未实施 — 等待主人从 ADR-0032 与本方案二选一）
**日期**: 2026-08-22
**作者**: mm7 / pi
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

### 2. 默认折叠 + 当前项目自动展开

- **未访问**过的项目：`collapsed`，只显示项目名（一行）。节省 sidebar
  垂直空间。
- **当前项目**：含 `/projects/<name>` 任何路径（含 `/projects/<name>/drift`
  等子页面）→ 项目**自动展开** 7 个子菜单。
- **手动控制**：每个项目名前面有一个 chevron 按钮（`▸` / `▾`），
  点击强制展开/收起——用户想同时展开多个项目对比时可以手动展开。
- **状态持久化**：展开/收起状态存 `localStorage['vcm-sidebar-expanded']`
  （JSON 数组，记录展开的项目名）。刷新后保留。

实现：Alpine.js `x-data` 持 `expanded: Set<string>`，初始化时
hydrate from localStorage；切换时同步写入。HTMX `htmx:afterSwap` 后
不需重 hydrate（sidebar 在 `<main>` 之外，跨页保持挂载）。

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
- ❌ 不新增 sidebar 折叠模式（v0.18.x sidebar 永远挂在左侧）
- ❌ 不重命名 i18n 现有 key（`nav.drift` 等原样复用）

## 参考

- [ADR-0030 sidebar 基础](0030-sidebar-and-multi-project.md)
- [ADR-0032 project-internal 横排 tabs（备选方案）](0032-project-internal-features.md)
- [ADR-0033 HTMX SPA navigation](0033-htmx-spa-navigation.md) — sidebar
  在 `<main>` 外，HTMX swap 不影响 Alpine state
- [docs/DESIGN.md §4 tabs component](../DESIGN.md) — 备选方案复用
- [docs/DESIGN.md §5 视图模式](../DESIGN.md) — 顶级 nav 减负
- VS Code Explorer / GitLab sidebar / Notion workspace tree — 视觉模型参考