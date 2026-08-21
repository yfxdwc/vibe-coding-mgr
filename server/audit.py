"""
server/audit.py — JSONL append-only audit log (ADR-0009).

Logs auth_failure, state_pushed, state_rejected, registry_publish,
registry_unpublish events. Failures to write the log itself fall
through to stderr — they MUST NOT break business requests.

Configuration:
  $VCM_AUDIT_LOG              — path; defaults to ~/.vcm/audit.log
  $VCM_AUDIT_DISABLED=1       — disable entirely (for tests + noise)
"""

from __future__ import annotations

import json
import os
import sys
import fcntl
from datetime import datetime, timezone
from pathlib import Path


# --- Configuration --------------------------------------------------------

def audit_log_path():
    """Return the path where audit events are appended.

    Resolution order: $VCM_AUDIT_LOG → ~/.vcm/audit.log.
    Parent directory is created if missing.
    """
    custom = os.environ.get("VCM_AUDIT_LOG")
    if custom:
        p = Path(custom)
    else:
        p = Path.home() / ".vcm" / "audit.log"
    p.parent.mkdir(parents=True, exist_ok=True)
    # Set file to owner-only access at creation (privacy hint).
    if not p.exists():
        try:
            p.touch(mode=0o600)
        except Exception:
            pass
    return p


def audit_disabled() -> bool:
    return os.environ.get("VCM_AUDIT_DISABLED") == "1"


# --- Public API -----------------------------------------------------------

def write_event(event_type: str, **fields) -> None:
    """Append one JSONL event to the log file.

    Silent on failure. Reads VCM_AUDIT_DISABLED=1 to opt out (tests).
    """
    if audit_disabled():
        return
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
    }
    rec.update(fields)
    try:
        path = audit_log_path()
        with open(path, "a", encoding="utf-8") as f:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            except Exception:
                pass  # flock not strictly needed; OPEN_APPEND atomic for short writes
            f.write(json.dumps(rec, default=str) + "\n")
            f.flush()
    except Exception as e:
        sys.stderr.write(f"[audit] write failed: {e}\n")
        sys.stderr.flush()


def read_events(since=None, event_type=None, limit=100):
    """Read back the latest events (newest-first), filtered.

    Args:
      since:    ISO date-time string (inclusive lower bound).
      event_type: exact match filter (e.g. "auth_failure").
      limit:    1..5000; default 100.

    Returns: list of dicts in newest-first order.
    """
    if not (1 <= limit <= 5000):
        limit = 100
    p = audit_log_path()
    if not p.exists():
        return []
    events = []
    try:
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event_type and ev.get("event_type") != event_type:
                    continue
                if since and (ev.get("ts", "") < since):
                    continue
                events.append(ev)
    except Exception as e:
        sys.stderr.write(f"[audit] read failed: {e}\n")
    events.reverse()  # newest first
    return events[:limit]
