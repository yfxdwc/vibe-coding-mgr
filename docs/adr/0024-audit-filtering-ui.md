# ADR-0024 — Audit log filtering UI (project + source_ip facets)

**状态**: 已实施（v0.12.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

ROADMAP v0.8.0 lists "Audit log: filtering UI (event_type / project /
source_ip facets)" as one of the open items. The current
`/audit` page (`server/templates/audit.html`) **already** filters by
event_type + since + limit, and the `/api/audit` endpoint accepts
`?event=` + `?project=` + `?since=` + `?limit=` + `?offset=` query
params (ADR-0009 / ADR-0012). What's missing is the **UI surface**
for `?project=` and `?source_ip=`, plus `scope_forbidden` (the auth-
failure sibling emitted by `@require_scope`) as a discoverable event
type.

The handoff §5.4 even names `scope_forbidden` explicitly as an event
type. The current event-type dropdown omits it, so operators can't
filter on it from the UI.

## 决策

Extend `/audit` page UI to expose the missing facets:

### Backend additions
- `audit.read_events()` accepts an optional `source_ip` filter
  (added to WHERE clause).
- `/api/audit` accepts `?source_ip=` query param.
- `/api/audit/purge` accepts `?source_ip=` for the same reason
  (so an operator can purge events from one noisy source).
- New endpoint `GET /api/audit/facets?since=...` returns counts grouped
  by `(event_type, project, source_ip)` so the UI can render facet
  chips with totals.

### UI additions
- A "Project" text input (free-text slug) and a "Source IP" text input
  on the same filter row as event_type + since + limit.
- A "Recent event types" panel listing every type that occurs in the
  current window with its count (so the user can click one to pre-set
  the event filter — better discoverability than the hardcoded
  `<option>` list).
- The hardcoded `<select>` options are kept as a fallback, but the
  facet panel is the primary discovery surface.

### URL state
The page already uses `history.replaceState` to keep filters in the
URL. We extend this to include `project` and `source_ip` so links
are shareable. No new state machinery needed.

## 反对意见

- **Q: Why facets instead of bigger dropdown?  
  **A: Dropdowns that don't reflect current data mislead. With 100+
  distinct project slugs across a multi-tenant deployment, a dropdown
  is unusable. A free-text input + facet panel gives both speed
  (recall-by-name) and discovery (click a chip).

- **Q: Why not make every column sortable?  
  **A: Out of scope. Sorting is a v0.13+ feature when the audit
  log has > 10k rows in regular use. For v0.12.0 we keep filter-only.

- **Q: Will the `source_ip` PII leak into the JSONL?  
  **A: Source IP is already recorded by the existing audit writer
  (`write_event(..., remote=request.remote_addr, ...)`). This ADR
  doesn't add PII; it surfaces what's already there.

### 后果

#### 正面
- Operators can answer "which IPs triggered auth_failure today?"
  with a single URL.
- Click-to-filter chips reduce operator cognitive load (CHARTER §2
  "answers" discipline).

#### 负面 / 风险
- An exposed filter on `source_ip=` lets an unauthorized operator
  enumerate IPs. But the endpoint already requires `read` scope
  (ADR-0014), which the audit page inherits via BasicAuth.

### 验收

```bash
# 1. /api/audit?source_ip=127.0.0.1 returns only matching events.
# 2. /api/audit/facets returns {events: {auth_failure: 4, ...},
#                                projects: {alpha: 12, beta: 7},
#                                source_ips: {127.0.0.1: 19}}.
# 3. /audit page renders 2 new inputs and the facet panel.
# 4. URL `/audit?project=alpha&source_ip=192.168.1.5` shows only alpha
#    events from that IP after refresh.
```

### 不做
- ❌ Sortable columns (v0.13.0)
- ❌ Date range picker (the user can type ISO dates; v0.13.0 may add a picker)
- ❌ Export / download (v0.13.0)

## 参考
- [ADR-0009 audit log](0009-audit-log.md)
- [ADR-0012 audit-sqlite](0012-audit-sqlite.md)
- [ADR-0014 endpoint scopes](0014-endpoint-scopes.md)
