# ADR-0009 — Audit log for vcm-server

**状态**: 待实施（v0.5.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

ADR-0004（BasicAuth）解决了"谁能调 API"，但**没说调了什么**。CHARTER §6「数据是事实，写操作必经审批」——审批必须可追溯。当前所有 401 / POST /api/collect 成功 / 失败都静默丢在日志；想要审计只能 grep Flask `[server]` 行。

团队部署场景下，这等于**裸奔**：
- 谁 / 何时 push 了 state？
- 401 是哪来的（攻击 vs 配置错）？
- 谁 / 何时 retire 了哪个 skill？

## 决策

把以下事件写进 **JSONL audit log**（每行一个 JSON 对象），按 append-only 防篡改：

### 写什么

| event_type | 触发条件 | 字段 |
|---|---|---|
| `auth_failure` | 401（任意路径 + 任一理由） | ts, path, method, reason (basic_missing/wrong/malformed) |
| `state_pushed` | POST /api/collect 成功 | ts, project_name, vcm_version, schema_version, source_ip |
| `state_rejected` | POST /api/collect 失败 4xx | ts, project_name, reason |
| `registry_publish` | POST /api/registry/publish | ts, skill_name, user |
| `registry_unpublish` | POST /api/registry/unpublish | ts, skill_name, user |

### 落地

- 默认路径：`$VCM_AUDIT_LOG` 或 `~/.vcm/audit.log`
- 单进程：flask append 写
- 避免 lock contention：`os.open(..., O_APPEND)` + `flock()` per-write
- 失败 handled silently: 审计 log 写失败 → write to stderr；不中断业务请求

### 查询端点

```bash
GET /api/audit?since=2026-08-01&limit=200&event=auth_failure
```

返回 JSON `{"events": [...]}`, 按时间倒序；limit 默认 100，最多 5000。

### View

`/audit` 视图：filter 栏（event_type + since）+ table，DESIGN.md §4 的 `data-table` + `badge` 全套。

### 与已有 ADR 的关系

- **ADR-0004**: auth_failure 事件直接由此产生。401 不再静默。
- **CHARTER §6**: 这是审批可追溯的硬约束，CI 应保证 audit endpoint 在 BasicAuth 模式下也存在。
- **CHARTER §9**: 新增 endpoint → 改 `docs/ARCHITECTURE.md` / `docs/OPENBOARDING.md` / 加 endpoint list。

### 反对意见

- **Q: 用 syslog 不行吗?  
  **A: 不行。syslog 跟其它噪音混，**审计必须是结构化的 JSONL**——grep / jq 可直接查。
- **Q: 不存 DB?  
  **A: v0.5.0 不存 DB（DB schema 加表是大改动）。JSONL 文件已足够审阅 + Bash 脚本聚合。v0.6.0 升级到 SQLite 表。
- **Q: 不加密?  
  **A: 暂不加密。基于 LOCAL assumption（CHARTER §8）。如果部署到 LAN，靠外部 TLS + filesystem ACL。v0.7.0 引入加密。

### 后果

#### 正面

- 401 攻击可检测（IP 频次统计）
- 误操作可回溯
- 满足 CHARTER §6 的审批可追溯性

#### 负面 / 风险

- 性能：每次写都 flock。**测试测一下**：1k events ≈ 50ms 总开销，可接受。
- 磁盘：1k events ≈ 200KB JSONL。100k events ≈ 20MB。Auto-rotate 在 v0.6.0。
- 隐私：JSONL 含 IP — 不能 OPEN 公开。设置 600 mode (owner-only) 默认。

### 验收

```bash
# fail auth → log
curl -sf http://127.0.0.1:7338/api/projects
cat ~/.vcm/audit.log | head | jq 'select(.event_type=="auth_failure")'

# success collect → log
curl -X POST /api/collect ... && cat ~/.vcm/audit.log | jq 'select(.event_type=="state_pushed")'

# view via dashboard
open http://127.0.0.1:7338/audit
```

### 不做

- ❌ Tamper-evident 签名 (v0.7.0)
- ❌ UI filtering by IP / user agent (v0.6.0)
- ❌ Auto-rotate / archive
- ❌ 加密 / 签名

## 参考

- [OWASP Audit Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [CHARTER §6](../CHARTER.md)
- [ADR-0004](0004-basicauth.md)
