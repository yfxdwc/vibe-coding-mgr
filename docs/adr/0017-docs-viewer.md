# ADR-0017 — `/docs` viewer with TOC sidebar and client-side search

**状态**: 待实施（v0.9.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.3.0 加了 `/docs/<path>.md` 路由——但只是把 markdown 文本包
在 `<pre>` 里 dump 出 HTML。可读性 OK 但**不友好**：

- 没有 TOC，不知道有哪些 ADR
- 没有 navigation，阅读时迷路
- 没有 search，要找特定主题只能 grep 文件

15 个 ADR + ROADMAP + DESIGN + ARCHITECTURE = 19 个 .md 文件，
越来越大。`docs/adr/0001-...` 到 `0016-...` 已经按编号排序，
但用户没法在 UI 里直接看到。

## 决策

升级 `/docs/<path>.md` 视图，加：
- **左侧 TOC sidebar** —— 自动列出 `docs/adr/` 下所有 ADR + 其他
  顶级 markdown，按文件名排序
- **顶部搜索框** —— 客户端 fuzzy search（`<script>` 内 inline 30 行），
  不用引入 fuse.js / lunr
- **当前页面 H1 / H2 标题抽出** —— 显示在内容顶部

### 实现细节

Sidebar 数据从 server 端 route `/api/docs/index` 拉，避免
N+1 queries:

```json
GET /api/docs/index → {
  "adr": ["0001-repowise-inspired-frontend.md", ...],
  "design": ["DESIGN.md"],
  "philosophy": ["PHILOSOPHY.md", ...],
  ...
}
```

前端 sidebar 用 Alpine.js 渲染 + 客户端 fuzzy search over
title + filename + first 200 chars。

### 反对意见

- **Q: 为什么不用 lunr / fuse?  
  **A: **零依赖**。搜索 corpus 50+ 文件，inline 30 行 fuzzy 足够
  （substring match + score）。v0.9.0 拒绝增加 100KB+ deps。
- **Q: 为什么不 server-side full-text search?  
  **A: corpus 小、读多写少。客户端搜索 0ms 网络 round-trip。
  未来 corpus 1000+ 时切到 lunr-server-side。
- **Q: 为什么不直接用 mkdocs / docusaurus?  
  **A: 那是 separate build step（违反 CHARTER §8 本地优先），且 docs
  跟 dashboard 一体更好。

### 后果

#### 正面

- 15 个 ADR 在 UI 里可发现、可搜索
- v0.5.0+ 的设计纪律（docs 跟代码同步）有更好的回报路径
- `vcm doctor` 报"WARN: missing ADR-000X" 时，用户能直接 `vcm doctor` 给
  出链接点过去看

#### 负面 / 风险

- Sidebar 体积 ~ 200 LOC Alpine.js（够小）
- 客户端 search 准确度不如 server-side（subsequence match 够用）
- Search index **不持久化**——每次 refresh 重建（OK，< 1ms）

### 验收

```bash
# 200 OK + 含 sidebar
curl /docs/DESIGN.md | grep "data-c=\"docs-sidebar\""

# TOC 列出全部 ADR
curl /api/docs/index | jq '.adr | length'   # = 16

# Search works in browser
# Type "audit" → filters to ADR-0009 + ADR-0012 + ADR-0016
```

### 不做

- ❌ Full-text server-side search（corpus 太小）
- ❌ lunr / fuse.js / 任何 100KB+ 依赖
- ❌ Doc build step（`make docs`）—— 违反 CHARTER §8
- ❌ Doc versioning / git history 集成

## 参考

- [v0.3.0 docs route commit](https://github.com/your-org/vibe-coding-mgr/commit/...)
- [DESIGN.md §4](../DESIGN.md) — 组件 primitives
- [CHARTER §8](../CHARTER.md) — 本地优先
- [Alpine.js docs](https://alpinejs.dev/) — 已用
