# ADR-0004 — Optional BasicAuth for vcm-server

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.3.0 的 `vcm-server` 默认绑 `127.0.0.1:7338`，不在公网暴露。但当用户把它部署到团队机器 / NAS / 容器时，HTTP 裸跑 = 任何 LAN 内部的人都能 POST `/api/collect` 伪造 project state。

CHATER §8「本地优先」承诺 `vcm push` 无 server 也能跑，但没说 team-deploy 时怎么办。`/api/peers` 已经接受 `~/.vcm/peers.yaml` 路径——这是一个潜在的元数据泄漏面。

## 决策

**Optional BasicAuth** via 2 个 env var：

```bash
VCM_AUTH_USER=alice VCM_AUTH_PASS=secret python3 server/app.py
```

未设置 → 不需要 auth（保持 v0.3.0 行为，向后兼容）。
设置 → 任何 `/api/*` 调用均需要 `Authorization: Basic …` 头。`/static/*` 与 `/docs/*` 与 `/` 仍公开（dashboard 本身是 public-readable，读取自身 server 没问题；写需 auth）。

### 实现

- Flask `before_request` 钩子，对 `request.path.startswith('/api/')` 强校验。
- Constant-time compare (`hmac.compare_digest`) 防 timing attack。
- 失败返回 `401 Unauthorized` + `WWW-Authenticate: Basic realm="vcm-server"`。

### 与 v0.4.0 其他 ADRs 的关系

- MCP server (ADR-0002) 是 read-only，无密码风险。但当 v0.5.0 加 HTTP transport 时，得回头接 auth。
- Skill adapter (ADR-0003) 是 CLI side，与 server auth 无关。

### 反对意见

- **Q**: 为什么不直接用 HTTPS？  
  **A**: TLS termination 通常交给前置 nginx/traefik（这是 industry norm），vcm-server 自己不重复实现。在前置 TLS 后，BasicAuth 安全。
- **Q: 为什么不是 token-based？  
  **A**: v0.4.0 极简。token 留给 v0.5.0（OIDC，per-user ACLs）。
- **Q**: 不需要登出 / revoke 吗？  
  **A**: 不需要。BasicAuth 是 stateless，rotate password = `kill` 服务 + 改 env + 重启。简洁就是好。

### 后果

#### 正面

- 团队 LAN 部署变得安全；`vcm push -s http://host` 不需要额外保护。
- 行为 fallback 优雅：未设 env 时与 v0.3.0 完全一致。

#### 负面 / 风险

- **本地开发**：开发者误设 env var 后每次 push 都要加 `BASIC_AUTH_TOKEN` 前缀，可能忘记。文档要明确。
- **多 user**：BasicAuth 是单口令共享，不适合 >5 人团队。v0.5.0 再升级。
- **无审计日志**：401 不记日志——v0.4.0 留作 follow-up。

### 验收

```bash
# 未设 env: 不需要 auth (向后兼容)
curl -sf http://127.0.0.1:7338/api/health

# 设 env: 缺头 → 401
VCM_AUTH_USER=alice VCM_AUTH_PASS=secret python3 server/app.py &
curl -sw "%{http_code}\n" http://127.0.0.1:7338/api/health

# 设 env: 正确 Basic 头 → 200
curl -u alice:secret -sf http://127.0.0.1:7338/api/health
```

### 不做

- ❌ User database / 多角色
- ❌ HTTPS 终结
- ❌ Token refresh / OAuth
- ❌ Audit log（follow-up，不在本 ADR scope）

## 参考

- [Flask Basic Auth pattern](https://flask.palletsprojects.com/en/3.0.x/patterns/viewdecorators/)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [CHARTER §6 §8](../CHARTER.md) — 数据审批 + 本地优先
