# Brand assets — `docs/assets/`

> Icons, logos, and favicons for vibe-coding-mgr (vcm).
> Mirrors the design system tokens (`server/static/css/tokens.css`),
> dark-mode-first by default.

## 1. Primary mark — `icon.svg`

A 64×64 SVG emblem: radar arc scanning over a centered dot, with a
downward chevron forming the "v" in vcm.

- **Radar arc** — cross-project attention (the project's central metaphor)
- **Center dot** — the project being watched
- **Chevron** — the "v" in vibe / vcm

Sized at 64×64 so it downsizes cleanly to 16, 32, 180, 512 px without
re-balancing strokes. The accent color (`#f59520`) is hardcoded so the
mark reads correctly on any background — including dark, light, and
readme-as-image contexts.

## 2. Horizontal logo — `logo.svg`

A 360×110 lockup: `[icon] vcm   vibe-coding-mgr`. Use in:

- `README.md` header (replace the inline ASCII banner)
- `docs/ONBOARDING.md` header
- GitHub repo social preview (`Settings → Social preview` upload)
- npm package page (when published)
- Slide decks / blog posts

The logo is **dark-mode-first** (full dark backdrop) to match the
project's default theme (DESIGN.md §1). For light contexts, swap:

```svg
<rect ... fill="#0a0a0a"/>     →   fill="#f5f5f4"
<text ... fill="#f5f5f4">     →   fill="#0a0a0a"
<text ... fill="#a8a29e">     →   fill="#57534e"
```

## 3. Favicon set

Rendered from `icon.svg` via `rsvg-convert`:

| File | Size | Use |
|---|---|---|
| `favicon-16.png` | 16×16 | Legacy browsers, tab favicon at small sizes |
| `favicon-32.png` | 32×32 | Modern browsers (the default `<link rel="icon">` size) |
| `favicon-180.png` | 180×180 | iOS / `apple-touch-icon` |
| `favicon-512.png` | 512×512 | PWA / Android home-screen / share previews |

The Flask `_layout.html` declares all four sizes via `<link rel="icon">`
and `<link rel="apple-touch-icon">`. Browsers pick the best match
automatically.

## 4. Dashboard nav icons — `server/static/icons/`

Ten 24×24 SVG icons, all matching the same conventions:

- **Stroke width:** 1.5px (with `vector-effect: non-scaling-stroke` so
  they stay crisp at any display size)
- **Color:** `stroke="currentColor"` — picks up `--text-secondary` in
  the resting state, `--accent` on hover/active
- **Style:** outline, rounded line caps, geometric, no fill
- **Naming:** semantic (`cockpit`, not `home`; `drift`, not `arrow`)

| File | Used by | Symbol |
|---|---|---|
| `cockpit.svg` | `/` (dashboard root) | gauge + needle |
| `leaderboard.svg` | `/leaderboard` | 3-tier podium |
| `drift.svg` | `/drift` | center node + 3 diverging arrows |
| `skills.svg` | `/skills` | 3 stacked layers (skill stack) |
| `trends.svg` | `/trends` | rising line chart |
| `peers.svg` | `/peers` | 4-node network |
| `audit.svg` | `/audit` | event log / list rows |
| `docs.svg` | `/docs/DESIGN.md` | open book |
| `settings.svg` | `/settings` | gear |
| `doctor.svg` | (CLI; reserved for `/doctor` view) | ECG / heartbeat |

### 4.1 Sprite — `sprite.svg`

All ten icons are concatenated into one file as `<symbol>` elements
and referenced via `<use href="...#cockpit">`. This is the standard
SVG-sprite pattern:

```html
<svg class="nav-icon" aria-hidden="true">
  <use href="/static/icons/sprite.svg#cockpit"></use>
</svg>
```

Benefits over individual `<img>` tags:

- 1 HTTP request for all 10 icons (vs 10)
- Browser caches the sprite; CSS `currentColor` propagates naturally
- `<use>` references survive JS hot-reload without flicker

The Flask nav macro (`server/templates/_partials/nav.html:5`) wraps
each `<use>` in a `.nav-icon`-classed `<svg>` so the CSS rule
(`.nav-icon { width: 14px; ... }`) sizes it correctly inside
`.nav-link` flex containers.

## 5. Design tokens used

Every color in the icon set maps to a token from
`server/static/css/tokens.css`:

| Token | Hex | Used for |
|---|---|---|
| `--accent` | `#f59520` | All brand-mark strokes + active nav state |
| `--text-primary` | `#f5f5f4` | Logo wordmark |
| `--text-secondary` | `#a8a29e` | Logo subtitle, resting nav links |
| `--bg` | `#0a0a0a` | Logo dark backdrop, favicon background |
| `--accent-dim` | `rgba(245, 149, 32, 0.12)` | Active nav-link background |

**No hardcoded hex values appear in the icon SVGs other than `#f59520`
(the accent) and `#0a0a0a` (the favicon backdrop)**. All other colors
flow through `currentColor` so a future theme addition (light / high
contrast / brand alt) only requires swapping the consumer's CSS color.

## 6. Adding a new icon

1. Hand-craft a 24×24 SVG matching the style (1.5px stroke, rounded
   caps, `currentColor`).
2. Save to `server/static/icons/<name>.svg`.
3. Add a `<symbol id="<name>" viewBox="0 0 24 24">…</symbol>` entry
   to `server/static/icons/sprite.svg` (insert after the last existing
   symbol).
4. Reference it from any template via
   `<svg class="nav-icon"><use href="/static/icons/sprite.svg#<name>"></use></svg>`
   or call the `nav_icon('<name>')` macro in `_partials/nav.html`.

If the icon introduces a new concept, also add a row to the table
in §4 above and consider whether a `SKILL.md` entry is warranted
(see `docs/skills/skill-authoring/SKILL.md`).
