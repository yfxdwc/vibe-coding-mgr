"""
server/markdown_render.py — tiny stdlib markdown renderer (ADR-0018).

Subset of CommonMark that's actually used in our docs/:
- # / ## / ### / #### headers
- **bold** and *italic*
- `inline code`
- [text](url) links (no autolinks)
- - / * bullet lists
- 1. numbered lists
- ```code blocks``` (``` lang fences supported)
- > blockquote (single line)
- paragraphs (blank-line separated)

NOT supported (intentionally):
- tables (defer to v0.11)
- nested lists beyond depth 2
- footnotes, images
- HTML in markdown (we always escape)

XSS guarantee: `html.escape()` is applied to the source text BEFORE
any rendering. The rendered output then only adds our own tags.
"""

from __future__ import annotations

import html as html_lib
import re


_INLINE_PATTERNS = [
    # inline code first (capture group 1 = code text)
    (re.compile(r"`([^`]+)`"), lambda m: f"<code>{m.group(1)}</code>"),
    # bold
    (re.compile(r"\*\*([^*]+)\*\*"), lambda m: f"<strong>{m.group(1)}</strong>"),
    # italic (avoid matching **)
    (re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)"), lambda m: f"<em>{m.group(1)}</em>"),
    # links [text](url)
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"), lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>'),
]


def _apply_inline(text: str) -> str:
    """Apply inline transforms. text is already HTML-escaped."""
    for pat, fn in _INLINE_PATTERNS:
        text = pat.sub(fn, text)
    return text


def render_markdown(src: str) -> str:
    """Render markdown source to HTML. XSS-safe (source is escaped first)."""
    # 1. Escape the entire source so any HTML in the .md stays inert.
    src = html_lib.escape(src)
    # 2. Split into lines; render block-level elements.
    out = []
    lines = src.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        # fenced code block (``` or ```lang)
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            i += 1
            body = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            code_text = html_lib.unescape("\n".join(body))
            lang_attr = f' class="lang-{html_lib.escape(lang)}"' if lang else ""
            out.append(f"<pre{lang_attr}><code>{html_lib.escape(code_text)}</code></pre>")
            continue
        # ATX heading
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = _apply_inline(m.group(2))
            out.append(f"<h{level}>{text}</h{level}>")
            i += 1
            continue
        # blockquote (>)
        if line.startswith("&gt; "):
            text = _apply_inline(line[5:])
            out.append(f"<blockquote>{text}</blockquote>")
            i += 1
            continue
        # bullet list (- or *)
        if re.match(r"^[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i]):
                items.append(_apply_inline(lines[i].lstrip("-* ").strip()))
                i += 1
            out.append("<ul>" + "".join(f"<li>{it}</li>" for it in items) + "</ul>")
            continue
        # numbered list (1. 2. ...)
        if re.match(r"^\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i]):
                items.append(_apply_inline(lines[i].lstrip("0123456789. ").strip()))
                i += 1
            out.append("<ol>" + "".join(f"<li>{it}</li>" for it in items) + "</ol>")
            continue
        # blank line
        if not stripped:
            i += 1
            continue
        # paragraph: gather consecutive non-blank, non-special lines
        para = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            ns = nxt.strip()
            if not ns: break
            if re.match(r"^#{1,6}\s+", nxt): break
            if re.match(r"^[-*]\s+", nxt): break
            if re.match(r"^\d+\.\s+", nxt): break
            if nxt.startswith("```"): break
            if nxt.startswith("&gt; "): break
            para.append(nxt)
            i += 1
        out.append(f"<p>{_apply_inline(' '.join(para))}</p>")
    return "\n".join(out)
