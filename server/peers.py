"""
server/peers.py — peer registry + gossip cache (ADR-0022).

Local-first: each vcm-server holds its own data authoritatively.
Peers are an *optional* second source — fetch-on-demand, no background
loop, 5 min TTL. The DB is not touched; everything is in memory.
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


_TTL_SEC = 300  # 5 minutes
_FETCH_TIMEOUT = 5.0
_MAX_PEERS = 8

_LOCK = threading.RLock()
_PEERS_CFG: list[dict] = []            # [{"name": "...", "url": "..."}]
_CACHE: dict[str, dict[str, Any]] = {}  # name -> {fetched_at, summary, status}
_CFG_PATH: Path | None = None


def _config_path() -> Path:
    return Path(os.environ.get("VCM_PEERS", "~/.vcm/peers.json")).expanduser()


def load_peers() -> list[dict]:
    """Read `peers.json` from disk. Idempotent. Trims to MAX_PEERS."""
    global _PEERS_CFG, _CFG_PATH
    with _LOCK:
        _CFG_PATH = _config_path()
        if not _CFG_PATH.exists():
            _PEERS_CFG = []
            return _PEERS_CFG
        try:
            text = _CFG_PATH.read_text(encoding="utf-8")
            data = json.loads(text)
            peers = data.get("peers", []) if isinstance(data, dict) else []
            if not isinstance(peers, list):
                peers = []
            peers = peers[:_MAX_PEERS]
            _PEERS_CFG = [p for p in peers
                          if isinstance(p, dict) and p.get("name") and p.get("url")]
        except (json.JSONDecodeError, OSError):
            _PEERS_CFG = []
    return _PEERS_CFG


def config_path() -> str:
    return str(_CFG_PATH) if _CFG_PATH else str(_config_path())


def list_peers() -> list[dict]:
    """Return the configured peer list (without re-reading disk)."""
    with _LOCK:
        return list(_PEERS_CFG)


def auth_header() -> dict[str, str] | None:
    """Build the BasicAuth header for outbound peer fetches, or None."""
    import base64
    u = os.environ.get("VCM_AUTH_USER")
    p = os.environ.get("VCM_AUTH_PASS")
    if u and p:
        token = base64.b64encode(f"{u}:{p}".encode()).decode()
        return {"Authorization": f"Basic {token}"}
    return None


def _http_get(url: str) -> dict | None:
    """GET a peer URL and return the JSON dict (or None on failure)."""
    req = Request(url, headers={"Accept": "application/json",
                                 **(auth_header() or {})})
    try:
        with urlopen(req, timeout=_FETCH_TIMEOUT) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return json.loads(body)
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def get_peer_summary(peer: dict) -> dict:
    """Fetch a single peer's summary. Cached with 5-min TTL."""
    name = peer["name"]
    now = time.time()
    with _LOCK:
        cached = _CACHE.get(name)
        if cached and (now - cached.get("fetched_at_epoch", 0)) < _TTL_SEC:
            return cached  # return the wrapping envelope, not the inner body
        url = peer["url"].rstrip("/") + "/api/peer/summary/local"
        data = _http_get(url)
        if data is not None and isinstance(data, dict):
            summary = {
                "peer": name,
                "url": peer["url"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "fetched_at_epoch": now,
                "status": "ok",
                "summary": data,
            }
        else:
            summary = {
                "peer": name,
                "url": peer["url"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "fetched_at_epoch": now,
                "status": "unreachable",
                "summary": (cached or {}).get("summary", {}),
            }
        _CACHE[name] = summary
        return summary


def all_peer_summaries() -> list[dict]:
    """Fetch every configured peer (uncached entries only)."""
    with _LOCK:
        return [get_peer_summary(p) for p in _PEERS_CFG]


def peer_status_list() -> list[dict]:
    """Just the cached entries — no fetch."""
    with _LOCK:
        return [
            {
                "peer": v["peer"],
                "url": v["url"],
                "fetched_at": v["fetched_at"],
                "status": v["status"],
                "project_count": len(((v.get("summary") or {}).get("projects") or [])),
            }
            for v in _CACHE.values()
        ]


def merge_peer_projects() -> list[dict]:
    """Project rows from all reachable peers, tagged with origin.

    Each row has the shape {name, drift_score, last_seen_at, origin}.
    """
    out = []
    for entry in all_peer_summaries():
        peer_name = entry["peer"]
        if entry["status"] != "ok":
            continue
        for proj in (entry.get("summary") or {}).get("projects", []):
            if not isinstance(proj, dict):
                continue
            out.append({
                "name": proj.get("name"),
                "drift_score": proj.get("drift_score"),
                "last_seen_at": proj.get("last_seen_at"),
                "adrs_count": proj.get("adrs_count", 0),
                "origin": peer_name,
            })
    return out


def post_peer_summary(peer_name: str, body: dict) -> dict:
    """Receive a peer's summary (POST). Stash in cache, return acknowledge.

    Not a no-op: this lets a remote peer push instead of having
    server-side to GET them. Both sides end up with the same cache.
    """
    with _LOCK:
        _CACHE[peer_name] = {
            "peer": peer_name,
            "url": "(inbound)",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "fetched_at_epoch": time.time(),
            "status": "ok",
            "summary": body,
        }
        return {"ack": True, "peer": peer_name}


def reset_for_tests():
    """Clear registry + cache. Only for tests."""
    global _PEERS_CFG, _CACHE, _CFG_PATH
    with _LOCK:
        _PEERS_CFG = []
        _CACHE = {}
        _CFG_PATH = None


# --- Cross-server skill registry exchange (ADR-0023) -------------------

def get_peer_registry(peer: dict) -> dict:
    """Fetch one peer's skill registry. Cached for the same TTL as summaries."""
    name = peer["name"]
    now = time.time()
    with _LOCK:
        # Reuse the same TTL & cache instance; key distinguishing field is
        # `kind` so we never collide summary rows with registry rows.
        cached = _CACHE.get(f"registry:{name}")
        if cached and (now - cached.get("fetched_at_epoch", 0)) < _TTL_SEC:
            return cached
        url = peer["url"].rstrip("/") + "/api/peer/registry"
        data = _http_get(url)
        if data is not None and isinstance(data, dict):
            entry = {
                "peer": name,
                "url": peer["url"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "fetched_at_epoch": now,
                "status": "ok",
                "skills": data.get("skills", []),
            }
        else:
            entry = {
                "peer": name,
                "url": peer["url"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "fetched_at_epoch": now,
                "status": "unreachable",
                "skills": (cached or {}).get("skills", []),
            }
        _CACHE[f"registry:{name}"] = entry
        return entry


def all_peer_registries(refresh: bool = False) -> list[dict]:
    if refresh:
        with _LOCK:
            # Drop the registry rows so the next get_peer_registry call
            # actually re-fetches instead of returning the cached entry.
            stale = [k for k in _CACHE if k.startswith("registry:")]
            for k in stale:
                _CACHE.pop(k, None)
    with _LOCK:
        return [get_peer_registry(p) for p in _PEERS_CFG]


def merge_peer_skills(refresh: bool = False) -> list[dict]:
    """Flatten each peer's skill list, tagged with origin."""
    out = []
    for entry in all_peer_registries(refresh=refresh):
        if entry.get("status") != "ok":
            continue
        for s in entry.get("skills", []):
            if not isinstance(s, dict):
                continue
            out.append({**s, "origin": entry["peer"]})
    return out


def reset_for_tests_cache():  # used by tests too
    """Drop *all* cached peer entries (used between tests)."""
    with _LOCK:
        _CACHE.clear()
