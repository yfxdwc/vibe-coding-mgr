# ADR-0012 — Audit log SQLite backing (keep JSONL as parallel stream)

**状态**: 待实施（v0.6.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

ADR-0009 把 audit 写进 JSONL (`~/.vcm/audit.log`)。问题：
- 10k+ events → `grep + jq` 退化到秒级
- SQLite 表查询是 ms 级
- 没有 index，按 ts 范围扫整个文件
- 大文件难 rotate / archive

CHARTER §6 写操作必须可追溯——审计是 **infra-grade** 资产，不能 degrade。

## 决策

把审计 log **双写**到 SQLite events 表，JSONL 保留为冗余 stream（便于离线 grep）。

```
events (table)
  id        INTEGER PK
  ts        TEXT    (ISO 8601, indexed)
  event_type TEXT   (indexed)
  payload   TEXT    (JSON, free-form)
  project   TEXT    (indexed)
  source_ip TEXT
```

### 双写语义

- `audit.write_event()` 先写 SQLite，然后**异步 / 同步**写 JSONL。
- SQLite 写失败 → 退出非零（log to stderr + raise）。**审计不可丢**。
- JSONL 写失败 → stderr，但请求继续。**audit 必须有主存**。
- CLI 默认 `audit` 命令读 SQLite，但 `--tail` / `--follow` 走 JSONL（适合 logrotate 场景）。

### 新 API

```python
GET /api/audit?since=&event=&project=&limit=&offset=
  # before: list scan over JSONL
  # now:     SQL with WHERE ts >= since AND event_type = ...
GET /api/audit/stats?since=
  # NEW: counters by event_type (used by dashboard for bar chart)
  # {"auth_failure": 12, "state_pushed": 88, "registry_publish": 3}
```

### 视图变化

`/audit` 加 1 个 **统计图卡** (DESIGN.md §4 `kpi-grid`):
- 总事件数
- 401 次数
- 最近 push 时间
- 按 event 类型分布（bar，用已有 ECharts）

### 反对意见

- **Q: 直接抛弃 JSONL 不行吗?  
  **A: 不行。** ops 习惯了 `tail -f` 监视；CI runner 可能离线 grep；删 JSONL 是 regression。
- **Q: SQLite 写满怎么办?  
  **A: v0.7.0 加 auto-rotate。v0.6.0 设文件 size warning。
- **Q: 多 server 共享 audit?  
  **A: 不做（v0.7.0+ gossip 路线）。v0.6.0 保留本地。

### 后果

#### 正面

- 查询 10x-100x 加速
- 统计 endpoint (`/api/audit/stats`) 解锁可视化
- 不破坏 offline-friendly 运维

#### 负面 / 风险

- DB 文件 `server/vcm.db` 含 audit events，注意 backup
- 双写让单次 write_event 慢 ~1ms（sqlite INSERT，no-op on transaction）

### 验收

```bash
# 100 个 event，写入 SQLite
for i in $(seq 1 100); do curl -X POST /api/collect …; done
sqlite3 server/vcm.db 'SELECT COUNT(*) FROM events'  # 100

# 查询 <10ms
time curl 'http://127.0.0.1:7338/api/audit?limit=10'

# 统计 endpoint
curl /api/audit/stats?since=2026-08-01  # bar chart data

# JSONL 仍工作
tail ~/.vcm/audit.log | jq -r .event_type | sort | uniq -c
```

### 不做

- ❌ Replace JSONL entirely
- ❌ Auto-rotate（v0.7.0）
- ❌ Multi-server replay（v0.7.0 gossip）
- ❌ Real-time dashboard push from audit events（ADR-0007 SSE 覆盖）

## 参考

- [ADR-0009](0009-audit-log.md) — predecessor
- [CHARTER §6](../CHARTER.md)
- [RFC 4180](https://datatracker.ietf.org/doc/html/rfc4180)（CSV/JSONL interchange）
