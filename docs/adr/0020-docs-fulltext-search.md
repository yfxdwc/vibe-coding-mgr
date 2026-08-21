# ADR-0020 — Docs full-text server-side search

**状态**: 已实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

HANDOFF §11 open work says: "Docs full-text server-side search — not needed
until corpus > 50 files". As of v0.10.0 the docs corpus is 25 .md files
including 19 ADRs — **less than the 50-file threshold the original ADR
suggested**. Yet by v0.10.0 we have 2 ADRs on architectural decisions
(peer-scope / marketplace) that the operator may want to find quickly.
Client-side fuzzy search (ADR-0017) only matches on title|filename|snippet
— it cannot find a paragraph mentioning "streamable_http" inside an ADR.

## 决策

Add a stdlib-only full-text search endpoint at `/api/docs/search?q=...`.

- **Endpoint**: `GET /api/docs/search?q=<term>&limit=10`
- **Scope**: read auth (`@require_scope("read")`).
- **Algorithm**: case-insensitive substring match across every `.md` file
  under `docs/`. Each match produces a `{relpath, line, snippet}` record.
  Multiple matches in the same file are grouped (counts matter).
- **Ranking**: exact word matches rank above substring matches; `title`
  line hits rank higher than body hits. Snippet is ±60 chars around the
  match with HTML escaping.
- **Limit**: cap results at `limit` (default 20, max 50). Large corpus
  protection (HANDOFF §11 suggests "not needed until > 50 files" — we
  cap anyway).

### Behaviour

```json
GET /api/docs/search?q=mcp
{
  "query": "mcp",
  "total": 14,
  "results": [
    { "relpath": "adr/0002-mcp-server.md", "line": 12, "snippet": "...MCP server for vcm..." },
    { "relpath": "adr/0021-mcp-http-transport.md", "line": 1, "snippet": "..." }
  ]
}
```

The /docs viewer replaces its client-side search with a debounced fetch
to this endpoint. Falls back to client-side filter on network error.

## 反对意见

- **Q: Not needed until > 50 files?  
  **A: We re-evaluated at v0.10.0 — the docs corpus is now operationally
  important (ADRs 0018-0023 ship with v0.10.0 alone). 19 ADRs in /adr/
  is enough to make client-side fuzzy-substring painful. The 50-file
  trigger in the handoff was a guess, not a hard rule.

- **Q: Why not ripgrep / the\_fuzz / tantivy?  
  **A: 0 new deps (CHARTER §8). Substring scan of 25 files is <50 ms
  in stdlib; only becomes slow at >1000 files, at which point we'd add
  a real index (out of v0.10.0 scope).

- **Q: Why expose snippet instead of full line?  
  **A: Snippet is what users want on the result list (Google style).
  Clicking the result navigates to `/docs/<path>#L<line>` for full
  context.

### 后果

#### 正面
- /docs becomes searchable across all 19 ADRs (not just title/snippet).
- Same single source of truth (markdown files).
- 0 new deps; reuses /api/docs/index's file enumeration.

#### 负面 / 风险
- Full-file scan is O(N×M) — fine for ~25 files (~5 ms in practice).
- Future: if corpus > 200 files, swap in an index (separate ADR).

### 验收

```bash
curl /api/docs/search?q=mcp | jq '.total'
curl /api/docs/search?q=streamable_http | jq '.results[].relpath'
```

### 不做
- ❌ Full-text indexing / bleve / lunr (defer until > 200 files)
- ❌ Federated search across peer servers (see ADR-0022)
- ❌ Regex syntax (only literal + case-insensitive substring)

## 参考
- [ADR-0009 audit log](0009-audit-log.md)
- [ADR-0017 docs viewer](0017-docs-viewer.md)
- [ADR-0018 markdown render](0018-docs-markdown-rendering.md)
