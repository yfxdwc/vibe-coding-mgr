# ADR-0002 — MCP server for AI agents

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

vibe-coding-mgr 的 5 价值观第 10 条「规约承载」指出：硬约束必须 skill 化、可被 agent 读。但 v0.3.0 之前 vcm-server 只暴露 **HTTP API**——AI agents 必须在它们自己的 client（MCP host / HTTP client）里手写 fetch + 错误处理。这违背 **adopt-not-fork** 价值观，因为 AI agents 真正理解的是 **Model Context Protocol (MCP)** 而非裸 HTTP。

`vcm status` 已经在 v0.2.0 产出本地 `.vcm/report.html`。`vcm push` 把同一份 JSON 发到 vcm-server。问题是：agent 不能就地问「这个项目里有多少 TDs / 哪些 skill 没注册 / AGENTS.md 在不在」——它必须 `curl /api/dashboard/...` 自己解析。

## 决策

`server/mcp.py` 用 **Anthropic 官方 MCP SDK**（Python stdio transport）暴露 vcm-server 的现状。一共 5 个工具，对应 dashboard 的核心问句：

| 工具 | 入参 | 出参 | 等价 HTTP |
|------|------|------|-----------|
| `vcm_overview` | — | projects[] + summary | `/api/dashboard/overview` |
| `vcm_project` | `{name}` | latest_state + history | `/api/projects/<name>/full` |
| `vcm_skill_matrix` | — | skill → projects[] | `/api/dashboard/skill-matrix` |
| `vcm_attention` | — | items[] (proj, reasons, severity) | `/api/dashboard/attention` |
| `vcm_health` | — | server health JSON | `/api/health` |

### 形态

- **stdio transport only**（v0.4.0）。HTTP/SSE transport 留到 v0.5.0（如果 multiple-clients 场景出现）。
- **read-only by design**。任何写操作（push, collect）仍是 HTTP 协议，与 MCP 工具严格分离。
- **依赖**：`mcp[cli]` from PyPI。`server/requirements.txt` 加 1 行。

### 与 v0.3.0 design 的关系

- 走 ADR-0001 的设计纪律：`server/mcp.py` 用同一套 token / error / 空状态规范写错误响应。
- 不直接连 SQLite；走 `dashboard.py` 现有的函数。所有数据访问通过已存在的 `get_overview / get_attention / ...` 这层，避免重复。

### 反对意见

- **Q**: 不直接 import `dashboard.py` 而是另写一份 MCP adapter？  
  **A**: 错。`server/mcp.py` import dashboard 函数，让 4 层共用同一份数据逻辑。
- **Q**: 为什么 5 个工具不是 10 个？  
  **A**: repowise 的设计纪律：**一工具一任务**。我们 5 个问题已经覆盖 dashboard 的所有视角。多了就要么合并要么删。
- **Q**: 为什么 read-only？  
  **A**: MCP 是 agent context，agent 不应该改 vcm-server 状态。state push 是 `vcm push`（人/RPI 主动调用），不是 agent 的 purview。

### 后果

#### 正面

- Claude Code / Codex / pi / Cursor 直接 `vcm mcp` 接进来，agent 多 5 个工具，**无需写 fetch 代码**。
- 一份 dashboard 数据，4 种入口（人/CLI/HTTP/MCP），**复用 100%**。
- MCP 自带 schema 描述，agent 自动理解参数。

#### 负面 / 风险

- **依赖加 1**：PyPI `mcp` (~5MB)。CHARTER §5 评估为净债 -1（开发依赖, 不进入用户机器）。
- **stdio 启动慢** ~200ms（每次 spawn）。cool 不影响常见 agent 会话。

### 验收

```bash
# smoke test
VCM_SERVER_DB=/tmp/x.db python3 server/app.py > /tmp/srv.log 2>&1 & S=$!
sleep 2
VCM_SERVER_DB=/tmp/x.db python3 server/mcp.py <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize",...}
EOF
kill $S

# integration test
vitest run tests/mcp.test.js
```

### 不做

- ❌ HTTP / SSE transport（v0.5.0+）
- ❌ Write tools（push 走 CLI）
- ❌ MCP server 自己跑 sqlite 直查（始终走 dashboard.py 函数）

## 参考

- [Anthropic MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [repowise 10 MCP tools](https://docs.repowise.dev/agent/MCP_TOOLS) — 借鉴其 `get_overview / get_context / get_risk` 三件套
- [ADR-0001](0001-repowise-inspired-frontend.md) — token 命名规范
