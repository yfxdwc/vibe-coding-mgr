"""
vcm-server — minimal Flask server for cross-project dashboard.
Run: python3 server/app.py
"""
import json
import sqlite3
import os
import hmac
import base64
import binascii
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, render_template, abort, Response
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dashboard import (
    get_overview, get_skill_matrix, get_attention,
    get_recent_activity, get_skill_aging, get_attention_summary,
    get_project_detail,
)

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("VCM_SERVER_DB", str(ROOT / "server" / "vcm.db")))
TEMPLATES_DIR = ROOT / "server" / "templates"
STATIC_DIR = ROOT / "server" / "static"

# --- Optional BasicAuth (ADR-0004) ---------------------------------------
# Both unset → no auth (v0.3.0 backward-compat).
# Both set  → all /api/* routes require `Authorization: Basic …`.
AUTH_USER = os.environ.get("VCM_AUTH_USER")
AUTH_PASS = os.environ.get("VCM_AUTH_PASS")
if (AUTH_USER and not AUTH_PASS) or (AUTH_PASS and not AUTH_USER):
    raise SystemExit("VCM_AUTH_USER and VCM_AUTH_PASS must be set together (or both unset)")
AUTH_ENABLED = bool(AUTH_USER and AUTH_PASS)


def _check_basic_auth():
    """Return (ok, error_response_or_None). Reads Authorization header."""
    if not AUTH_ENABLED:
        return True, None
    header = request.headers.get("Authorization", "")
    if not header.startswith("Basic "):
        return False, (jsonify({"error": "auth required"}), 401,
                       {"WWW-Authenticate": 'Basic realm="vcm-server"'})
    try:
        raw = base64.b64decode(header[6:].strip(), validate=True)
        decoded = raw.decode("utf-8", errors="replace")
        if ":" not in decoded:
            raise ValueError
        u, p = decoded.split(":", 1)
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False, (jsonify({"error": "malformed Authorization header"}), 400,
                       {"WWW-Authenticate": 'Basic realm="vcm-server"'})
    # Constant-time compare (prevents timing-based username enumeration)
    if hmac.compare_digest(u, AUTH_USER or "") and hmac.compare_digest(p, AUTH_PASS or ""):
        return True, None
    return False, (jsonify({"error": "invalid credentials"}), 401,
                   {"WWW-Authenticate": 'Basic realm="vcm-server"'})


app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
)


# --- BasicAuth (ADR-0004) -------------------------------------------------
@app.before_request
def _enforce_auth():
    """Apply BasicAuth only to /api/* (dashboard HTML stays public-readable).

    Rationale: dashboard pages are themselves vcm-server\'s \"own state\";
    protecting them would mean the user can\'t see the warning that
    auth is enabled. /static/* is also public.
    """
    if not request.path.startswith("/api/"):
        return None
    if request.path == "/api/health":  # health check is intentionally public
        return None
    ok, err = _check_basic_auth()
    if not ok:
        body, status, headers = err
        resp = Response(body.get_data(), status=status, mimetype="application/json")
        for k, v in headers.items():
            resp.headers[k] = v
        return resp
    return None


# Initialize DB schema at startup (idempotent)
with app.app_context():
    pass  # placeholder; init_db() called below


def get_db():
    """Get or create the SQLite database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            path TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            schema_version TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            vcm_version TEXT,
            raw_json TEXT NOT NULL,
            received_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE INDEX IF NOT EXISTS idx_states_project ON states(project_id, received_at DESC);
    """)
    conn.commit()
    conn.close()


@app.route("/api/health")
def health():
    # Read version from package.json (single source of truth)
    try:
        with open(ROOT / "package.json") as f:
            pkg = json.load(f)
        version = pkg.get("version", "0.2.0")
    except Exception:
        version = "0.2.0"
    return jsonify({
        "status": "healthy",
        "service": "vcm-server",
        "version": version,
        "db": "ok" if DB_PATH.exists() else "initializing",
        "auth_required": AUTH_ENABLED,  # ADR-0004: UI shows "lock" badge
    })


@app.route("/api/collect", methods=["POST"])
def collect():
    """Receive a project state push from `vcm push`."""
    try:
        state = request.get_json(force=True)
        if not state or "project" not in state:
            return jsonify({"error": "invalid state"}), 400

        project_name = state["project"]["name"]
        project_path = state["project"]["path"]
        now = datetime.utcnow().isoformat() + "Z"

        conn = get_db()
        # Upsert project
        existing = conn.execute(
            "SELECT id FROM projects WHERE name = ?", (project_name,)
        ).fetchone()
        if existing:
            project_id = existing["id"]
            conn.execute(
                "UPDATE projects SET path = ?, last_seen_at = ? WHERE id = ?",
                (project_path, now, project_id),
            )
        else:
            cursor = conn.execute(
                "INSERT INTO projects (name, path, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
                (project_name, project_path, now, now),
            )
            project_id = cursor.lastrowid

        # Insert state
        conn.execute(
            """INSERT INTO states
               (project_id, schema_version, generated_at, vcm_version, raw_json, received_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                project_id,
                state.get("schema_version", "unknown"),
                state.get("generated_at", now),
                state.get("vcm_version"),
                json.dumps(state),
                now,
            ),
        )
        conn.commit()

        # Get latest summary
        summary = {
            "project_id": project_id,
            "project_name": project_name,
            "received_at": now,
            "governance": state.get("governance", {}),
            "health": state.get("health", {}),
            "git": state.get("git", {}),
        }
        conn.close()
        return jsonify(summary), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects")
def list_projects():
    """List all registered projects with their latest state summary."""
    conn = get_db()
    # Get latest state per project
    rows = conn.execute("""
        SELECT
            p.id, p.name, p.path, p.first_seen_at, p.last_seen_at,
            s.raw_json, s.received_at
        FROM projects p
        LEFT JOIN states s ON s.id = (
            SELECT id FROM states WHERE project_id = p.id ORDER BY received_at DESC LIMIT 1
        )
        ORDER BY p.last_seen_at DESC
    """).fetchall()
    conn.close()
    # Parse raw_json to extract summary fields
    result = []
    for row in rows:
        d = dict(row)
        if d.get("raw_json"):
            try:
                state = json.loads(d["raw_json"])
                gov = state.get("governance", {})
                git = state.get("git", {})
                d["governance_agents_md_present"] = gov.get("agents_md_present")
                d["governance_charter_md_present"] = gov.get("charter_md_present")
                d["governance_skills_count"] = gov.get("skills_count")
                d["governance_adrs_count"] = gov.get("adrs_count")
                d["governance_tds_count"] = gov.get("tds_count")
                d["governance_post_mortems_count"] = gov.get("post_mortems_count")
                d["git_branch"] = git.get("branch")
                d["git_dirty"] = git.get("dirty")
            except Exception:
                pass
        d.pop("raw_json", None)
        result.append(d)
    return jsonify(result)


@app.route("/api/projects/<name>")
def project_detail(name):
    """Get latest state for a specific project."""
    conn = get_db()
    project = conn.execute(
        "SELECT id, name, path, first_seen_at, last_seen_at FROM projects WHERE name = ?",
        (name,),
    ).fetchone()
    if not project:
        conn.close()
        abort(404)
    state = conn.execute("""
        SELECT * FROM states WHERE project_id = ? ORDER BY received_at DESC LIMIT 1
    """, (project["id"],)).fetchone()
    conn.close()
    result = dict(project)
    if state:
        result["state"] = json.loads(state["raw_json"])
    return jsonify(result)


@app.route("/api/dashboard/overview")
def api_dashboard_overview():
    return jsonify(get_overview())


@app.route("/api/dashboard/skill-matrix")
def api_dashboard_skill_matrix():
    return jsonify(get_skill_matrix())


@app.route("/api/dashboard/attention")
def api_dashboard_attention():
    return jsonify(get_attention())


@app.route("/api/dashboard/activity")
def api_dashboard_activity():
    return jsonify(get_recent_activity())


@app.route("/api/dashboard/skill-aging")
def api_dashboard_skill_aging():
    return jsonify(get_skill_aging())


@app.route("/api/dashboard/summary")
def api_dashboard_summary():
    return jsonify(get_attention_summary())


@app.route("/api/project/<name>/full")
def api_project_full(name):
    data = get_project_detail(name)
    if data is None:
        abort(404)
    return jsonify(data)


def _render(template_name, **kwargs):
    """Wrap render_template to inject auth_required context (ADR-0004)."""
    ctx = {"auth_required": AUTH_ENABLED}
    ctx.update(kwargs)
    return render_template(template_name, **ctx)


@app.route("/")
def dashboard():
    """Multi-project dashboard."""
    return _render("dashboard.html")


@app.route("/projects/<name>")
def project_view(name):
    """Single-project detail view."""
    return _render("project.html", project_name=name)


@app.route("/skills")
def skills_view():
    """Cross-project skill registry index."""
    return _render("skills.html")


@app.route("/peers")
def peers_view():
    """Cross-project OSS attention (peer-config driven)."""
    return _render("peers.html")


@app.route("/settings")
def settings_view():
    """Server meta + live health view."""
    return _render("settings.html")


@app.route("/api/peers")
def api_peers():
    """Read peer list from ~/.vcm/peers.yaml if present (best-effort).

    v0.3.0: server does not own peers storage — clients push via `vcm peers`.
    The endpoint is here so the UI has a single source of truth; if the file
    is missing we return an empty list, and the UI shows the empty-state CTA.
    """
    import os
    try:
        import yaml  # PyYAML; already in transitive deps via Flask ecosystem
        path = Path(os.environ.get("VCM_PEERS_CONFIG", str(Path.home() / ".vcm" / "peers.yaml")))
        if not path.exists():
            return jsonify({"peers": [], "note": "no ~/.vcm/peers.yaml found"}), 200
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        peers = data.get("peers", []) if isinstance(data, dict) else data
        return jsonify({"peers": peers, "note": ""})
    except ImportError:
        return jsonify({"peers": [], "note": "PyYAML not installed; run pip install pyyaml"}), 200
    except Exception as e:
        return jsonify({"peers": [], "note": f"error: {e}"}), 200


@app.route("/docs/<path:filename>")
def docs_view(filename):
    """Serve any /docs/*.md (or .md inside docs/adr/, docs/adr/0001-*, etc.)
    with a thin HTML wrapper using only the standard library.

    Zero-dependency implementation: markdown stays as text inside <pre>;
    users copy-paste it into their editor, or read it raw. This avoids
    adding markdown libs (mistune, markdown-it) to requirements.txt.

    Safety: `filename` is constrained to live under ROOT/docs/. Path
    traversal (`../etc/passwd`) is rejected at `target.relative_to()`.
    """
    from flask import Response
    import html as html_stdlib
    md_root = ROOT / "docs"
    target = (md_root / filename).resolve()
    try:
        target.relative_to(md_root.resolve())
    except ValueError:
        abort(404)
    if not target.exists() or not target.is_file():
        abort(404)
    body = target.read_text(encoding="utf-8")
    escaped = html_stdlib.escape(body)
    title = target.stem
    rel = str(filename)
    html = (
        f'<!DOCTYPE html><html lang="en" data-theme="dark"><head>'
        f'<meta charset="UTF-8"><title>vcm-server · {title}</title>'
        f'<link rel="stylesheet" href="/static/css/dashboard.css">'
        f'</head><body><main class="shell">'
        f'<header class="page-head"><div class="crumbs">'
        f'<a href="/settings">settings</a><span class="sep">/</span>'
        f'<span class="crumb-current">{title}</span></div>'
        f'<h1 class="text-display">{title}</h1>'
        f'<p class="text-meta">docs/{rel}</p></header>'
        f'<div class="c-card"><pre style="white-space: pre-wrap;">{escaped}</pre></div>'
        f'<a href="/settings" class="btn btn--ghost">← back to settings</a>'
        f'</main></body></html>'
    )
    return Response(html, mimetype="text/html")



@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "not found"}), 404


# Initialize DB at import time so test_client and CLI both work
init_db()


def main():
    init_db()
    port = int(os.environ.get("VCM_SERVER_PORT", 7338))
    host = os.environ.get("VCM_SERVER_HOST", "127.0.0.1")
    print(f"vcm-server starting on http://{host}:{port}")
    print(f"  Dashboard: http://{host}:{port}/")
    print(f"  API:       http://{host}:{port}/api/health")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
