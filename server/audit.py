"""
server/audit.py — JSONL + SQLite audit log (ADR-0009 + ADR-0012).

Configuration:
  $VCM_AUDIT_LOG              — JSONL path; defaults to ~/.vcm/audit.log
  $VCM_AUDIT_DISABLED=1       — disable entirely
  $VCM_SERVER_DB              — SQLite path (the same one the rest of
                                vcm-server uses); events table lives here.

Storage strategy (ADR-0012):
  - Write to SQLite first (truth) — failure raises (audit must NOT be lost).
  - Write to JSONL second (parallel) — failure logs to stderr (don't break).
  - Reads default to SQLite (faster, indexed); /api/audit can stream JSONL
    via --tail.
"""

from __future__ import annotations

import json
import os
import sys
import fcntl
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def _enable_wal(conn) -> None:
    """Allow CLI + server to share the DB via WAL journal mode."""
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        pass


# --- Configuration --------------------------------------------------------

def audit_log_path() -> str:
    """JSONL path."""
    custom = os.environ.get("VCM_AUDIT_LOG")
    if custom:
        return custom
    return str(Path.home() / ".vcm" / "audit.log")


def sqlite_path() -> str:
    """Where to read/write events. By default shares the vcm-server DB so
    backups catch both governance + audit events together."""
    return os.environ.get("VCM_SERVER_DB", "./vcm.db")


def audit_disabled() -> bool:
    return os.environ.get("VCM_AUDIT_DISABLED") == "1"


def _ensure_jsonl():
    """Touch the JSONL file with 0o600 on creation (privacy hint)."""
    p = Path(audit_log_path())
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        try: p.touch(mode=0o600)
        except Exception: pass


# --- Schema bootstrap -----------------------------------------------------

def ensure_events_table(conn) -> None:
    """Create the events table + indexes if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ts          TEXT    NOT NULL,
            event_type  TEXT    NOT NULL,
            project     TEXT,
            source_ip   TEXT,
            payload     TEXT    NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts         ON audit_events (ts);
        CREATE INDEX IF NOT EXISTS idx_audit_etype      ON audit_events (event_type);
        CREATE INDEX IF NOT EXISTS idx_audit_proj       ON audit_events (project);
        CREATE INDEX IF NOT EXISTS idx_audit_ts_etype   ON audit_events (ts, event_type);
    """)


# --- Public write API ----------------------------------------------------

def write_event(event_type: str, **fields) -> None:
    """Append one event to BOTH SQLite and JSONL.

    Order: SQLite first (truth) → JSONL second (redundant).
    SQLite failure RAISES. JSONL failure only logs to stderr.
    """
    if audit_disabled():
        return
    rec = {"ts": datetime.now(timezone.utc).isoformat(), "event_type": event_type}
    rec.update(fields)
    # 1. SQLite (truth)
    try:
        _write_sqlite(rec)
    except Exception as e:
        sys.stderr.write(f"[audit] sqlite write failed: {e}\n")
        sys.stderr.flush()
        # We DO NOT silently swallow SQLite failures (audit must not be lost).
        return
    # 2. JSONL (parallel stream)
    try:
        _write_jsonl(rec)
    except Exception as e:
        sys.stderr.write(f"[audit] jsonl write failed: {e}\n")
        sys.stderr.flush()


def _write_sqlite(rec: dict) -> None:
    db_path = sqlite_path()
    db_dir = Path(db_path).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    # short-lived connection per write; SQLite is fast at single inserts.
    # We are not using the long-lived get_db() because Flask thread safety
    # makes it tricky to share with CLI tooling.
    conn = sqlite3.connect(db_path, timeout=5.0); _enable_wal(conn)
    try:
        ensure_events_table(conn)
        conn.execute(
            "INSERT INTO audit_events (ts, event_type, project, source_ip, payload)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                rec.get("ts"),
                rec.get("event_type"),
                rec.get("project"),
                rec.get("source_ip"),
                # store the rest as JSON for forward-compat
                json.dumps({k: v for k, v in rec.items()
                          if k not in ("ts", "event_type", "project", "source_ip")},
                          default=str),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _write_jsonl(rec: dict) -> None:
    _ensure_jsonl()
    path = audit_log_path()
    line = json.dumps(rec, default=str) + "\n"
    with open(path, "a", encoding="utf-8") as f:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        except Exception:
            pass
        f.write(line)
        f.flush()


# --- Read API (defaults to SQLite) ---------------------------------------

def read_events(since=None, event_type=None, project=None, source_ip=None, limit=100, offset=0):
    """Read events, newest-first.

    Filters (all AND):
      since     ISO date-time (>=)
      event_type exact match
      project    exact match (NULL is allowed)
      limit      1..5000; default 100
      offset     int; default 0

    Returns: list of dicts with shape:
      {id, ts, event_type, project, source_ip, payload: {...}}
    """
    if not (1 <= limit <= 5000):
        limit = 100
    offset = max(0, offset)

    # Prefer SQLite; fall back to JSONL if DB is missing.
    db_path = sqlite_path()
    if Path(db_path).exists():
        try:
            return _read_sqlite(since, event_type, project, source_ip, limit, offset)
        except Exception as e:
            sys.stderr.write(f"[audit] sqlite read failed: {e}; falling back to JSONL\n")

    return _read_jsonl_filtered(since, event_type, project, source_ip, limit, offset)


def _read_sqlite(since, event_type, project, source_ip, limit, offset):
    conn = sqlite3.connect(sqlite_path(), timeout=5.0); _enable_wal(conn)
    conn.row_factory = sqlite3.Row
    try:
        ensure_events_table(conn)
        # NEW: support offset for pagination + project filter
        q = "SELECT id, ts, event_type, project, source_ip, payload FROM audit_events WHERE 1=1"
        params = []
        if since:
            q += " AND ts >= ?"; params.append(since)
        if event_type:
            q += " AND event_type = ?"; params.append(event_type)
        if project is not None:
            q += " AND project = ?"; params.append(project)
        if source_ip is not None:
            q += " AND source_ip = ?"; params.append(source_ip)
        q += " ORDER BY ts DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = conn.execute(q, params).fetchall()
        return [_row_to_event(r) for r in rows]
    finally:
        conn.close()


def _row_to_event(row) -> dict:
    payload = {}
    if row["payload"]:
        try: payload = json.loads(row["payload"])
        except Exception: pass
    return {
        "id": row["id"],
        "ts": row["ts"],
        "event_type": row["event_type"],
        "project": row["project"],
        "source_ip": row["source_ip"],
        **payload,
    }


def _read_jsonl_filtered(since, event_type, project, source_ip, limit, offset):
    p = Path(audit_log_path())
    if not p.exists():
        return []
    events = []
    try:
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try: ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event_type and ev.get("event_type") != event_type:
                    continue
                if since and (ev.get("ts", "") < since):
                    continue
                if project is not None and ev.get("project") != project:
                    continue
                if source_ip is not None and ev.get("source_ip") != source_ip:
                    continue
                events.append(ev)
    except Exception as e:
        sys.stderr.write(f"[audit] read failed: {e}\n")
    events.reverse()  # newest first
    return events[offset:offset + limit]


# --- Aggregations --------------------------------------------------------

def event_stats(since: str | None = None) -> dict:
    """Counter by event_type since `since`.

    Used by the /audit dashboard's stat-card.
    Returns: {"total": int, "by_type": {event_type: count}}
    """
    db_path = sqlite_path()
    if Path(db_path).exists():
        try:
            return _event_stats_sqlite(since)
        except Exception:
            pass
    return _event_stats_jsonl(since)


def _event_stats_sqlite(since):
    conn = sqlite3.connect(sqlite_path(), timeout=5.0); _enable_wal(conn)
    conn.row_factory = sqlite3.Row
    try:
        ensure_events_table(conn)
        if since:
            rows = conn.execute(
                "SELECT event_type, COUNT(*) AS c FROM audit_events WHERE ts >= ? GROUP BY event_type",
                (since,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT event_type, COUNT(*) AS c FROM audit_events GROUP BY event_type"
            ).fetchall()
        by_type = {r["event_type"]: r["c"] for r in rows}
        return {"total": sum(by_type.values()), "by_type": by_type}
    finally:
        conn.close()




def facets(since=None, event_type=None, project=None, source_ip=None) -> dict:
    """Return counts grouped by (event_type, project, source_ip).

    Used by the /audit UI to render facet chips (ADR-0024).
    Returns: {"events": {event_type: count}, "projects": {slug: count},
              "source_ips": {ip: count}, "total": int}
    """
    db_path = sqlite_path()
    if not Path(db_path).exists():
        return {"events": {}, "projects": {}, "source_ips": {}, "total": 0}
    conn = sqlite3.connect(db_path, timeout=5.0); _enable_wal(conn)
    conn.row_factory = sqlite3.Row
    try:
        ensure_events_table(conn)
        base_conds = []
        params = []
        if since:
            base_conds.append("ts >= ?"); params.append(since)
        if event_type:
            base_conds.append("event_type = ?"); params.append(event_type)
        if project:
            base_conds.append("project = ?"); params.append(project)
        if source_ip:
            base_conds.append("source_ip = ?"); params.append(source_ip)

        def rows_for(field, extra_conds):
            """GROUP BY `field`, applying base_conds (filters) + extra_conds
            (e.g. 'project IS NOT NULL'). one wh_clause per call keeps the
            SQL deterministic regardless of which filters are active."""
            all_conds = base_conds + list(extra_conds)
            wh_clause = (" WHERE " + " AND ".join(all_conds)) if all_conds else ""
            sql = f"SELECT {field}, COUNT(*) AS c FROM audit_events{wh_clause} GROUP BY {field}"
            return conn.execute(sql, params).fetchall()

        events = {r["event_type"]: r["c"] for r in rows_for("event_type", [])}
        projects = {r["project"]: r["c"]
                    for r in rows_for("project", ["project IS NOT NULL"])
                    if r["project"]}
        ips = {r["source_ip"]: r["c"]
               for r in rows_for("source_ip", ["source_ip IS NOT NULL"])
               if r["source_ip"]}
        total = sum(events.values())
        return {"events": events, "projects": projects, "source_ips": ips, "total": total}
    finally:
        conn.close()


def _event_stats_jsonl(since):
    counts = {}
    p = Path(audit_log_path())
    if not p.exists():
        return {"total": 0, "by_type": {}}
    try:
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try: ev = json.loads(line)
                except json.JSONDecodeError: continue
                if since and (ev.get("ts", "") < since): continue
                et = ev.get("event_type", "?")
                counts[et] = counts.get(et, 0) + 1
    except Exception:
        pass
    return {"total": sum(counts.values()), "by_type": counts}
