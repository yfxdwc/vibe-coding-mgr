"""
server/mcp.py — MCP server for vcm-server (ADR-0002).

Exposes vcm-server's aggregated state to any MCP-speaking agent (Claude Code,
Codex, pi, Cursor). 5 read-only tools, stdio transport.

Tools (one-task-per-tool, mirroring dashboard's "Answers:" discipline):
  vcm_overview            — projects + summary
  vcm_project             — single project detail + history
  vcm_skill_matrix        — skill → projects mapping
  vcm_attention           — items needing attention
  vcm_health              — server liveness

Run via stdio:
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}' \\
    | python3 server/mcp.py

CLI registration (for Claude Code et al.):
  command: python3
  args:    ["-m", "server.mcp"]    (cwd = repo root)
  OR       ["server/mcp.py"]       (cwd = repo root)

Why "read-only by design":
  - MCP is agent context — agents shouldn't mutate dashboard state.
  - Push goes through `vcm push` (human/RPI explicit, audit-able).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# Ensure we can import dashboard.py sibling
sys.path.insert(0, str(Path(__file__).resolve().parent))

import dashboard  # noqa: E402

# IMPORTANT: import app LAST so it can attach its `app` Flask instance
# without colliding with our `app` Server constant above.
from app import init_db, app as flask_app  # noqa: E402
init_db()  # idempotent; ensures tables exist before MCP handlers run

from mcp.server import Server  # noqa: E402
from mcp.server.stdio import stdio_server  # noqa: E402
from mcp.types import TextContent, Tool  # noqa: E402


app = Server("vcm-server")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="vcm_overview",
            description="All registered projects with summary KPIs. Read-only.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
        Tool(
            name="vcm_project",
            description="Single-project detail (latest state + last 10 pushes). Read-only.",
            inputSchema={
                "type": "object",
                "required": ["name"],
                "properties": {"name": {"type": "string", "description": "Project slug"}},
                "additionalProperties": False,
            },
        ),
        Tool(
            name="vcm_skill_matrix",
            description="Skill -> projects (sorted by reach). Read-only.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
        Tool(
            name="vcm_attention",
            description="Projects needing attention. Read-only.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
        Tool(
            name="vcm_health",
            description="Server liveness. Read-only.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        if name == "vcm_overview":
            payload = {
                "summary": dashboard.get_attention_summary(),
                "projects": dashboard.get_overview(),
            }
        elif name == "vcm_project":
            proj_name = (arguments or {}).get("name")
            if not proj_name:
                return [TextContent(type="text",
                                    text=json.dumps({"error": "missing 'name'"}))]
            data = dashboard.get_project_detail(proj_name)
            if data is None:
                return [TextContent(type="text",
                                    text=json.dumps({"error": "project not found"}))]
            payload = data
        elif name == "vcm_skill_matrix":
            payload = dashboard.get_skill_matrix()
        elif name == "vcm_attention":
            payload = dashboard.get_attention()
        elif name == "vcm_health":
            payload = {"status": "ok", "service": "vcm-server"}
        else:
            return [TextContent(type="text",
                                text=json.dumps({"error": f"unknown tool: {name}"}))]
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e)}))]
    return [TextContent(type="text",
                        text=json.dumps(payload, indent=2, default=str))]


async def main():
    """Run the MCP server over stdio (the canonical MCP transport)."""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
