# ADR-0032 — Project-internal features (project-context sidebar nav)

**状态**: 已采纳（未实施）
**日期**: 2026-08-22
**作者**: mm7 / pi
**前置**: [ADR-0030](0030-sidebar-and-multi-project.md), [ADR-0001](0001-repowise-inspired-frontend.md)

## 背景

v0.18.0 sidebar（ADR-0030）有 9 个顶级 nav link：cockpit / leaderboard /
drift / skills / trends / peers / audit / docs / settings。但其中 6 项是
**项目视角**的功能——drift / skills / trends / peers / audit / docs 都是
**某个项目内的视图**（看特定项目的 drift score、该项目用了哪些 skill、
该项目的事件流、该项目引用的 peer 仓库，等等）。

把它们放在顶级 sidebar 让产品语义混乱：

- 用户首次进 dashboard 看到 9 个入口，不知道哪些是"系统级 / 全局级"哪些
  是"项目级"
- 用户想看"vcm-smoke 这个项目用了哪些 skill"——必须先点 sidebar 的
  `skills` 进跨项目技能汇总，再 grep / 过滤——4 步操作
- 项目本身（`/projects/<name>`）的 secondary tabs 只有 overview / governance
  / health / history，**没**覆盖 drift / skills / trends / peers / audit /
  docs——意味着项目内的真实功能必须跳出去用

## 决策

### 1. 顶级 sidebar 减到 3 项（v0.18.2 起减到 2 项）

只保留服务级 / 全局级：

| Nav | 路由 | 角色 |
|---|---|---|
| 驾驶舱 | `/` | 多项目总览（KPI + 项目列表 + attention）|
| 排行榜 | `/leaderboard` | 项目在群体中的排名（仍跨项目——但概念是"项目视角"的全局榜单）|
| 设置 | `/settings` | 服务配置 |

其余 6 项（drift / skills / trends / peers / audit / docs）**全部**挪到
项目内。

> **v0.18.2 update (supersedes 本节"排行榜"行)**：详见文件末尾
> `§v0.18.2 update` 章节。`/leaderboard` 从顶级 sidebar 降级为
> cockpit 的第 4 个 tab（与 `overview` / `attention` / `activity` 平级），
> 顶级 sidebar 减到 2 项（驾驶舱 + 设置）。`/leaderboard` 旧 URL
> 保留 302 重定向 `/?tab=leaderboard` 以保证书签 / curl / 外链不坏。
> 原"3 项"表保留作为历史快照，不删除。

### 2. `/projects/<name>` 加 project-section-nav（6 + 1 项）

`project.html` 现有 4 个 tab（overview / governance / health / history）
**整合**成新 secondary nav 的一部分：

| Tab | URL | 内容来源 |
|---|---|---|
| Overview | `/projects/<name>` | 项目 KPI + skills summary + facts（保留旧 overview tab 内容，governance/health/history 内嵌到 Overview 子 section）|
| Drift | `/projects/<name>/drift` | 复用 `drift.html`，传 `?project=<name>` |
| Skills | `/projects/<name>/skills` | 复用 `skills.html`，传 `?project=<name>` |
| Trends | `/projects/<name>/trends` | 复用 `trends.html`，传 `?project=<name>` |
| Peers | `/projects/<name>/peers` | 复用 `peers.html`，传 `?project=<name>`（v0.18.1 peers 改用项目维度的 reference；旧 view 为空也接受）|
| Audit | `/projects/<name>/audit` | 复用 `audit.html`，传 `?project=<name>` |
| Docs | `/projects/<name>/docs` | 复用 `_docs.html`，传 `?project=<name>`（v0.18.1 项目 docs = 项目仓库内 `docs/` 子目录；空时 fallback）|

合计 7 个 tab。

### 3. 顶级路由行为：404 → 旧顶级 URL 仍然可访问但 redirect

为了不打破 bookmark / curl / external link：

- `/drift` `/skills` `/trends` `/peers` `/audit` `/docs` 路由**保留**——但
  redirect 到 `/`（cockpit），附 flash 消息提示"已移入项目内"
- `/leaderboard` `/settings` **不动**（顶级保留）
- 模板文件**保留**——作为 `/projects/<name>/<feature>` render 的代码库

### 4. 模板侧 filter：`?project=<name>`

trends.html / audit.html 已经支持 `?project=` URL 参数（line137 / 224）。
本 ADR 增加：

- `dashboard.py:get_drift(project=None, ...)` 加可选 filter（之前只接受
  `now=None`）。当传 `project`，filter 出单项目 score。
- `app.py:` 新增 6 个路由 `/projects/<name>/<feature>`，每个调用对应
  `dashboard.get_*()` 并附 `?project=<name>`，render 对应模板。
- `skills.html` 需要小改：把 fetch `/api/dashboard/skill-matrix` 改成
  `/api/dashboard/skill-matrix?project=<name>`（API 已经支持）。
- `peers.html` 需要**大改语义**：从"OSS 全局关注列表"变成"项目引用的
  peer 仓库"。v0.18.1 项目 peers schema 还没建——本 ADR**保留**旧
  template 渲染，但在 `/projects/<name>/peers` 上下文显示空状态 +
  "v0.19+ 将引用 per-project"。这是**已知缺口**，写在 §不做。

### 5. project.html 重构

`project.html` 现有 4 个 tab 的内容（governance / health / history）
**集成进 Overview tab**：

- Overview 主 section 包含：
  - 3 KPI（governance / TDs / tree）
  - Skills summary（已有）
  - Quick facts（已有）
  - **新增**：Governance docs table（旧 governance tab 内容）
  - **新增**：Health snapshot（旧 health tab 内容）
  - **新增**：Push history timeline（旧 history tab 内容，简化版）
- 移除 `{% block tabs %}` 内 4 个 button
- 顶部加新 `<nav class="project-section-nav">`（7 个 link）

### 6. 路由总数：39 → ~46（不减）

- 加 6 个 `/projects/<name>/<feature>` 路由
- 保留 6 个顶级 `/<feature>` 路由（变 redirect）
- 净增：0（一对一替换）

### 7. 视觉

新 secondary nav 用现有 `.tabs` 样式（DESIGN.md §4 已有）——横排 tabs、
URL state、当前项 accent。**不**新增 token / 组件。

## 反对意见（self-argue）

- **Q: 6 个 tab 在 project.html 不挤吗？**  
  **A:** 1280px 视口下 7 个 tab + 各 tab 文字平均 6 字符 ≈ 紧凑但可读。
  < 1024px 时 sidebar 缩 200px（让出空间给主体），tabs 仍可显示。
  移动端 < 768px 不承诺（v0.18.0 §6）。

- **Q: 为什么不保留顶级 view 作"全局汇总"？"**  
  **A:** 主人原则：服务中不该有项目相关功能。`/skills` 显示"哪些 skill
  在多项目共享"看似有用，但需要项目内 context 才能解读——owner 把这当成
  v0.19+ 的 multi-project view 再说。v0.18.1 严格按"项目内"语义。

- **Q: redirect 6 个顶级路由是否留债？**  
  **A:** 否。Redirect 是 v0.18.1 的明确设计——保留 URL 防止 link 坏。v0.19
  可以删顶级路由（如果主人确认无人用）。

- **Q: peers 概念从"OSS 关注列表"变成"项目内引用"是大重定义？"**  
  **A:** 是。本 ADR 写明：v0.18.1 `/projects/<name>/peers` 显示**空状态** +
  "v0.19+ 引用 per-project" 提示。**不**隐藏旧 view——它仍可访问（顶级
  redirect 到 cockpit，但 `peers.html` 文件保留作为 `/projects/<name>/peers`
  的占位渲染）。

- **Q: project.html 大改 governance / health / history → Overview 是否
  breaking？"**  
  **A:** `/projects/<name>?tab=governance` 的 URL state 会失效（变成
  Overview）。但项目页本身没有 deep-link 依赖（tab 是 state 而不是 URL）——
  实际上 dashboard 已经用 URL state（`?tab=`），但 project.html 用 Alpine
  in-memory state。影响小。

## 后果

### 正面

- **语义清晰**：顶级 = 服务 / 全局；项目内 = 项目视角
- **一步可达**：项目页直接有6 个功能 tab，不用跳顶级 + 过滤
- **设计纪律**：sidebar 从 9 项 → 3 项（视觉更轻），与 repowise 文档站
  "top-level 是索引，不是菜单"的纪律一致
- **未来扩展**：v0.19+ 加 multi-project view（`/skills` 全项目汇总）时，
  顶级路由有了重新设计的语境

### 负面 / 风险

- `peers.html` 概念未迁移完整——v0.18.1 显示空状态（v0.19 跟进）
- project.html 大重构（governance / health / history → Overview 内嵌）——
  review 工作量增加
- 6 个 redirect 路由——v0.19 应该删（但 v0.18.1 必须留）

## 验收

```bash
# 1. 7 hard check exit=0
bash scripts/routine_coverage.sh

# 2. Sidebar 只 3 项
curl -s http://127.0.0.1:7340/ | grep -c 'data-link='
# → 3

# 3. /projects/<name>/<feature> 6 路由全工作
for f in drift skills trends peers audit docs; do
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:7340/projects/vcm-smoke/$f")
  echo "$f: $status"
done
# → 200 for all 6

# 4. 旧顶级路由 redirect
for f in drift skills trends peers audit docs; do
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' \
    "http://127.0.0.1:7340/$f")
  echo "$f → $loc"
done
# → all redirect to /

# 5. /projects/<name> 渲染 7-tab secondary nav
curl -s http://127.0.0.1:7340/projects/vcm-smoke \
  | grep -c 'data-tab='
# → 7

# 6. Playwright scenario 1 updated (3 nav, not 9)
npm run test:e2e
```

## 不做

- ❌ 不删 6 个顶级路由（redirect 保留，向后兼容）
- ❌ 不实现 `/projects/<name>/peers` 的 per-project peer 引用 schema（v0.19）
- ❌ 不实现 `/projects/<name>/docs` 的 per-project docs 目录扫描（v0.19）
- ❌ 不删 `_partials/nav.html`（保留作为 fallback / 测试 fixture）
- ❌ 不重构 ADR-0030 的 sidebar decision（仅加 §"v0.18.1 update"）

## v0.18.2 update — Leaderboard 降级为 cockpit tab

**状态**：已采纳（v0.18.2，未实施）
**作者**：mm7 / pi
**触发**：v0.18.1 上线后 1 周回访 — 排行榜虽然跨项目，但语义是
"项目视角的全局榜单"（看到自己在群体中的位置），与 cockpit
"多项目总览"概念重叠。顶级 sidebar 3 项 → 2 项后，排行榜作为
cockpit 的第 4 tab（`overview` / `attention` / `activity` / `leaderboard`）
语义上更清晰。

### 决策

**1. 顶级 sidebar 减到 2 项**：驾驶舱 + 设置。**2. cockpit 新增第 4 tab `leaderboard`**：与 `overview` / `attention` / `activity` 平级。**3. 简化 tab 内功能**：原 `/leaderboard` 有 6 个排序按钮 + 升降序切换 + URL state。迁入 tab 后只保留**默认排序**（`td_count desc`，最严重的项目排最前）+ 表格。**4. URL 重定向**：`/leaderboard` 302 redirect 到 `/?tab=leaderboard`，保留书签 / curl / 外链兼容。

### 取舍

- **简化排序功能**：原 `/leaderboard` 支持 6 种排序（td_count / skills / adrs / compliance / last_seen / dirty_clean）+ 升降序。tab 内降级后只保留默认排序，**不暴露排序 UI**。理由：排行榜在 cockpit tab 中的位置是"项目群体中的位置"，默认 td_count desc 已经回答了"哪个项目最需要注意"——这正是 cockpit 的核心问题。技能数 / ADR 数 / 合规度等次级排序在 cockpit `overview` 矩阵中已经可见（按列排序或 hover 查看）。**净债最小**：少 ~80 行 Alpine 状态 + URL state 逻辑，少 ~12 行 i18n 排序 label；功能损失可接受（次级排序 = 不常用 + overview 矩阵可补）。
- **API 不变**：`/api/dashboard/leaderboard?sort=...&order=...` 保留。tab 内 fetch 不带参数，服务端默认 `td_count desc`——已有逻辑自动满足。
- **SSE 不监听 leaderboard 数据**：排行榜数据变化不频繁（只在 push 时变），tab 切换时 fetch 一次即可。**少监听 = 少 SSE 重连风险**，符合 CHARTER §5 净债最小。

### 改动清单

| 文件 | 改动 |
|---|---|
| `server/templates/_partials/sidebar.html` | 删 leaderboard 链接（3 行） |
| `server/templates/dashboard.html` | tabs 块加 `leaderboard` button；content 块加简化版 leaderboard section；page() 函数加 `lbRows` + `loadLeaderboard()` |
| `server/app.py` | `/leaderboard` 路由改为 `redirect(/?tab=leaderboard, code=302)` |
| `server/templates/leaderboard.html` | 删（内容 inline 到 dashboard.html） |
| `server/i18n.py` | 加 `cockpit.tabs.leaderboard` 键（en + zh） |

### 验收

> **端口约定**：本 ADR 验收脚本使用 `127.0.0.1:7340` 作示例，但
> **实际端口由 `~/.vcm/server.env` 的 `VCM_SERVER_PORT` 决定**
> （`scripts/install-service.sh::pick_free_port()` 在 7338..7399
> 中自动选空闲端口，避免与 repowise / 其他本地服务冲突）。
> 安装后用 `systemctl --user status vcm-server` 或
> `cat ~/.vcm/server.env` 查实际端口。

```bash
# 拿实际端口（避免文档中的示例端口与本机不符）
PORT="${VCM_SERVER_PORT:-$(grep ^VCM_SERVER_PORT= ~/.vcm/server.env 2>/dev/null | cut -d= -f2)}"
PORT="${PORT:-7339}"  # install-service.sh 默认首选 7338，7399 退回
BASE="http://127.0.0.1:${PORT}"

# 1. 6 hard check 全过
bash scripts/routine_coverage.sh   # exit 0

# 2. 顶级 sidebar 剩 2 项
curl -s "$BASE/" | grep -c 'data-link='
# → 2

# 3. /leaderboard 302 → /?tab=leaderboard
curl -s -o /dev/null -w '%{http_code} → %{redirect_url}' \
  "$BASE/leaderboard"
# → 302 → http://127.0.0.1:${PORT}/?tab=leaderboard

# 4. /?tab=leaderboard 显示 leaderboard tab
curl -s "$BASE/?tab=leaderboard" | grep -q 'data-tab="leaderboard"'
# → exit 0

# 5. /api/dashboard/leaderboard 仍工作
curl -s "$BASE/api/dashboard/leaderboard" \
  | grep -q '"rows"'
# → exit 0

# 6. 测试通过
npm test
```

### 反对意见（self-argue）

- **Q：3 → 2 项会不会让 sidebar 太轻？**  
  **A**：sidebar 不是菜单，是"信息密度载体的索引"（ADR-0001 repowise 启发）。2 项 = 驾驶舱（唯一索引页）+ 设置（服务元信息），足够。剩余功能在驾驶舱 tab 内部 / 项目页内部都有入口。

- **Q：删 leaderboard.html 是否破坏测试 fixture？**  
  **A**：测试只 curl URL 不读模板文件（`tests/server/dashboard.test.js` 用 selector 抓 `<nav>` / `<aside>`，不引用文件名）。删模板安全。

- **Q：为什么不留"高级排序"折叠面板？**  
  **A**：CHARTER §3「长期稳定 > 短期少 diff」+ §5「净债最小」。折叠面板 = ~50 行新 JS + 新 i18n 键 + 新 token；功能价值低（次级排序不常用）；不划算。

### 不做

- ❌ 不删 `nav.leaderboard` i18n 键（保留以防历史 fallback）
- ❌ 不删旧 `leaderboard.*` i18n 键（保留 — `/api/dashboard/leaderboard` 端点仍可访问，未来 reverse 也可能用到）
- ❌ 不重构 cockpit `overview` tab（矩阵已能补次级排序需求）
- ❌ 不加 SSE 监听 leaderboard（变化不频繁 + 简化 = 少债）

## 参考

- [ADR-0030 sidebar](0030-sidebar-and-multi-project.md) — sidebar 基础
- [ADR-0001 repowise frontend](0001-repowise-inspired-frontend.md) —
  "answers what question" 原则
- [docs/DESIGN.md §4 tabs component](../DESIGN.md) — secondary nav 复用
- [docs/DESIGN.md §5 视图模式](../DESIGN.md) — 顶级 nav 减负
- 主人决策：v0.18.1 起"服务级 / 全局级" = cockpit + leaderboard +
  settings；其他 = 项目内
- v0.18.2 update：上述决策的 v0.18.1 版快照保留作为历史；v0.18.2 起
  leaderboard 降级为 cockpit 第 4 tab，顶级 sidebar 减到 2 项 = cockpit +
  settings