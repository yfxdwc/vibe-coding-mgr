"""
server/docs_search.py — full-text search across docs/ (ADR-0020).

Stdlib-only. Returns ranked, snippeted results for /api/docs/search.
"""

from __future__ import annotations

import html as html_lib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"

_MAX_LIMIT = 50
_SNIPPET_RADIUS = 60
_MAX_HITS_PER_FILE = 5  # don't surface 50 matches inside one file


def _snippet(text: str, pos: int, length: int) -> str:
    """Return ±60 chars around the match, HTML-escaped for embedding."""
    start = max(0, pos - _SNIPPET_RADIUS)
    end = min(len(text), pos + length + _SNIPPET_RADIUS)
    snippet = text[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return html_lib.escape(snippet).replace("\n", " ")


def search_docs(query: str, limit: int = 20) -> dict:
    """Search docs/*.md for `query` (case-insensitive substring).

    Returns {query, total, results} where results is a list of
    {relpath, line, snippet, count} records, sorted by score desc.
    """
    if not query or not query.strip():
        return {"query": "", "total": 0, "results": []}

    limit = max(1, min(limit, _MAX_LIMIT))
    q = query.strip()
    ql = q.lower()

    results = []
    total = 0

    if not DOCS_DIR.exists():
        return {"query": q, "total": 0, "results": []}

    for path in sorted(DOCS_DIR.rglob("*.md")):
        try:
            rel = str(path.relative_to(DOCS_DIR))
        except ValueError:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        text_l = text.lower()

        # Find all matches in this file
        file_hits = []
        idx = 0
        while True:
            pos = text_l.find(ql, idx)
            if pos == -1:
                break
            # line number (1-based)
            line = text.count("\n", 0, pos) + 1
            file_hits.append((pos, len(q), line))
            idx = pos + 1

        if not file_hits:
            continue

        total += len(file_hits)
        # Dedupe by line number within the file: a single markdown line
        # can mention the term many times; one snippet per line is enough
        # for the result list (clicking jumps to /docs/<path>#L<line>).
        seen_lines = set()
        for pos, length, line in file_hits[:_MAX_HITS_PER_FILE]:
            if line in seen_lines:
                continue
            seen_lines.add(line)
            snippet = _snippet(text, pos, length)
            results.append({
                "relpath": rel,
                "line": line,
                "snippet": snippet,
            })

    # Sort: relpath asc, then line asc — stable and predictable
    results.sort(key=lambda r: (r["relpath"], r["line"]))
    return {
        "query": q,
        "total": total,
        "results": results[:limit],
        "truncated": total > len(results[:limit]),
    }
