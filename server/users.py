"""
server/users.py — per-user authentication (ADR-0011).

Storage: SQLite users + tokens tables in the same DB as vcm-server.
Passwords: bcrypt cost=12.
Tokens: random 32-byte URL-safe strings; stored as sha256 hash.

Conflict with BasicAuth (ADR-0004):
  - If VCM_AUTH_USER + VCM_AUTH_PASS is set, use BasicAuth (v0.5 compat).
  - Else if users table has any user, accept either Bearer token or
    HTTP Basic with username:password (which is hashed to verify).
  - The two paths share /api/* and differ only in credential validation.

Scopes (ADR-0011):
  read   — GET on dashboard/registry/audit
  push   — POST /api/collect, /api/registry/publish (default)
  admin  — DELETE /api/audit/purge (v0.7)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
import time
from pathlib import Path


def _db_path() -> str:
    """Where users/tokens live. Defaults to same as vcm-server DB so
    one backup captures everything; overridable for separation."""
    return os.environ.get(
        "VCM_USERS_DB",
        os.environ.get("VCM_SERVER_DB", "./vcm.db"),
    )


def _enable_wal(conn) -> None:
    """WAL mode allows multiple processes (CLI + Flask) to share the DB."""
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        pass


def _ensure_tables(conn) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            scope         TEXT    NOT NULL DEFAULT 'push',
            created_at    TEXT    NOT NULL,
            last_seen_at  TEXT
        );
        CREATE TABLE IF NOT EXISTS tokens (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash   TEXT    NOT NULL,
            label        TEXT,
            scope        TEXT,
            created_at   TEXT    NOT NULL,
            expires_at   TEXT,
            last_used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
    """)


def _hash_password(password: str) -> str:
    """bcrypt cost=12. Returns the standard "$2b$..." string."""
    try:
        import bcrypt
    except ImportError:
        sys.stderr.write("[users] bcrypt not installed; users disabled\n")
        sys.exit(1)
    return bcrypt.hashpw(password.encode("utf-8"),
                          bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    try:
        import bcrypt
    except ImportError:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# --- User management -------------------------------------------------------

def add_user(username: str, password: str, scope: str = "push"):
    """Create a user; raises if already exists."""
    db = _db_path()
    Path(db).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db); _enable_wal(conn)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        existing = conn.execute("SELECT id FROM users WHERE username = ?",
                                 (username,)).fetchone()
        if existing:
            raise ValueError(f"user already exists: {username}")
        ph = _hash_password(password)
        now = _now()
        conn.execute(
            "INSERT INTO users (username, password_hash, scope, created_at) "
            "VALUES (?, ?, ?, ?)",
            (username, ph, scope, now),
        )
        conn.commit()
        return conn.execute("SELECT id, username, scope, created_at FROM users "
                             "WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()


def list_users():
    db = _db_path()
    if not Path(db).exists():
        return []
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        rows = conn.execute(
            "SELECT id, username, scope, created_at, last_seen_at FROM users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def change_password(username: str, new_password: str):
    db = _db_path()
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        row = conn.execute("SELECT id FROM users WHERE username = ?",
                           (username,)).fetchone()
        if not row:
            raise ValueError(f"no such user: {username}")
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                     (_hash_password(new_password), row["id"]))
        conn.commit()
    finally:
        conn.close()


def delete_user(username: str):
    db = _db_path()
    conn = sqlite3.connect(db); _enable_wal(conn)
    try:
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
    finally:
        conn.close()


def authenticate(username: str, password: str):
    """Returns (scope, user_id) on success, None on failure."""
    db = _db_path()
    if not Path(db).exists():
        return None
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        row = conn.execute(
            "SELECT id, password_hash, scope FROM users WHERE username = ?",
            (username,)).fetchone()
        if not row:
            return None
        if not _verify_password(password, row["password_hash"]):
            return None
        # update last_seen_at (best-effort)
        try:
            conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?",
                          (_now(), row["id"]))
            conn.commit()
        except Exception:
            pass
        return row["scope"], row["id"]
    finally:
        conn.close()


# --- Token management -----------------------------------------------------

def issue_token(username: str, label: str = None, scope: str = None,
                days: int = None) -> str:
    """Mint a new bearer token. Returns the raw secret (shown once).

    Format: 'vcm_<urlsafe-base64-of-uid>.<urlsafe-base64-of-random>'
    Total length: ~70 chars. Token is stored as sha256(raw) for safety.
    """
    db = _db_path()
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        user = conn.execute("SELECT id, scope FROM users WHERE username = ?",
                            (username,)).fetchone()
        if not user:
            raise ValueError(f"no such user: {username}")
        scope = scope or user["scope"]
        # Compose: vcm_<uid_b64>.<secret_b64>
        # (uid is recoverable from token prefix; secret is unique per token)
        uid_b64 = base64.urlsafe_b64encode(str(user["id"]).encode()).rstrip(b"=").decode()
        raw_secret = secrets.token_urlsafe(32)
        raw_token = f"vcm_{uid_b64}.{raw_secret}"
        token_hash = _hash_token(raw_token)
        # optional expiry
        expires_at = None
        if days:
            import datetime as _dt
            expires = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=days)
            expires_at = expires.isoformat()
        conn.execute(
            "INSERT INTO tokens (user_id, token_hash, label, scope, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (user["id"], token_hash, label, scope, _now(), expires_at),
        )
        conn.commit()
        return raw_token
    finally:
        conn.close()


def verify_token(raw: str):
    """Returns (scope, user_id, token_label) on success, None on failure."""
    if not raw or not raw.startswith("vcm_"):
        return None
    db = _db_path()
    if not Path(db).exists():
        return None
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        token_hash = _hash_token(raw)
        row = conn.execute("""
            SELECT t.user_id, t.label, t.expires_at, u.scope
            FROM tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = ?
        """, (token_hash,)).fetchone()
        if not row:
            return None
        # Check expiry
        if row["expires_at"]:
            try:
                from datetime import datetime
                exp = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if exp.timestamp() < time.time():
                    return None
            except Exception:
                pass
        # touch last_used_at (best-effort)
        try:
            conn.execute("UPDATE tokens SET last_used_at = ? WHERE token_hash = ?",
                          (_now(), token_hash))
            conn.commit()
        except Exception:
            pass
        return row["scope"], row["user_id"], row["label"] or "?"
    finally:
        conn.close()


def revoke_token(token_id: int):
    db = _db_path()
    conn = sqlite3.connect(db); _enable_wal(conn)
    try:
        conn.execute("DELETE FROM tokens WHERE id = ?", (token_id,))
        conn.commit()
    finally:
        conn.close()


def list_tokens(username: str = None):
    db = _db_path()
    if not Path(db).exists():
        return []
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        if username:
            rows = conn.execute("""
                SELECT t.id, t.user_id, t.label, t.scope, t.created_at,
                       t.expires_at, t.last_used_at, u.username
                FROM tokens t JOIN users u ON u.id = t.user_id
                WHERE u.username = ?
                ORDER BY t.id
            """, (username,)).fetchall()
        else:
            rows = conn.execute("""
                SELECT t.id, t.user_id, t.label, t.scope, t.created_at,
                       t.expires_at, t.last_used_at, u.username
                FROM tokens t JOIN users u ON u.id = t.user_id
                ORDER BY t.id
            """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# --- Helpers --------------------------------------------------------------

def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def has_any_user() -> bool:
    """Used by app.py to decide if users-mode is active."""
    db = _db_path()
    if not Path(db).exists():
        return False
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        return conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
    finally:
        conn.close()


def has_any_token() -> bool:
    db = _db_path()
    if not Path(db).exists():
        return False
    conn = sqlite3.connect(db); _enable_wal(conn); conn.row_factory = sqlite3.Row
    try:
        _ensure_tables(conn)
        return conn.execute("SELECT 1 FROM tokens LIMIT 1").fetchone() is not None
    finally:
        conn.close()
