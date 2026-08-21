"""
server/dashboard.py — Dashboard data assembly (multi-project cockpit)
Pulls from states table, computes aggregate views.
"""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("VCM_SERVER_DB", str(ROOT / "server" / "vcm.db")))


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _parse_state_row(row):
    """Parse a states row into dict + raw_json loaded."""
    d = dict(row)
    if d.get("raw_json"):
        try:
            d["state"] = json.loads(d["raw_json"])
        except Exception:
            d["state"] = {}
    d.pop("raw_json", None)
    return d


def get_overview():
    """All projects with their latest state — for the overview panel."""
    conn = get_db()
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
    result = []
    for row in rows:
        d = _parse_state_row(row)
        gov = d.get("state", {}).get("governance", {})
        git = d.get("state", {}).get("git", {})
        result.append({
            "id": d["id"],
            "name": d["name"],
            "path": d["path"],
            "last_seen_at": d.get("last_seen_at"),
            "received_at": d.get("received_at"),
            "agents_md_present": gov.get("agents_md_present"),
            "charter_md_present": gov.get("charter_md_present"),
            "skills_count": gov.get("skills_count", 0),
            "skills_registered": gov.get("skills_registered", []),
            "adrs_count": gov.get("adrs_count", 0),
            "tds_count": gov.get("tds_count", 0),
            "post_mortems_count": gov.get("post_mortems_count", 0),
            "git_branch": git.get("branch"),
            "git_dirty": git.get("dirty", False),
            "git_head": git.get("head_commit"),
            "health": d.get("state", {}).get("health", {}),
        })
    return result


def get_skill_matrix():
    """Skill × project matrix: which skills are used by which projects."""
    overview = get_overview()
    matrix = {}
    for p in overview:
        for skill in p.get("skills_registered", []) or []:
            matrix.setdefault(skill, []).append(p["name"])
    # Sort by number of projects (most-shared first)
    return sorted(
        [{"skill": k, "projects": sorted(v), "project_count": len(v)} for k, v in matrix.items()],
        key=lambda x: (-x["project_count"], x["skill"]),
    )


def get_attention(now=None):
    """Auto-detect projects needing attention:
    - No snapshot for >7 days (using last_seen_at as proxy)
    - Git dirty + CI not passed (no actual CI data, use dirty as warning)
    - Missing AGENTS.md or CHARTER.md
    - >5 TDs (technical debt)
    """
    from datetime import timedelta
    if now is None:
        now = datetime.now(timezone.utc)
    projects = get_overview()
    items = []
    for p in projects:
        reasons = []
        # Last seen > 7 days ago
        if p.get("last_seen_at"):
            try:
                ls = datetime.fromisoformat(p["last_seen_at"].replace("Z", "+00:00"))
                if (now - ls) > timedelta(days=7):
                    reasons.append(f"no update in {(now - ls).days} days")
            except Exception:
                pass
        if not p.get("agents_md_present"):
            reasons.append("missing AGENTS.md")
        if not p.get("charter_md_present"):
            reasons.append("missing CHARTER.md")
        if p.get("tds_count", 0) > 30:
            reasons.append(f"{p['tds_count']} tech debts")
        if p.get("git_dirty"):
            reasons.append("working tree dirty")
        if p.get("skills_count", 0) == 0:
            reasons.append("no skills registered")
        if reasons:
            severity = "critical" if len(reasons) >= 2 else "warn"
            items.append({
                "project": p["name"],
                "reasons": reasons,
                "severity": severity,
            })
    # Critical first
    items.sort(key=lambda x: (0 if x["severity"] == "critical" else 1, x["project"]))
    return items


def get_recent_activity(limit=20):
    """Cross-project recent push activity."""
    conn = get_db()
    rows = conn.execute("""
        SELECT s.id, s.received_at, p.name AS project_name
        FROM states s
        JOIN projects p ON p.id = s.project_id
        ORDER BY s.received_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_skill_aging():
    """Find skills that haven't been validated in a while (using governance data)."""
    # We don't have per-skill timestamps from vcm push yet, so use the project-level
    # last_seen_at as a proxy: list projects where last_seen > 30 days.
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    projects = get_overview()
    aging = []
    for p in projects:
        if p.get("last_seen_at"):
            try:
                ls = datetime.fromisoformat(p["last_seen_at"].replace("Z", "+00:00"))
                if (now - ls) > timedelta(days=30):
                    aging.append({
                        "project": p["name"],
                        "last_seen": p["last_seen_at"],
                        "days_ago": (now - ls).days,
                    })
            except Exception:
                pass
    return aging


def get_attention_summary():
    """Top-level numbers for the metrics row."""
    projects = get_overview()
    total = len(projects)
    healthy = sum(1 for p in projects if p.get("agents_md_present") and p.get("charter_md_present") and not p.get("git_dirty"))
    warning = sum(1 for p in projects if p.get("git_dirty") or (not p.get("charter_md_present")))
    needs_attention = len(get_attention())
    total_skills = sum(p.get("skills_count", 0) for p in projects)
    total_adrs = sum(p.get("adrs_count", 0) for p in projects)
    return {
        "total_projects": total,
        "healthy": healthy,
        "warning": warning,
        "needs_attention": needs_attention,
        "total_skills": total_skills,
        "total_adrs": total_adrs,
    }


def get_project_detail(name):
    """Full state + history for a single project."""
    conn = get_db()
    project = conn.execute(
        "SELECT id, name, path, first_seen_at, last_seen_at FROM projects WHERE name = ?",
        (name,),
    ).fetchone()
    if not project:
        conn.close()
        return None
    # Latest state
    latest = conn.execute("""
        SELECT * FROM states WHERE project_id = ? ORDER BY received_at DESC LIMIT 1
    """, (project["id"],)).fetchone()
    # History (last 10)
    history = conn.execute("""
        SELECT id, schema_version, vcm_version, received_at FROM states
        WHERE project_id = ? ORDER BY received_at DESC LIMIT 10
    """, (project["id"],)).fetchall()
    conn.close()
    result = dict(project)
    result["latest_state"] = json.loads(latest["raw_json"]) if latest else {}
    result["history"] = [dict(h) for h in history]
    return result
