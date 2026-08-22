"""
server/mcp.py — MCP server for vcm-server (ADR-0002 + ADR-0021).

Two transports:
  * stdio      — for local agent wiring (Claude Code, Codex, pi)
  * HTTP POST  — Streamable HTTP transport (MCP 2.0)
                 behind the Flask app at /mcp (ADR-0021)

Both share the same 5 read-only tools because we factor the dispatch
logic out of the mcp.server.Server decorator chain into plain functions
(`dispatch_tool`, `list_tool_schemas`).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

# Ensure we can import dashboard.py sibling
sys.path.insert(0, str(Path(__file__).resolve().parent))

import dashboard  # noqa: E402

# ADR-0002 + ADR-0021: bootstrap the schema (idempotent CREATE IF NOT
# EXISTS). We deliberately avoid importing app.py to break the circular
# import that would otherwise occur.
dashboard.init_db()

from mcp.server import Server  # noqa: E402
from mcp.server.stdio import stdio_server  # noqa: E402
from mcp.types import TextContent, Tool  # noqa: E402


# --- Tool registry (transport-neutral) ----------------------------------

SERVER_INFO = {"name": "vcm-server", "version": "0.17.0"}
PROTOCOL_VERSION = "2024-11-05"


# Each tool: (name, description, input_schema_dict, dispatch_fn)
# dispatch_fn(name, arguments_dict) -> JSON-serialisable payload (or raises)
def _tool_overview(_name, _arguments):
    return {
        "summary": dashboard.get_attention_summary(),
        "projects": dashboard.get_overview(),
    }


def _tool_project(_name, arguments):
    proj_name = (arguments or {}).get("name")
    if not proj_name:
        return {"error": "missing 'name'"}
    data = dashboard.get_project_detail(proj_name)
    if data is None:
        return {"error": "project not found"}
    return data


def _tool_skill_matrix(_name, _arguments):
    return dashboard.get_skill_matrix()


def _tool_attention(_name, _arguments):
    return dashboard.get_attention()


def _tool_health(_name, _arguments):
    return {"status": "ok", "service": "vcm-server", "version": SERVER_INFO["version"]}


TOOL_REGISTRY = {
    "vcm_overview": {
        "description": "All registered projects with summary KPIs. Read-only.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "fn": _tool_overview,
    },
    "vcm_project": {
        "description": "Single-project detail (latest state + last 10 pushes). Read-only.",
        "input_schema": {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string", "description": "Project slug"}},
            "additionalProperties": False,
        },
        "fn": _tool_project,
    },
    "vcm_skill_matrix": {
        "description": "Skill -> projects (sorted by reach). Read-only.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "fn": _tool_skill_matrix,
    },
    "vcm_attention": {
        "description": "Projects needing attention. Read-only.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "fn": _tool_attention,
    },
    "vcm_health": {
        "description": "Server liveness. Read-only.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "fn": _tool_health,
    },
}


def list_tool_schemas() -> list[dict]:
    """Return [{name, description, inputSchema}] matching mcp.types.Tool shape."""
    return [
        {"name": name, "description": meta["description"], "inputSchema": meta["input_schema"]}
        for name, meta in TOOL_REGISTRY.items()
    ]


def dispatch_tool(name: str, arguments: dict | None) -> Any:
    """Call a tool by name. Returns JSON-serialisable payload (or dict with error)."""
    meta = TOOL_REGISTRY.get(name)
    if meta is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return meta["fn"](name, arguments or {})
    except Exception as e:
        return {"error": str(e)}


# --- MCP stdio transport (ADR-0002) -------------------------------------

app = Server("vcm-server")


@app.list_tools()
async def list_tools() -> list[Tool]:
    # Mirror the TOOL_REGISTRY entries into mcp Tool objects.
    tools: list[Tool] = []
    for name, meta in TOOL_REGISTRY.items():
        tools.append(Tool(
            name=name,
            description=meta["description"],
            inputSchema=meta["input_schema"],
        ))
    return tools


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    payload = dispatch_tool(name, arguments)
    return [TextContent(type="text",
                        text=json.dumps(payload, indent=2, default=str))]


# --- HTTP transport (ADR-0021) ------------------------------------------

def handle_jsonrpc(body: dict) -> dict:
    """Apply a JSON-RPC 2.0 envelope to a request. Returns the response dict.

    Supports methods: initialize, ping, tools/list, tools/call.
    Anything else returns JSON-RPC error -32601 (Method not found).
    """
    if not isinstance(body, dict):
        return _err(None, -32700, "Parse error: expected JSON object")
    jsonrpc = body.get("jsonrpc")
    if jsonrpc != "2.0":
        return _err(body.get("id"), -32600, "Invalid Request: jsonrpc must be '2.0'")
    method = body.get("method")
    params = body.get("params") or {}
    req_id = body.get("id")

    if method == "initialize":
        return _ok(req_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
        })
    if method == "ping":
        return _ok(req_id, {})
    if method == "tools/list":
        return _ok(req_id, {"tools": list_tool_schemas()})
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not name:
            return _err(req_id, -32602, "tools/call: missing 'name'")
        if name not in TOOL_REGISTRY:
            return _err(req_id, -32602, f"tools/call: unknown tool '{name}'")
        payload = dispatch_tool(name, arguments)
        # MCP 2.0 wraps tool results in {content: [{type: "text", text: "..."}]}
        return _ok(req_id, {
            "content": [{"type": "text",
                          "text": json.dumps(payload, indent=2, default=str)}],
            "isError": "error" in payload,
        })
    if method == "notifications/initialized":
        # Notifications have no reply per JSON-RPC 2.0.
        return None
    return _err(req_id, -32601, f"Method not found: {method}")


def _ok(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _err(req_id, code, message):
    return {"jsonrpc": "2.0", "id": req_id,
            "error": {"code": code, "message": message}}


# --- main: stdio transport ----------------------------------------------

async def main():
    """Run the MCP server over stdio (the canonical MCP transport)."""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
