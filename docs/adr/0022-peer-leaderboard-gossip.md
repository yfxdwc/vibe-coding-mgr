# ADR-0022 — Cross-server leaderboard gossip (peer protocol)

**状态**: 已实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

CHARTER §2 names 5 domains; vcm-server is the central dashboard
domain but it's **strictly local-first** (CHARTER §8): each instance
sees only its own SQLite, never another server's state.

Yet ROADMAP v2.0 ("Distributed mode: Multiple vcm-server instances,
gossip protocol") is explicit that multi-host aggregation is on the
table. The handoff §11 lists "Cross-server leaderboard gossip" as
v0.10.0 open work.

For v0.10.0 we ship the **minimum gossip** — a peer exchange protocol
that lets one server fetch a JSON summary from another, then merge into
its own leaderboard view. We do NOT ship:
- Background sync / heartbeat loop
- Conflict resolution (each server's view is authoritative for its own projects)
- Peer authentication beyond the same BasicAuth that protects /api/*

The eventual design (push-based gossip, vector clocks, signed updates)
ships in v1.0+ as a stability-milestone feature.

## 决策

### Peer registry: simple JSON file

Each server reads `$VCM_PEERS` (default `~/.vcm/peers.json`) on startup:

```json
{
  "peers": [
    {"name": "staging",      "url": "http://staging.internal:7338"},
    {"name": "production",   "url": "https://vcm.example.com:7338"}
  ]
}
```

v0.10.0 ignores auth on peer URLs (operators front them with the same
`VCM_AUTH_USER/PASS` they use locally); the same `Authorization`
header is sent to peers on outbound fetch.

### Peer summary protocol

- `GET <peer>/api/peer/summary` returns `{peer, fetched_at, projects}`:
  - `peer`: the peer's `name`
  - `fetched_at`: ISO timestamp
  - `projects`: lightweight list `{name, drift_score, last_seen_at}` —
    one row per project the peer knows about.
- `POST <peer>/api/peer/summary` accepts the same body and merges it
  into the local in-memory peer cache (TTL = 5 min).

### Local merging

- `GET /api/dashboard/leaderboard?scope=local|all`
  - `scope=local` (default): identical to v0.10.0 base behaviour.
  - `scope=all`: returns `local_projects ++ peer_projects`, sorted desc
    by `drift_score`. Each peer project tagged with `origin: <peer_name>`.
- `GET /api/peers` (new) returns the configured peer list with each
  peer's most-recent fetch status.

### Failure semantics

If a peer fetch fails:
- Logged to stderr.
- Cached summary (if any) is reused until TTL.
- Endpoint returns the merged view without that peer.

### Configuration

`VCM_PEERS`: path to the JSON file (default `~/.vcm/peers.json`).
Peer auth (BasicAuth, token) — same envvars `VCM_AUTH_USER/PASS` as the
local server; the peer URL inherits them as a BasicAuth header on
outbound `GET <peer>/api/peer/summary`.

## 反对意见

- **Q: Why pull-on-demand instead of background push?  
  **A: Push requires daemon threads + reconnect logic + backoff.
  Pull-on-demand covers 99% of leaderboard reads (operator opens the
  page, dashboard fetches peers). Background gossip is v1.0 work.

- **Q: Why JSON file instead of YAML / etcd / etc.?  
  **A: Local-first + 0 new deps (CHARTER §8). `~/.vcm/peers.json` is
  the same path the existing peers.yaml reader uses elsewhere; we
  stick to stdlib + JSON.

- **Q: How do peers authenticate?  
  **A: We assume the operator fronts both ends with the same HTTP
  BasicAuth (or shares bearer tokens). v0.10.0 does not introduce a
  new auth scheme — that's v1.0 territory.

- **Q: Won't this leak data across organizations?  
  **A: Operators configure peers in their own `peers.json`. Cross-tenant
  data leak is the operator's misconfiguration, not the protocol's.
  We don't add a "tenant" field — each server defines what it sees.

### 后果

#### 正面
- One vcm-server can see another server's drift, even over LAN.
- No background threads, no daemon complexity.
- Operators get a cross-team leaderboard by editing one file.

#### 负面 / 风险
- Stale data: a peer we can't reach returns its last-known summary
  (TTL-bounded) — operator must read the timestamp.
- No integrity check: a misconfigured peer could feed incorrect data.
  Mitigated by showing `origin` per row in the UI.
- Network latency: a `scope=all` read does N+1 sequential fetches.
  v0.10.0 caps N at 8 peers (configurable). v1.0 will add async-merge.

### 验收

```bash
# Two-server loopback smoke:
PEERS=/tmp/peers.json
echo '{"peers":[{"name":"B","url":"http://127.0.0.1:7339"}]}' > $PEERS

# Server A is on :7338, server B on :7339. Both register 1 project.
# A asks for scope=all:
curl 'http://127.0.0.1:7338/api/dashboard/leaderboard?scope=all' | jq '.projects | length'
# → 2 (one local, one from B)
```

### 不做
- ❌ Background push gossip (v1.0)
- ❌ Vector clocks / causality tracking (v1.0)
- ❌ Peer auth beyond existing BasicAuth (v1.0)
- ❌ Async parallel peer fetch (v1.0)

## 参考
- [ADR-0005 cross-project comparisons](0005-cross-project-comparisons.md)
- [ADR-0019 drift detection](0019-drift-detection.md)
- [ROADMAP.md v2.0 Distributed mode](../ROADMAP.md)
