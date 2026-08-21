# ADR-0014 — Per-endpoint scope enforcement (close ADR-0011 debt)

**状态**: 待实施（v0.7.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

ADR-0011 引入了 `scope` 字段（`read` / `push` / `admin`），
但 v0.6.0 实现只做了 **认证**（401 vs 200），**没做授权**。
结果：每个有效 token 都能调 `/api/collect`、`/api/audit/purge`、
未来的 `/api/registry/publish` 等写端点。

这是 **planning-implementation gap**——ADR 说了一个能力，
代码没实现。这正好是 CHARTER §9「设计纪律 / 文档与代码同步」想
阻止的反模式。

`users_cli.py token grant` 接受 `--scope read|push|admin`，
但产生的 token 在 server 侧没有任何差分效果。

## 决策

新增 `@require_scope('read'|'push'|'admin')` Flask 装饰器，
挂在每条路由上：

| Path prefix | Required scope |
|---|---|
| `/api/health`           | (public) |
| `/api/dashboard/*` (GET) | `read` (default for any auth user) |
| `/api/audit` (GET)       | `read` |
| `/api/registry/skills` (GET, list/discover) | `read` |
| `/api/registry/skills/<name>` (GET) | `read` |
| `/api/collect` (POST)   | `push` |
| `/api/registry/publish` (POST, **v0.7.1**) | `push` |
| `/api/users` (write, admin-only) | `admin` |
| `/api/audit/purge`      | `admin` (**v0.7.1**) |

### Token 字段传递

`_check_basic_auth` 已经隐式持有 `(scope, user_id)` — 现在显式
存进 `flask.g`，装饰器从这里读取：

```python
@app.post("/api/collect")
@require_scope("push")
def collect():
    ...
```

Token 的 `scope` 不必等于用户的 `scope`：可以给一个 admin 用户
发一个 read-only CI token（`vcm token grant admin --scope read --label ci`）。
这就是 **delegation**。

### 反对意见

- **Q: 这是过度工程吗?  
  **A: 50 行装饰器 + 5 分钟测试。但关闭的是一个 *真实* 的写权限泄漏。
- **Q: 不用 scope 行不行?  
  **A: 不能。所有 read scope token 都不应该能 push state。
- **Q: 为什么不是 per-user 权限?  
  **A: per-token scope 已经是 per-user 的扩展。单个 token 可与用户
  scope 不同，达到细粒度 delegation。

### 后果

#### 正面

- 关闭 v0.6.0 写权限泄漏
- CI 可以安全地拿到 `read` token,生产 token 用 `push`
- 审计日志可以记 `403 forbidden` (scope insufficient)，便于查
  误配

#### 负面 / 风险

- 新增 `g.scope` 状态（5 行装饰器）
- 现有 177 个测试不受影响（v0.6.0 没有 read token 用例）

### 验收

```bash
# 给 alice 发 read scope token
TOK=$(vcm token grant alice --scope read --label ci)
curl -H "Authorization: Bearer $TOK" /api/dashboard/summary  # 200
curl -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
     -d '{...}' /api/collect  # 403 + audit event "scope_forbidden"
```

### 不做

- ❌ Per-resource ACL（v0.8.0）
- ❌ Time-bounded scopes（v0.7.1 token 已有 expires_at 路径）
- ❌ Audit-purge 端点（v0.7.1 落地）
- ❌ OAuth scopes / industry-standard claims

## 参考

- [ADR-0011](0011-per-user-acl.md) — predecessor (introduced scope field)
- [OAuth 2.0 Scopes (RFC 6749 §3.3)](https://datatracker.ietf.org/doc/html/rfc6749#section-3.3)
- [CHARTER §6](../CHARTER.md) — 写操作必经审批
