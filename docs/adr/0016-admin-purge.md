# ADR-0016 — `/api/audit/purge` admin endpoint

**状态**: 待实施（v0.9.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.7.0 加了 `scope=admin` token 能力，但 ROADMAP 留了"per-endpoint
ACL scopes: admin endpoints"待办。具体需求：**audit log 容量控制**。

CHARTER §6 "审批可追溯"约束要求 audit 永久保留——但
forever 是空话。PostgreSQL 实践的 7 年保留法 / GDPR 的
"as long as necessary" 都是合理的边界。v0.9.0 落地：
- 默认永久保留
- admin 可以显式 purge 早于 `before` 时间戳的 events

## 决策

`POST /api/audit/purge` （admin scope, 写在 ADR-0014 装饰器层）

```json
Request:
  { "before": "2026-08-01T00:00:00+00:00",  // ISO date-time
    "event_type": "auth_failure",            // optional filter
    "project": "specific-project",           // optional filter
    "confirm": "PURGE" }                     // literal confirmation

Response:
  { "deleted": 1234,  // count of rows removed
    "before": "...",
    "event_type": "auth_failure" }
```

### 二次确认

请求体必须带 `"confirm": "PURGE"`，否则 400 + 不删除任何行。
防止误操作：用户清空 form / 写错时间戳都不会触达真删除。

### Audit 自身

purge 操作**也写一条 audit log**：`event_type=audit_purge`，
payload 含 `before`、`deleted_count`、调用者 user_id。
原则："**审计审计本身**也要被审计"。

### 反对意见

- **Q: 不留个软删除标志?  
  **A: 不。audit log 简单 append-only JSONL 哲学与软删除冲突。
  物理删除，purge 本身也记一条。
- **Q: 为什么用 `confirm: PURGE` 而非 dry-run flag?  
  **A: dry-run 增加"忘记加 flag"的失误风险。**字面量确认**更
  像 shell 删除前的 `y/N` 提示——强提示，写错就 400。
- **Q: 批量删除?  
  **A: v0.9.0 仅单次。v1.0.0 加 retention policy (自动按 7d/30d/1y
  滚动)。

### 后果

#### 正面

- 关闭 v0.6.0 admin scope 空白 (`@require_scope('admin')` 现在有真路由)
- 实操可清理 30+ 天前的 auth_failure 噪声
- 审计审计本身可追溯

#### 负面 / 风险

- 误删无法恢复——二次确认是唯一屏障
- 不会自动 rollup（v1.0.0 加 `retention_policy`）

### 验收

```bash
TOK=$(vcm token grant admin-user --scope admin)
# 默认 refuse
curl -X POST -H "Authorization: Bearer $TOK" \
  -d '{"before": "2026-01-01"}' /api/audit/purge
# → 400 (no confirm)

# 带 confirm 真正删
curl -X POST -H "Authorization: Bearer $TOK" \
  -d '{"before": "2026-01-01", "confirm": "PURGE"}' /api/audit/purge
# → 200, {"deleted": 5}

# read-only token 拒绝
RTOK=$(vcm token grant alice --scope read)
curl -X POST -H "Authorization: Bearer $RTOK" \
  -d '{"before": "2026-01-01", "confirm": "PURGE"}' /api/audit/purge
# → 403
```

### 不做

- ❌ 自动 retention 滚动（v1.0.0）
- ❌ 软删除 / "tombstone" 行（哲学冲突）
- ❌ Per-event purge by id（CLAUDE.md: "删除单条 = 篡改审计"）

## 参考

- [CHARTER §6](../CHARTER.md) — 审批可追溯
- [ADR-0011](0011-per-user-acl.md) — admin scope 引入
- [ADR-0012](0012-audit-sqlite.md) — audit SQLite backing
- [PostgreSQL audit best practices](https://www.postgresql.org/docs/current/sql-syntax.html)
- [OWASP Audit Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
