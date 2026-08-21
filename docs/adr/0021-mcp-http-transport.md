# ADR-0021 — MCP Streamable HTTP transport

**状态**: 已实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

ADR-0002 ships a vcm-server MCP bridge over **stdio** (one JSON-RPC
line per message). That's correct for local agent wiring (Claude Code,
Codex, pi — all register MCP servers as `python3 server/mcp.py`).

But stdio means **the MCP server can only run on the same host as the
agent**, and only one agent at a time can talk to it. For multi-host
deployments / shared team dashboards, we need HTTP transport.

The MCP 2.0 spec calls this "Streamable HTTP":
- `POST /mcp` → JSON-RPC request → JSON-RPC response (or 202 if no response)
- `GET /mcp` → server-initiated events via SSE
- Both share one discovery endpoint: `OPTIONS /mcp` returns headers

We implement the request side (`POST /mcp`) now and defer the
SSE notification side; v0.10.0 is purely request/response (no
server-initiated push), which covers 5/5 of our current tools.

## 决策

Add a `POST /mcp` Flask endpoint that:
1. Accepts a JSON-RPC 2.0 body (`{jsonrpc, id, method, params}`).
2. Dispatches to the same handler functions the stdio MCP uses
   (`vcm_overview`, `vcm_project`, `vcm_skill_matrix`, `vcm_attention`,
    `vcm_health`).
3. Returns a JSON-RPC 2.0 response: `{jsonrpc: "2.0", id, result}` or
   `{jsonrpc: "2.0", id, error: {code, message}}`.
4. Requires no scope (read-only by design — ADR-0002 keeps MCP
   read-only). Optionally gated by `VCM_AUTH_USER/PASS` for shared
   dashboards (ADR-0004).

We do NOT ship:
- WebSocket transport (more deps, more surface to test)
- GET /mcp SSE notifications (out of scope for v0.10.0)
- Streamable batching / resumability (premature for read-only use)

### Wire format

```
POST /mcp
Content-Type: application/json
Authorization: Bearer <token>     (optional)

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"claude-code","version":"x"}}}

→ {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"vcm-server","version":"0.10.0"}}}
```

Then:
```
POST /mcp
{"jsonrpc":"2.0","id":2,"method":"tools/list"}

→ {"jsonrpc":"2.0","id":2,"result":{"tools":[{...5 tool schemas...}]}}
```

Then:
```
POST /mcp
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"vcm_overview","arguments":{}}}

→ {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{...json...}"}]}}
```

This matches the official MCP 2.0 Streamable HTTP transport spec
subset that the 5 read-only tools need.

## 反对意见

- **Q: Why not WebSocket too?  
  **A: WS requires a server (`websockets` lib or hand-rolled frame
  parser). Stdlib alone can do it but it's brittle and adds 200 LOC
  for no current consumer. We can ship WS in v0.11 if a real client
  needs it.

- **Q: Why no GET /mcp (SSE notifications)?  
  **A: None of our tools emit server-initiated events (they're all
  request/response). HTTP polling covers all current consumers.
  Adding SSE is a 50 LOC change if/when needed.

- **Q: How does this interact with existing /mcp path?  
  **A: There is no existing /mcp path. We're adding it now.

### 后果

#### 正面
- Teams can share one vcm-server across multiple agents (HTTP
  works over the network).
- Reuses the same 5 tool handlers — no duplication of logic.
- Same auth model as /api/* (BasicAuth + tokens via ADR-0004/0014).

#### 负面 / 风险
- HTTP request/response is the only mode; users wanting low-latency
  push will need future work.
- No SSE means clients must poll — but every current client is
  a one-shot LLM tool call anyway, so this is fine.

### 验收

```bash
# Initialize
curl -X POST http://localhost:7338/mcp -d '{
  "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}
}'
# → {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"vcm-server","version":"0.10.0"},...}}

# List tools
curl -X POST http://localhost:7338/mcp -d '{
  "jsonrpc":"2.0","id":2,"method":"tools/list","params":{}
}'

# Call a tool
curl -X POST http://localhost:7338/mcp -d '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"vcm_health","arguments":{}}
}'
```

### 不做
- ❌ GET /mcp (SSE)
- ❌ WebSocket transport
- ❌ Streamable resumption (`Last-Event-ID`)
- ❌ Auth scope ladder for /mcp (read-only by design — ADR-0002)

## 参考
- [ADR-0002 mcp server](0002-mcp-server.md)
- [ADR-0004 basicauth](0004-basicauth.md)
- [MCP 2.0 Transport spec](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports)
