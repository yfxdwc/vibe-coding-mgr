# ADR-0011 — Per-user ACL (replace single-password BasicAuth)

**状态**: 待实施（v0.6.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

ADR-0004 的 BasicAuth 是**单口令全局共享**——任何拿到密码的客户端都拥有**完全相同权限**。
CHARTER 第 2 条「架构边界」第 5 类 domain（standards）应该用「最小特权」原则。
现实场景：
- Alice 想 push state，她和 Bob 都用一个通用 `vcm` 密码。**审计日志看不出谁做的。**
- 离开团队的人带走密码。没法单独 revoke。
- 5 人团队共享一个 README 里的密码——典型反模式。

## 决策

把 BasicAuth 拆成 **users + tokens** 两层：

```
users (table)
  id            INTEGER PK
  username      TEXT UNIQUE
  password_hash TEXT        # bcrypt cost=12
  scope         TEXT default 'push'   # 'read' | 'push' | 'admin'
  created_at    TEXT
  last_seen_at  TEXT NULL

tokens (table)
  id          INTEGER PK
  user_id     INTEGER FK → users.id
  token_hash  TEXT UNIQUE  # sha256 of the bearer token
  label       TEXT         # e.g. "ci-runner-1"
  created_at  TEXT
  expires_at  TEXT NULL
  last_used_at TEXT NULL
```

### 启动模式

- **环境变量模式**（向后兼容 v0.4-v0.5）：
  `VCM_AUTH_USER` + `VCM_AUTH_PASS` 仍是合法。开启后**禁止**用 user table，避免双源不一致。
- **用户表模式**：用 `VCM_USERS_DB` 或 `server/users.db` 单独 SQLite。
  `VCM_USER_FILE=path/to/users.json` 用 JSON 文件起步，便于 ops drop-in。

### CLI（与 BasicAuth 互斥）

```bash
vcm user add <username>                    # prompts password
vcm user add <username> --password-stdin  # CI use
vcm user passwd <username>                 # change password
vcm user list
vcm token grant <username> --label <l> [--scopes push|admin] [--days 90]
vcm token revoke <token-id>
```

Bearer token header (RFC 6750):
```
Authorization: Bearer vcm_<base64-url of user.id>.<random 32 bytes>
```

### 路由级别 scope（最小特权）

| Path prefix | Required scope |
|---|---|
| `/api/health`     | (public) |
| `/api/audit`       | `read` |
| `/api/dashboard/*` | `read` |
| `/api/registry/*`  (公开 read) | `read` |
| `/api/collect`     | `push` |
| `/api/registry/publish` | `push` |
| `/api/dashboard/audit/purge` | `admin` (v0.7) |

### 反对意见

- **Q: 为什么不用 OIDC / OAuth？  
  **A: v0.7.0 再说。v0.6.0 解决"5 人共享密码"这个具体问题。OIDC 需要 IdP，本地优先 (CHARTER §8) 暂时不想要外部依赖。
- **Q: 为什么用 bcrypt 不是 Argon2id？  
  **A: bcrypt 在 .venv 就有（passlib）。Argon2 需要装 native lib。v0.7.0 换。
- **Q: 为什么不存明文 token？  
  **A: 已经只存 token_hash。revoke 不需要明文。

### 后果

#### 正面

- 审计日志能区分 **谁** 做的（CHARTER §6 "审批可追溯"真正落地）
- Token 可以按 label 区分（`ci-runner-1`、`alice-laptop`）
- 离队 revoke 一条 token 即可
- BasicAuth 模式仍可用，单人 v0.5 用例不变

#### 负面 / 风险

- 新增 1 表 + 5 CLI 命令，~150 LOC + ~150 LOC tests
- bcrypt cost=12 = 100ms 一次性登录，每次 token 验证 ~5ms
- 用户忘记密码 → admin 重置（admin scope）

### 验收

```bash
vcm user add alice
# prompts password twice
vcm token grant alice --label laptop --days 90
# prints: bearer vcm_<...>
curl -H "Authorization: Bearer vcm_..." http://127.0.0.1:7338/api/collect  # 200
curl -H "Authorization: Bearer vcm_..." http://127.0.0.1:7338/api/audit     # 200 (read scope)

# Revoke
vcm token revoke 1
curl -H "Authorization: Bearer vcm_..." http://127.0.0.1:7338/api/collect  # 401
```

### 不做

- ❌ OIDC / OAuth
- ❌ Argon2id（v0.7.0）
- ❌ Per-endpoint ACL（v0.7.0 引入 admin scope 后）
- ❌ Password reset email flow

## 参考

- [ADR-0004](0004-basicauth.md) — BasicAuth predecessor
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 6750 Bearer Tokens](https://datatracker.ietf.org/doc/html/rfc6750)
- [CHARTER §6](../CHARTER.md)
