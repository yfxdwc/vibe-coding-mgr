---
name: mcp-transport
description: "修改 server/mcp_server.py 的 tool 注册、transport 选择 (stdio vs HTTP vs SSE) 或 /mcp 路由的认证 scope 前必读 — 含 5 个 read-only tool 列表、HTTP Bearer + scope 双校验、SSE 事件类型清单 4 条硬约束。"
authority: canonical
canonical_ref: ../../adr/0021-mcp-http-transport.md
tags: [mcp, transport, http, sse, tool, auth]
---

# MCP Transport (vcm 的 Model Context Protocol 接入)

> **When to read**: 改 MCP server (stdio / HTTP / SSE 任一 transport) / 加 tool / 调认证 scope 时必读。
> **Authority**: [`ADR-0021`](../../adr/0021-mcp-http-transport.md)

## 1. 范围

- `server/mcp_server.py` — 5 个 read-only tool (v0.4.0 起): `list_projects` / `get_state` / `list_skills` / `get_drift` / `search_docs`
- Transport 三态:
  - **stdio** (`python3 -m server.mcp_server`) — Claude Code / Codex 本地
  - **HTTP** (`POST /mcp`) — 跨进程 / 远端调用, Bearer token + scope 双校验
  - **SSE** (`GET /mcp/sse`) — 实时事件流 (5 类: `state_pushed` / `audit_event` / `drift_changed` / `skill_registered` / `peer_announce`)
- 认证 scope: `read` (默认) / `write` (push state) / `admin` (purge) — 见 ADR-0014

## 2. 硬约束

- ❌ **不要新增 write-side MCP tool** — v0.16.0 之前 MCP 仅 read-only, write 必须走 REST + ACL (CHARTER §8)
- ❌ **不要让 HTTP transport 绕过 `read` scope** — `@require_scope('read')` 必须挂在 `/mcp` 上
- ❌ **不要在 tool handler 里捕获 `Exception` 后返回空 list** — 必须 raise 让 MCP 客户端看到错误
- ❌ **不要在 SSE 事件里发原始 SQL 行** — 必须 JSON-serialized dict, 避免 schema 泄漏
- ✅ stdio 模式的 tool 描述必须短 (< 60 字符) — Claude Code 的 token budget 紧
- ✅ HTTP transport 的 `tools/list` 响应必须与 stdio 完全一致 — 客户端无差别切换

## 3. 反模式

- 把 `vcm push state` 也通过 MCP HTTP 暴露 — 绕开 audit log
- MCP HTTP 用 cookie 鉴权 — Claude Code / pi 客户端没有 cookie jar, 强制 Bearer
- SSE 心跳用 `data: ping\n\n` 而不带 event type — 前端无法区分心跳 / 业务事件
- 在 MCP tool 里调 `subprocess.run(['vcm', ...])` — 应该直接调 Python 函数, 避免 fork
- tool 描述里出现 "通用 / 全部 / 所有" — 违反 skill-authoring §3, 应拆细或放弃

## 4. 验收

```bash
# 1. stdio 模式 (本地)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  python3 -m server.mcp_server | jq '.result.tools | length'
# 期望: 5

# 2. HTTP 模式
curl -s -X POST http://127.0.0.1:$VCM_PORT/mcp \
  -H "Authorization: Bearer $VCM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
# 期望: 5 (HTTP 与 stdio 一致)

# 3. scope 校验
curl -s -X POST http://127.0.0.1:$VCM_PORT/mcp \
  -H "Authorization: Bearer $VCM_TOKEN_NOSCOPE" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' -w "%{http_code}\n"
# 期望: 403

# 4. 测试
npm test -- tests/mcp.test.js tests/mcp-http.test.js tests/sse.test.js   # all passed
bash scripts/routine_coverage.sh                                          # exit 0
```

## 5. 相关文档

- [`ADR-0021`](../../adr/0021-mcp-http-transport.md) — HTTP transport 决策
- [`ADR-0014`](../adr/0014-endpoint-scopes.md) — scope 体系
- [`server/mcp_server.py`](../../server/mcp_server.py) — 5 tool + transport 实现
- `tests/mcp.test.js` / `tests/mcp-http.test.js` / `tests/sse.test.js` — 三 transport 测试
- [`server/app.py`](../../server/app.py) `/mcp` 路由定义
