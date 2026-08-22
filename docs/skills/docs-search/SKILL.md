---
name: docs-search
description: "修改 server/docs_search.py (FTS5 索引)、/api/docs/search 端点、/docs 视图的客户端搜索框或调整搜索 token 分词前必读 — 含 docs/_meta 同步策略、SQLite FTS5 schema 4 表、命中排序算法 3 条硬约束。"
authority: canonical
canonical_ref: ../../adr/0020-docs-fulltext-search.md
tags: [docs, search, fts5, sqlite, fulltext, viewer]
---

# Docs Full-Text Search (/docs + FTS5)

> **When to read**: 改 docs viewer 搜索、增删索引表、调排序 / 分词时必读。
> **Authority**: [`ADR-0020`](../../adr/0020-docs-fulltext-search.md)

## 1. 范围

- `server/docs_search.py` — SQLite FTS5 索引 + 查询函数
- `/api/docs/search?q=...&project=...` — REST 搜索端点
- `/docs` 视图的 client-side 搜索框 (HTMX + Alpine, 即时高亮)
- 索引范围: `docs/adr/*.md` + `docs/*.md` + 当前项目的 `AGENTS.md` / `CHARTER.md` / `README.md`
- 测试: `tests/docs-search.test.js` (12 测试: FTS5 schema / token 化 / 排序)

## 2. 硬约束

- ❌ **不要让 FTS5 索引走 `INSERT OR REPLACE`** — ADR / README 改名后会导致 orphan 行, 必须 `DELETE` + `INSERT`
- ❌ **不要把搜索结果里的命中片段用 `innerHTML` 渲染** — 必须 `<mark>` + 转义, 否则 XSS
- ❌ **不要让搜索 token 化用正则** — 必须走 SQLite FTS5 内置 `unicode61` + `tokenchars='_-'` (避免 `peer-gossip` 被切成两半)
- ✅ FTS5 schema 4 表: `docs_fts (path, title, body, project)` + `docs_fts_idx` + `docs_fts_meta` + `docs_fts_trigram` (用于 LIKE)
- ✅ 排序: BM25 score desc, 然后 path asc (确定性次序)
- ✅ 索引写入时机: `vcm snapshot` 后, 通过 `init_db()` 调用 `reindex_docs()`

## 3. 反模式

- 用 `LIKE '%foo%'` 替代 FTS5 — 慢且不支持排序
- 把搜索框的 debounce 设到 < 200ms — 每个按键触发一次 reindex 是浪费
- 跨项目搜索不显示 project 标签 — 用户无法区分同名词条
- 搜索结果直接展示完整 markdown body — 应只展示命中片段 + 标题

## 4. 验收

```bash
# 1. FTS5 schema 完整
sqlite3 ~/.vcm/vcm.db ".schema docs_fts" | head -5
# 期望: CREATE VIRTUAL TABLE docs_fts USING fts5(...)

# 2. 索引行数 = markdown 文件数
sqlite3 ~/.vcm/vcm.db "SELECT COUNT(*) FROM docs_fts"
ls docs/**/*.md docs/*.md | wc -l
# 两个数字应相等 (考虑 .gitignore 与 INDEX.md 排除)

# 3. 搜索命中
curl -s "http://127.0.0.1:$VCM_PORT/api/docs/search?q=drift" | jq '.results | length'
# 期望: ≥ 1

# 4. 排序确定性
curl -s "http://127.0.0.1:$VCM_PORT/api/docs/search?q=skill" | jq '.results[].path'
# 期望: path 升序

# 5. 测试
npm test -- tests/docs-search.test.js tests/docs-viewer.test.js   # all passed
bash scripts/routine_coverage.sh                                   # exit 0
```

## 5. 相关文档

- [`ADR-0020`](../../adr/0020-docs-fulltext-search.md) — FTS5 决策
- [`server/docs_search.py`](../../server/docs_search.py) — 索引 + 查询
- [`ADR-0017`](../adr/0017-docs-viewer.md) — /docs viewer 决策
- `tests/docs-search.test.js` — FTS5 schema + 排序测试
- [`server/templates/_docs.html`](../../server/templates/_docs.html) — 搜索框 + 高亮
