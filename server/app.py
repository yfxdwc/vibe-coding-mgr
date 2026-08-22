"""
vcm-server — minimal Flask server for cross-project dashboard.
Run: python3 server/app.py
"""
import json
import glob
import sqlite3
import os
import hmac
import base64
import binascii
import time
import threading
import queue
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, request, jsonify, render_template, abort, Response, stream_with_context, g

import audit  # ADR-0009
import sys, os; print("SERVER VCM_AUDIT_LOG:", os.environ.get("VCM_AUDIT_LOG"), file=sys.stderr, flush=True)
import users as users_mod  # ADR-0011
import scopes as scopes_mod  # ADR-0014
import markdown_render  # ADR-0018
from pathlib import Path as _Path
import os as _os
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dashboard import (
    get_overview, get_skill_matrix, get_attention,
    get_recent_activity, get_skill_aging, get_attention_summary,
    get_project_detail, get_leaderboard, get_trend,
    get_drift,
)
import docs_search  # ADR-0020
import mcp_server  # ADR-0021 (HTTP transport; stdio lives in mcp_server.__main__)
import peers  # ADR-0022

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
BASIC_AUTH_ENABLED = bool(AUTH_USER and AUTH_PASS)
# ADR-0011: also enable auth when a users table has at least one row.
# We compute this lazily in _check_basic_auth so test fixtures that add
# users after server startup are still respected.
if BASIC_AUTH_ENABLED and users_mod.has_any_user():
    raise SystemExit("both VCM_AUTH_USER/PASS and users table are set; pick one mode")
AUTH_ENABLED = BASIC_AUTH_ENABLED  # legacy flag; we still consult users_mod live.


def _check_basic_auth():
    """Return (ok, error_response_or_None). Reads Authorization header.

    ADR-0011 users-mode: if a users table has any rows, accept either:
      - Bearer token (preferred): 'Authorization: Bearer vcm_<uid>.<secret>'
      - HTTP Basic: 'Authorization: Basic <b64(user:pass)>'
    """
    if not AUTH_ENABLED and not users_mod.has_any_user():
        return None
    # Live recheck: users table may have been populated since startup.
    header = request.headers.get("Authorization", "")
    if not header:
        return False, (jsonify({"error": "auth required"}), 401,
                       {"WWW-Authenticate": 'Basic realm="vcm-server", Bearer'})
    # Try Bearer first (preferred path)
    if header.startswith("Bearer "):
        raw = header[7:].strip()
        # If users-mode is on, look up token
        if users_mod.has_any_user():
            res = users_mod.verify_token(raw)
            if res:
                # ADR-0014: stash scope + user_id in flask.g for
                # @require_scope decorators downstream.
                scope, user_id, label = res
                g.user_scope = scope
                g.user_id = user_id
                g.token_label = label
                # ADR-0014: stash scope + user_id in flask.g for
                return None
        # Otherwise silently fall through to next check
        return False, (jsonify({"error": "invalid bearer token"}), 401,
                       {"WWW-Authenticate": 'Bearer realm="vcm-server"'})
    elif header.startswith("Basic "):
        try:
            raw = base64.b64decode(header[6:].strip(), validate=True)
            decoded = raw.decode("utf-8", errors="replace")
            if ":" not in decoded:
                raise ValueError
            u, p = decoded.split(":", 1)
        except (binascii.Error, ValueError, UnicodeDecodeError):
            return False, (jsonify({"error": "malformed Authorization header"}), 400,
                           {"WWW-Authenticate": 'Basic realm="vcm-server"'})
        # 1) BasicAuth env mode: works for any user (v0.5 compat).
        # Env-mode scope is admin (legacy single-admin operator).
        if AUTH_ENABLED and AUTH_USER:
            if hmac.compare_digest(u, AUTH_USER or "") and hmac.compare_digest(p, AUTH_PASS or ""):
                g.user_scope = "admin"
                g.user_id = None
                g.token_label = "env_admin"
                return None
        # 2) Users mode: validate username+password against users table
        if users_mod.has_any_user():
            res = users_mod.authenticate(u, p)
            if res:
                scope, user_id = res
                g.user_scope = scope
                g.user_id = user_id
                g.token_label = "basic_auth"
                return None
        return False, (jsonify({"error": "invalid credentials"}), 401,
                       {"WWW-Authenticate": 'Basic realm="vcm-server"'})
    else:
        return False, (jsonify({"error": "auth required"}), 401,
                       {"WWW-Authenticate": 'Basic realm="vcm-server", Bearer'})


app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
)


# --- i18n (ADR-0026) ------------------------------------------------------
# Bilingual zh/en UI. Wires `t()` and `lang` into Jinja env so every
# template can do {{ t('audit.title') }} and <html lang="{{ lang }}">.
# Language resolution: ?lang=  > cookie  > Accept-Language  > default.
import i18n  # ADR-0026
i18n.register_jinja(app)


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
    result = _check_basic_auth()
    if result is None:
        # Public — no auth required
        return None
    if isinstance(result, tuple) and result[0] is False:
        # Auth failure
        _, err = result
        body, status, headers = err
        # ADR-0009: log auth failure (do NOT leak whether user exists)
        reason = "wrong_or_missing_credentials"
        if (body.get_data().decode("utf-8", errors="replace")
                .find("malformed") >= 0):
            reason = "malformed_authorization_header"
        audit.write_event(
            "auth_failure",
            path=request.path,
            method=request.method,
            reason=reason,
            remote=request.remote_addr,
            user_agent=request.headers.get("User-Agent", ""),
        )
        resp = Response(body.get_data(), status=status, mimetype="application/json")
        for k, v in headers.items():
            resp.headers[k] = v
        return resp
    return None


# --- SSE bus (ADR-0007) ---------------------------------------------------
# Single shared broadcast queue; multiple browser tabs all subscribe.
import queue
import threading
import time

SSE_LISTENERS = []
SSE_LOCK = threading.Lock()


def sse_publish(event, data):
    """Push an SSE event to every connected client (best effort)."""
    payload = {"event": event, "data": data, "ts": datetime.utcnow().isoformat() + "Z"}
    dead = []
    with SSE_LOCK:
        for q in list(SSE_LISTENERS):
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            try:
                SSE_LISTENERS.remove(q)
            except ValueError:
                pass


# Initialize DB schema at startup (idempotent)
with app.app_context():
    pass  # placeholder; init_db() called below

# ADR-0009: ensure audit log file exists at startup so the dashboard
# has something to read on first access.
try:
    _audit_path = audit.audit_log_path()
    if not _audit_path.exists() and not audit.audit_disabled():
        _audit_path.touch(mode=0o600)
except Exception:
    pass


def get_db():
    """Get or create the SQLite database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist. Delegates to dashboard.init_db
    so MCP stdio transport and the Flask HTTP server share one bootstrap."""
    from dashboard import init_db as _init_db
    _init_db()


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
@scopes_mod.require_scope("push")
def collect():
    """Receive a project state push from `vcm push`."""
    try:
        state = request.get_json(force=True)
        if not state or "project" not in state:
            # Audit log (ADR-0009): log rejection cause before returning.
            try:
                audit.write_event(
                    "state_rejected",
                    reason="invalid_state_no_project",
                    remote=request.remote_addr,
                )
            except Exception:
                pass
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

        # Audit log (ADR-0009): state_pushed event.
        try:
            audit.write_event(
                "state_pushed",
                project=project_name,
                vcm_version=state.get("vcm_version"),
                schema_version=state.get("schema_version"),
                remote=request.remote_addr,
            )
        except Exception:
            pass

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

        # Fire SSE event (ADR-0007). Failures must not break collect.
        try:
            sse_publish("project_push", {"name": project_name, "summary": summary})
        except Exception:
            pass

        return jsonify(summary), 200

    except Exception as e:
        # Audit log (ADR-0009) — capture the rejection cause.
        try:
            payload = request.get_json(silent=True) or {}
            audit.write_event(
                "state_rejected",
                project=(payload.get("project") or {}).get("name"),
                reason=str(e),
                remote=request.remote_addr,
            )
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


@app.route("/api/audit")
@scopes_mod.require_scope("read")
def api_audit():
    """ADR-0009 + ADR-0012: read-only access to the audit log.

    Query params:
      ?since    ISO date-time (lower bound, inclusive)
      ?event    filter by event_type (exact match)
      ?project  filter by project slug
      ?limit    1..5000; default 100
      ?offset   int; default 0
    """
    since = request.args.get("since")
    event_type = request.args.get("event")
    project = request.args.get("project")
    source_ip = request.args.get("source_ip")
    try:
        limit = int(request.args.get("limit", "100"))
    except ValueError:
        limit = 100
    try:
        offset = int(request.args.get("offset", "0"))
    except ValueError:
        offset = 0
    events = audit.read_events(
        since=since, event_type=event_type, project=project,
        source_ip=source_ip, limit=limit, offset=offset,
    )
    return jsonify({"events": events, "count": len(events)})


@app.route("/api/audit/facets")
@scopes_mod.require_scope("read")
def api_audit_facets():
    """ADR-0024: facet chips for the /audit UI.

    Returns counts grouped by (event_type, project, source_ip),
    optionally filtered by the same query params as /api/audit.
    """
    return jsonify(audit.facets(
        since=request.args.get("since"),
        event_type=request.args.get("event"),
        project=request.args.get("project"),
        source_ip=request.args.get("source_ip"),
    ))


@app.route("/api/audit/stats")
@scopes_mod.require_scope("read")
def api_audit_stats():
    """ADR-0012: counters by event_type since `since` (optional).

    Returns: {"total": int, "by_type": {event_type: count}}
    """
    since = request.args.get("since")
    return jsonify(audit.event_stats(since=since))


@app.route("/audit")
def audit_view():
    """ADR-0009: dashboard-side audit log viewer."""
    return _render("audit.html")


@app.route("/api/audit/purge", methods=["POST"])
@scopes_mod.require_scope("admin")
def api_audit_purge():
    """Delete events older than `before` (admin scope, ADR-0016).

    Body: {before: ISO, event_type?: str, project?: str, confirm: "PURGE"}
    Refuses without literal "PURGE" confirmation word. Writes its own
    audit event (event_type=audit_purge) so the deletion is itself
    recorded.
    """
    payload = request.get_json(force=True) or {}
    if payload.get("confirm") != "PURGE":
        return jsonify({"error": "missing 'confirm': 'PURGE' in body"}), 400
    before = payload.get("before")
    if not before:
        return jsonify({"error": "missing 'before' (ISO date-time)"}), 400
    event_type = payload.get("event_type")
    project = payload.get("project")

    conn = sqlite3.connect(audit.sqlite_path(), timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        # ensure table exists
        audit.ensure_events_table(conn)
        q = "DELETE FROM audit_events WHERE ts < ?"
        params = [before]
        if event_type:
            q += " AND event_type = ?"
            params.append(event_type)
        if project is not None:
            q += " AND project = ?"
            params.append(project)
        cur = conn.execute(q, params)
        deleted = cur.rowcount
        conn.commit()
    finally:
        conn.close()

    # meta-audit (ADR-0016): the deletion is itself recorded
    try:
        audit.write_event(
            "audit_purge",
            before=before,
            event_type=event_type,
            project=project,
            deleted_count=deleted,
            scope=getattr(g, "user_scope", None),
            user_id=getattr(g, "user_id", None),
            remote=request.remote_addr,
        )
    except Exception:
        pass
    return jsonify({
        "deleted": deleted,
        "before": before,
        "event_type": event_type,
        "project": project,
    })


@app.route("/trends")
def trends_view():
    """ADR-0010 placeholder — full trends UI ships in step 3."""
    return _render("trends.html")


@app.route("/api/projects")
@scopes_mod.require_scope("read")
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
@scopes_mod.require_scope("read")
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
@scopes_mod.require_scope("read")
def api_dashboard_overview():
    return jsonify(get_overview())


@app.route("/api/dashboard/skill-matrix")
@scopes_mod.require_scope("read")
def api_dashboard_skill_matrix():
    return jsonify(get_skill_matrix())


@app.route("/api/dashboard/attention")
@scopes_mod.require_scope("read")
def api_dashboard_attention():
    return jsonify(get_attention())


@app.route("/api/dashboard/activity")
@scopes_mod.require_scope("read")
def api_dashboard_activity():
    return jsonify(get_recent_activity())


@app.route("/api/peer/summary", methods=["GET", "POST"])
@scopes_mod.require_scope("read")
def api_peer_summary():
    """ADR-0022: peer gossip cache.

    GET: list cached peer summaries (or refresh from the network when
         ?refresh=1 is set, then return the merged view).
    POST: receive a peer's summary and stash it in the in-memory cache.
    """
    if request.method == "POST":
        body = request.get_json(force=True) or {}
        peers.post_peer_summary(body.get("peer", "unknown"), body)
        return jsonify({"ack": True})
    if request.args.get("refresh") == "1":
        rows = peers.all_peer_summaries()
    else:
        rows = peers.peer_status_list()
    return jsonify({"peers": rows, "config": peers.list_peers(),
                    "config_path": peers.config_path()})


@app.route("/api/peer/summary/local")
@scopes_mod.require_scope("read")
def api_peer_summary_local():
    """ADR-0022: this server's drift summary, for peer pull."""
    import dashboard
    drift = dashboard.get_drift()
    return jsonify({
        "peer": "self",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "projects": [
            {"name": p["name"], "drift_score": p["score"],
             "last_seen_at": p.get("last_seen_at"),
             "adrs_count": p.get("adrs_count", 0)}
            for p in drift["projects"]
        ],
    })


@app.route("/api/dashboard/leaderboard")
@scopes_mod.require_scope("read")
def api_dashboard_leaderboard_with_peers():
    """ADR-0022: extended leaderboard that can include peer projects."""
    scope = request.args.get("scope", "local")
    sort = request.args.get("sort", "td_count")
    order = request.args.get("order", "desc")
    lb = get_leaderboard(sort=sort, order=order)
    if scope != "all":
        return jsonify(lb)
    # scope=all: append peer rows. Tag them with origin.
    peer_rows = peers.merge_peer_projects()
    # Lightweight row shape so the frontend can render uniformly.
    merged_local = [
        {**r, "origin": "local",
         "drift_score": r.get("td_count", 0)  # cheap stand-in if no drift
        } for r in lb.get("rows", lb) if isinstance(r, dict)
    ]
    # Some leaderboard variants return {rows: [...]} not a list directly.
    if isinstance(lb, dict) and "rows" in lb:
        base_rows = lb["rows"]
    elif isinstance(lb, list):
        base_rows = lb
    else:
        base_rows = []
    tagged_peer_rows = [
        {"name": pr["name"], "td_count": 0, "skills": 0, "adrs": pr.get("adrs_count", 0),
         "branch": None, "compliance": 0, "stale_days": None, "dirty": False,
         "drift_score": pr.get("drift_score"), "origin": pr["origin"]}
        for pr in peer_rows if pr.get("name")
    ]
    new_rows = list(base_rows) + tagged_peer_rows
    if isinstance(lb, dict):
        return jsonify({**lb, "rows": new_rows, "scope": scope,
                        "peer_count": len(peer_rows)})
    return jsonify(new_rows)


@app.route("/api/dashboard/drift")
@scopes_mod.require_scope("read")
def api_dashboard_drift():
    """ADR-0019: cross-project drift score, sorted desc."""
    return jsonify(get_drift())


@app.route("/drift")
def drift_view():
    """ADR-0019: HTML view of drift per project."""
    return _render("drift.html")


@app.route("/api/dashboard/skill-aging")
@scopes_mod.require_scope("read")
def api_dashboard_skill_aging():
    return jsonify(get_skill_aging())


@app.route("/api/dashboard/summary")
@scopes_mod.require_scope("read")
def api_dashboard_summary():
    return jsonify(get_attention_summary())


@app.route("/api/dashboard/trend")
@scopes_mod.require_scope("read")
def api_dashboard_trend():
    """Governance trend, weekly buckets (ADR-0010).

    Query params:
      metric   compliance|td_count|skills|adrs|git_dirty|pushed (default compliance)
      days     1..365, default 30
      project  project slug, optional (rolls up all projects if absent)
    """
    metric = request.args.get("metric", "compliance")
    try:
        days = int(request.args.get("days", "30"))
    except ValueError:
        days = 30
    project = request.args.get("project")
    return jsonify(get_trend(metric=metric, days=days, project=project))


@app.route("/api/dashboard/leaderboard")
@scopes_mod.require_scope("read")
def api_dashboard_leaderboard():
    """Cross-project ranking (ADR-0005).

    Query params:
      ?sort   td_count|skills|adrs|governance_compliance|last_seen_days|dirty_clean
      ?order  asc|desc   (default: desc)
    """
    sort = request.args.get("sort", "td_count")
    order = request.args.get("order", "desc")
    return jsonify(get_leaderboard(sort=sort, order=order))


@app.route("/api/project/<name>/full")
@scopes_mod.require_scope("read")
def api_project_full(name):
    data = get_project_detail(name)
    if data is None:
        abort(404)
    return jsonify(data)


@app.route("/api/dashboard/stream")
@scopes_mod.require_scope("read")
def api_dashboard_stream():
    """Server-Sent Events live update channel (ADR-0007).

    Emits three event types:
      - hello              — first frame on connect (debug aid)
      - project_push       — fired when /api/collect accepts a state push
      - attention_changed  — recomputed attention every 30s
      - heartbeat          — every 15s (keeps the link alive through proxies)
    """
    client_q = queue.Queue(maxsize=32)

    @stream_with_context
    def gen():
        with SSE_LOCK:
            SSE_LISTENERS.append(client_q)
        try:
            yield f"event: hello\ndata: \"ok\"\n\n"
            try:
                items = get_attention()
                yield "event: attention_changed\ndata: " + json.dumps({"items": items}) + "\n\n"
            except Exception:
                pass
            last_heartbeat = time.time()
            last_attention = time.time()
            while True:
                try:
                    payload = client_q.get(timeout=1.0)
                    yield f"event: {payload['event']}\ndata: {json.dumps(payload['data'])}\n\n"
                except queue.Empty:
                    pass
                now = time.time()
                if now - last_heartbeat >= 15:
                    yield "event: heartbeat\ndata: " + json.dumps({"ts": int(now)}) + "\n\n"
                    last_heartbeat = now
                if now - last_attention >= 30:
                    try:
                        items = get_attention()
                        yield "event: attention_changed\ndata: " + json.dumps({"items": items}) + "\n\n"
                        last_attention = now
                    except Exception:
                        last_attention = now
        except GeneratorExit:
            pass
        finally:
            with SSE_LOCK:
                try:
                    SSE_LISTENERS.remove(client_q)
                except ValueError:
                    pass

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no"})


def _render(template_name, **kwargs):
    """Wrap render_template to inject auth_required context (ADR-0004)
    + sidebar context (ADR-0030: projects list for sidebar)."""
    # ADR-0030: sidebar needs project list. Cap at 50 to bound render time.
    sidebar_projects = []
    try:
        rows = get_db().execute("""
            SELECT id, name, path, last_seen_at FROM projects
            ORDER BY last_seen_at DESC LIMIT 50
        """).fetchall()
        sidebar_projects = [dict(r) for r in rows]
    except Exception:
        pass  # init_db not run; sidebar shows empty state
    ctx = {
        "auth_required": AUTH_ENABLED,
        "sidebar_projects": sidebar_projects,
    }
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


@app.route("/leaderboard")
def leaderboard_view():
    """Cross-project ranking (ADR-0005)."""
    return _render("leaderboard.html")


@app.route("/api/peers")
@scopes_mod.require_scope("read")
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


# --- Skill registry (ADR-0008) -------------------------------------------
# The local vcm skill registry at ~/.vcm/registry/ is owned by the CLI,
# but the server exposes it read-only so the dashboard can render a
# marketplace view. Pure read; no scope gate beyond 'read' (single-user
# v0.5 compat is fine for v0.7 — the publish flow goes through CLI).


@app.route("/api/registry/skills")
@scopes_mod.require_scope("read")
def api_registry_skills():
    """List skills in the local registry (ADR-0008).

    Reads from ~/.vcm/registry/skills/*.json (or $VCM_REGISTRY_DIR).
    Returns sorted by validation_count desc, then name.
    """
    import os
    registry_dir = os.environ.get("VCM_REGISTRY_DIR") or \
        str(Path.home() / ".vcm" / "registry" / "skills")
    if not os.path.isdir(registry_dir):
        return jsonify({"skills": [], "note": "no registry dir"})
    results = []
    for path in glob.glob(os.path.join(registry_dir, "*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                fm = json.load(f)
            results.append({
                "name": fm.get("name", os.path.basename(path).replace(".json", "")),
                "description": (fm.get("description") or "")[:80],
                "tags": fm.get("tags") or [],
                "authority": fm.get("authority"),
                "phase": (fm.get("lifecycle") or {}).get("phase"),
                "validation_count": (fm.get("stewardship") or {}).get("validation_count", 0),
            })
        except Exception:
            continue
    results.sort(key=lambda r: (-(r.get("validation_count") or 0), r.get("name") or ""))
    # Local-first (CHARTER §7). Tag with origin="local".
    local_results = [{**r, "origin": "local"} for r in results]
    if request.args.get("scope", "local") != "all":
        return jsonify({"skills": results, "count": len(results), "scope": "local"})

    # scope=all: merge peer skills (ADR-0023). Local wins on name+name conflict.
    peer_skills = peers.merge_peer_skills()
    seen_names = {r["name"] for r in results if r.get("name")}
    merged = list(local_results)
    for s in peer_skills:
        if s.get("name") and s["name"] not in seen_names:
            merged.append({**s, "validation_count": s.get("validation_count", 0)})
            seen_names.add(s["name"])
    merged.sort(key=lambda r: (-(r.get("validation_count") or 0), r.get("name") or ""))
    return jsonify({
        "skills": merged,
        "count": len(merged),
        "scope": "all",
        "local_count": len(results),
        "peer_count": len(merged) - len(results),
    })


@app.route("/api/peer/registry")
@scopes_mod.require_scope("read")
def api_peer_registry():
    """ADR-0023: this server's skill registry, for peer pull.

    Returns the same shape as /api/registry/skills but pinned to local.
    """
    import os
    registry_dir = os.environ.get("VCM_REGISTRY_DIR") or \
        str(Path.home() / ".vcm" / "registry" / "skills")
    if not os.path.isdir(registry_dir):
        return jsonify({"peer": "self", "skills": [], "fetched_at":
                        datetime.now(timezone.utc).isoformat()})
    skills = []
    for path in glob.glob(os.path.join(registry_dir, "*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                fm = json.load(f)
            skills.append({
                "name": fm.get("name", os.path.basename(path).replace(".json", "")),
                "description": (fm.get("description") or "")[:120],
                "tags": fm.get("tags") or [],
                "version": fm.get("version"),
                "authority": fm.get("authority"),
                "validation_count":
                    (fm.get("stewardship") or {}).get("validation_count", 0),
            })
        except Exception:
            continue
    return jsonify({
        "peer": "self",
        "skills": skills,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/mcp", methods=["POST", "OPTIONS"])
def mcp_http():
    """ADR-0021: MCP Streamable HTTP transport (POST = JSON-RPC request)."""
    if request.method == "OPTIONS":
        return ("", 204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        })
    try:
        body = request.get_json(force=True)
    except Exception:
        return jsonify({"jsonrpc": "2.0", "id": None,
                        "error": {"code": -32700, "message": "Parse error"}}), 400
    resp = mcp_server.handle_jsonrpc(body)
    if resp is None:
        return ("", 202, {"Content-Type": "application/json"})
    if "error" in resp and "result" not in resp:
        code = resp["error"].get("code", -32603)
        return jsonify(resp), 200 if code == -32601 else 400
    return jsonify(resp)


@app.route("/api/registry/publish", methods=["POST"])
@scopes_mod.require_scope("push")
def api_registry_publish():
    """Publish a skill to the local registry (push scope).

    Body:  {name: "skill-name", description: "...",
            tags: [...], authority: "execution-index" | "canonical"}
    Refreshes the registry index. Refuses retired skills.
    """
    import os as _os
    payload = request.get_json(force=True)
    if not payload or "name" not in payload:
        return jsonify({"error": "invalid body, missing 'name'"}), 400
    name = payload["name"]
    # refuse retired
    if (payload.get("lifecycle") or {}).get("phase") == "retired":
        return jsonify({"error": "cannot publish retired skill"}), 400
    # persist
    registry_dir = os.environ.get("VCM_REGISTRY_DIR") or \
        str(Path.home() / ".vcm" / "registry" / "skills")
    Path(registry_dir).mkdir(parents=True, exist_ok=True)
    target = Path(registry_dir) / f"{name}.json"
    # strip _origin if present
    payload = {k: v for k, v in payload.items() if k != "_origin"}
    if not payload.get("authority"):
        payload["authority"] = "execution-index"
    target.write_text(json.dumps(payload, indent=2) + "\n")
    # refresh index
    _regen_registry_index(registry_dir)
    # audit
    try:
        audit.write_event(
            "registry_publish",
            skill_name=name,
            scope=getattr(g, "user_scope", None),
            remote=request.remote_addr,
        )
    except Exception:
        pass
    return jsonify({"published": name, "path": str(target)})


def _regen_registry_index(registry_dir):
    """Rebuild ~/.vcm/registry/index.json from the skills/ directory."""
    index = []
    for path in glob.glob(os.path.join(registry_dir, "skills", "*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                fm = json.load(f)
            index.append({
                "name": fm.get("name", os.path.basename(path).replace(".json", "")),
                "tags": fm.get("tags") or [],
                "authority": fm.get("authority"),
                "phase": (fm.get("lifecycle") or {}).get("phase"),
                "published_at": os.path.getmtime(path),
            })
        except Exception:
            continue
    index_path = os.path.join(os.path.dirname(registry_dir), "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)


# --- Docs viewer (ADR-0017) -----------------------------------------------
# /docs/<path>.md has a thin wrapper that escapes content into <pre>.
# The /api/docs/index endpoint enumerates the docs tree, and the
# /docs view renders a sidebar with client-side fuzzy search.


@app.route("/api/docs/index")
@scopes_mod.require_scope("read")
def api_docs_index():
    """Enumerate all .md files under docs/ (ADR-0017).

    Returns a dict with 'files' list, each entry being
    {filename, relpath, title, snippet (first 200 chars)}.
    """
    md_root = ROOT / "docs"
    if not md_root.exists():
        return jsonify({"files": []})
    files = []
    for path in sorted(md_root.rglob("*.md")):
        try:
            rel = str(path.relative_to(md_root))
        except ValueError:
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        # extract first heading as title
        title = path.stem
        snippet = ""
        for line in content.splitlines():
            if line.startswith("# "):
                title = line.lstrip("# ").strip()
                continue
            if line.strip() and not snippet:
                snippet = line.strip()
        if not snippet:
            snippet = path.stem
        files.append({
            "filename": path.name,
            "relpath": rel,
            "title": title,
            "snippet": snippet[:200],
        })
    return jsonify({"files": files, "count": len(files)})


@app.route("/api/docs/search")
@scopes_mod.require_scope("read")
def api_docs_search():
    """ADR-0020: full-text search across docs/*.md (case-insensitive)."""
    q = (request.args.get("q") or "").strip()
    try:
        limit = int(request.args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    return jsonify(docs_search.search_docs(q, limit=limit))


@app.route("/docs/<path:filename>")
def docs_view(filename):
    """Serve any /docs/*.md with sidebar + search (ADR-0017).

    Markdown is rendered to HTML (ADR-0018, stdlib parser in
    server/markdown_render.py). All content is HTML-escaped first;
    `<script>`-style content stays inert.

    Safety: `filename` is constrained to live under ROOT/docs/. Path
    traversal (`../etc/passwd`) is rejected at `target.relative_to()`.
    """

    import sys as _sys
    _sys.path.insert(0, str(ROOT / "server"))
    md_root = ROOT / "docs"
    target = (md_root / filename).resolve()
    try:
        target.relative_to(md_root.resolve())
    except ValueError:
        abort(404)
    if not target.exists() or not target.is_file():
        abort(404)
    body_raw = target.read_text(encoding="utf-8", errors="replace")
    body = markdown_render.render_markdown(body_raw)
    return _render("_docs.html", title=target.stem, body=body, relpath=str(filename))



@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "not found"}), 404


# Initialize DB at import time so test_client and CLI both work
init_db()
peers.load_peers()  # ADR-0022: register peer URLs at startup


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
