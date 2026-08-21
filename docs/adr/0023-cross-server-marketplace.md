# ADR-0023 — Cross-server skill marketplace (peer-aware registry)

**状态**: 已实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

ADR-0008 ships a local skill marketplace: skills live under
`~/.vcm/registry/skills/<name>/SKILL.md`. `/api/registry/skills` reads
that directory. This works for one machine.

But the vcm operator story doesn't end at one machine: a team has a
shared registry (LAN-shared, Git-backed, etc), and each developer's
vcm-server should be able to surface skills from teammates without
a full infrastructure overhaul.

The handoff §11 lists "Skill marketplace cross-server — LAN-shared
registry" as v0.10.0 open work. The point is to let a vcm-server
**peer** with another server and surface its registry rows alongside
its own.

## 决策

Add a peer-aware version of `/api/registry/skills`:

### Endpoint

```
GET /api/registry/skills?scope=local|all
   - local (default): just the local registry, unchanged.
   - all: local + every cached peer's registry, merged + deduped.
```

### Peer registry exchange protocol

Each server exposes its registry as a **list-only** JSON endpoint:

- `GET <peer>/api/peer/registry` returns
  `{peer, fetched_at, skills: [{name, version, description, author, ...}]}`.
  No body POST side (registry updates go through the existing CLI
  `vcm skill publish`, not via HTTP peer exchange — that's v1.0 work).

### Merging

- Skills are deduped by `name` + `version` (semver exact match wins).
- Origin recorded as `local | <peer_name>`.
- If both a local skill and a peer publish the same name+version,
  **local wins** (authority ordering per CHARTER §7).
- Response includes a `peers` array with per-peer fetch status
  (ok / unreachable / empty).

### Configuration

Reuses `VCM_PEERS` (`~/.vcm/peers.json`) introduced by ADR-0022.
Registry fetches happen on-demand (no background loop), with a 5-min
TTL matching the drift gossip.

### Cross-server publish (deferred)

Cross-server **publish** (server A pushes its skill to server B) is
not in v0.10.0 — operators still publish locally. v1.0 will add a
gossip-style publish that respects authority ordering.

## 反对意见

- **Q: Why not just share `~/.vcm/registry/skills/` on NFS or git?  
  **A: That's a viable operational pattern — and we don't preclude
  it. But it requires ops setup outside vcm. The peer exchange makes
  cross-server discovery work out of the box for 2-server teams
  with zero extra config.

- **Q: Why GET-only (no POST for accept)?  
  **A: Authority (CHARTER §7). Each server's local registry is its
  own source of truth; we don't have a quorum scheme to merge writes.
  v0.10.0 stays read-only at the peer layer.

- **Q: How do peers authenticate?  
  **A: Same as ADR-0022 — assumed pre-shared BasicAuth. We piggyback
  on `VCM_AUTH_USER/PASS` to build outbound Authorization headers.
  No new auth scheme.

### 后果

#### 正面
- Dashboard shows a unified marketplace across all peers.
- Operators can discover skills from teammates without leaving vcm.
- 0 new deps (reuses ADR-0022 peer registry + stdlib JSON).

#### 负面 / 风险
- Stale data: peer cache TTL-bounded. Operators see `fetched_at`.
- Conflicts (same name, both sides modified) — local wins, peer is shadowed.
  No conflict UI in v0.10.0.

### 验收

```bash
# Peer A configured to talk to peer B.
# Each publishes one skill under ~/.vcm/registry/skills/<name>/SKILL.md.
# A asks for scope=all:
curl 'http://localhost:7338/api/registry/skills?scope=all' | jq '.skills | length'
# → 2 (one from A, one from B)

curl 'http://localhost:7338/api/registry/skills?scope=all' | jq '.skills[].origin'
# → "local", "B"
```

### 不做
- ❌ Cross-server publish (write-side) — v1.0
- ❌ Conflict resolution UI — v1.0
- ❌ LAN-shared filesystem adapter (NFS / git) — v1.0+
- ❌ Skill signing / integrity verification — v1.0

## 参考
- [ADR-0008 skill marketplace](0008-skill-marketplace.md)
- [ADR-0022 peer-leaderboard-gossip](0022-peer-leaderboard-gossip.md)
- [CHARTER §6 写操作必经审批](../CHARTER.md)
