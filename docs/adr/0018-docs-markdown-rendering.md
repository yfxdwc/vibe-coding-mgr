# ADR-0018 — Markdown rendering for `/docs` view (replace `<pre>`)

**状态**: 待实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.3.0 加 `/docs/<path>.md` 时只做 escaped `<pre>` dump——10 行代码，
够用。v0.9.0 加 TOC + 搜索（ADR-0017）后用户**真正会读 docs**了，
发现 `<pre>` 不可读：每个 `**bold**`、`# heading` 都是字面字符。

用户不得不切换窗口到 IDE 打开 .md 文件才能读懂。

## 决策

升级 `/docs` 视图加 markdown 渲染，**仅 stdlib** 实现（CHARTER §8）：
- `# / ## / ### / ####` → `<h1> / <h2> / ...`
- `**bold**` 和 `*italic*` → `<strong>` / `<em>`
- `` `inline code` `` → `<code>`
- `[text](url)` → `<a>`
- `- item` / `* item` → `<ul><li>...</li></ul>`
- `1. item` → `<ol>`
- 三个反引号围栏 → `<pre><code>`
- 段落（双换行）→ `<p>`
- HTML 转义（`<script>` 必须保持转义——核心安全保证）

不做：
- 表格（复杂度高，ADR/CHANGELOG 表格用 raw 已可读）
- 嵌套列表（> 2 层嵌套）
- 脚注 / 图片（CHANGELOG 不用图片）
- 任务列表 `- [ ]`（不需要）

## 反对意见

- **Q: 不用 mistune / markdown-it?  
  **A: 它们是 50KB+。Stdlib 实现 ~150 行，足够覆盖本文档 17 个文件。
  ADR-0018 是"刚好够用"。
- **Q: 万一 XSS?  
  **A: html.escape 在解析**前**调用。`<script>` 字面仍转义为 `&lt;script&gt;`。
  Markdown → HTML 解析过程不再二次转义（safe_text function）。
- **Q: 不做表格——CHANGELOG/CHARTER 表格怎么办？  
  **A: 它们会显示成 raw 管道表，**视觉 OK**因为是 monospace `<pre>`。
  我们仅渲染 the main content block。

### 后果

#### 正面

- `/docs` 真的能读：用户能 `cmd+click` 链接、看 heading、扫 bullet
- v0.9.0 加的搜索 + TOC 终于有真实内容可消费
- 维持 0 deps（CHARTER §8）

#### 负面 / 风险

- 维护 ~150 LOC markdown parser
- 未来换库时需测所有 ADR 的渲染正确性
- 表格不渲染——若用户强烈需要 v0.11.0 再加

### 验收

```bash
curl /docs/DESIGN.md | grep -E "<h1>|<strong>|<code>"   # 多个匹配
curl /docs/CHANGELOG.md | grep "<h2>"                  # 多版本
# XSS: <script>alert(1)</script> in markdown body must NOT execute
echo '<script>alert(1)</script>' > /tmp/test.md
# (test via injecting a fake md with script and asserting it stays escaped)
```

### 不做

- ❌ 表格（v0.11.0 候选）
- ❌ HTML 实体 / emoji shortcodes
- ❌ TOC 自动从内容生成（依赖手写 ADR 编号）

## 参考

- [CommonMark spec](https://spec.commonmark.org/)
- [v0.9.0 /docs viewer commit](https://github.com/.../vibe-coding-mgr/commit/b2bcbcc)
- [DESIGN.md §4 组件 primitives](../DESIGN.md)
- [ADR-0017](0017-docs-viewer.md) — TOC + search 前置
