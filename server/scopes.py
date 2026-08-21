"""
server/scopes.py — per-route scope enforcement (ADR-0014).
"""

from functools import wraps

from flask import g, jsonify, request

import audit


SCOPE_RANK = {"read": 1, "push": 2, "admin": 3}


def current_scope():
    return getattr(g, "user_scope", "public") or "public"


def _audit_forbidden(reason, min_required=None, scope=None):
    """Emit a scope_forbidden audit event (best-effort).

    Pass min_required and scope as kwargs so the event payload includes
    explicit fields for log queryability (ADR-0012 /api/audit/stats).
    """
    try:
        audit.write_event(
            "scope_forbidden",
            scope=getattr(g, "user_scope", None),
            path=request.path,
            method=request.method,
            required=min_required, have=scope,
            reason=reason,
            remote=request.remote_addr,
        )
    except Exception:
        pass


def _resp(status, body):
    resp = jsonify(body)
    resp.status_code = status
    return resp


def require_scope(min_required):
    min_rank = SCOPE_RANK.get(min_required, 0)

    def deco(view):
        @wraps(view)
        def wrap(*args, **kwargs):
            scope = current_scope()
            if scope == "public":
                # Auth has not happened yet. Defer to the global
                # before_request handler which returns 401 with proper
                # WWW-Authenticate header.
                return view(*args, **kwargs)
            if SCOPE_RANK.get(scope, 0) < min_rank:
                _audit_forbidden(f"required={min_required}, got={scope}", min_required=min_required, scope=scope)
                return _resp(403, {
                    "error": "scope insufficient",
                    "required": min_required,
                    "have": scope,
                })
            return view(*args, **kwargs)
        return wrap
    return deco
