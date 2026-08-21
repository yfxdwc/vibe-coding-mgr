#!/usr/bin/env python3
"""lib/cli/users_cli.py — CLI shim for user/token commands (ADR-0011).

This script is invoked by Node's spawnSync from lib/cli/user.js. Args are
positional: <action> <sub> <name> [--label <l>] [--scope <s>] [--days <d>]
"""

import argparse
import sys
from pathlib import Path

# Make server/users importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "server"))
import users as u  # noqa: E402

import getpass  # noqa: E402


def main():
    p = argparse.ArgumentParser(prog="vcm user|token",
                                  description="Per-user ACL management (ADR-0011)")
    p.add_argument("action", choices=["user", "token"])
    p.add_argument("sub", help="add | list | passwd | delete | grant | revoke")
    p.add_argument("name", nargs="?", default="", help="username or token id")
    p.add_argument("--label", help="token label")
    p.add_argument("--scope", help="user / token scope (read|push|admin)")
    p.add_argument("--days", type=int, help="token expiry in days")
    p.add_argument("--password", help="password (CI use; prefer stdin/TTY)")
    args = p.parse_args()

    if args.action == "user":
        if args.sub == "add":
            if not args.name:
                print("✗ Usage: vcm user add <name>", file=sys.stderr); sys.exit(1)
            pw = args.password or __import__("os").environ.get("VCM_USER_PASSWORD")
            if not pw:
                pw = getpass.getpass("password: ")
                pw2 = getpass.getpass("confirm:  ")
                if pw != pw2:
                    print("✗ password mismatch", file=sys.stderr); sys.exit(1)
            scope = args.scope or "push"
            try:
                row = u.add_user(args.name, pw, scope=scope)
                print(f"✓ user '{row['username']}' added (scope={row['scope']})")
            except ValueError as e:
                print(f"✗ {e}", file=sys.stderr); sys.exit(1)
        elif args.sub == "list":
            rows = u.list_users()
            if not rows:
                print("(no users)")
                return
            print(f"{'#':>3}  {'name':<24} {'scope':<8} last-seen")
            for r in rows:
                print(f"{r['id']:>3}  {r['username']:<24} {r['scope']:<8} {r.get('last_seen_at') or '-':<24}")
        elif args.sub == "passwd":
            if not args.name:
                print("✗ Usage: vcm user passwd <name>", file=sys.stderr); sys.exit(1)
            pw = args.password or __import__("os").environ.get("VCM_USER_PASSWORD")
            if not pw:
                pw = getpass.getpass("new password: ")
                pw2 = getpass.getpass("confirm:    ")
                if pw != pw2:
                    print("✗ password mismatch", file=sys.stderr); sys.exit(1)
            try:
                u.change_password(args.name, pw)
                print(f"✓ password changed for '{args.name}'")
            except ValueError as e:
                print(f"✗ {e}", file=sys.stderr); sys.exit(1)
        elif args.sub == "delete":
            if not args.name:
                print("✗ Usage: vcm user delete <name>", file=sys.stderr); sys.exit(1)
            u.delete_user(args.name)
            print(f"✓ user '{args.name}' deleted (cascades to tokens)")
        else:
            print(f"✗ unknown user sub-action: {args.sub}", file=sys.stderr); sys.exit(1)

    elif args.action == "token":
        if args.sub == "grant":
            if not args.name:
                print("✗ Usage: vcm token grant <username>", file=sys.stderr); sys.exit(1)
            label = args.label or "cli"
            try:
                tok = u.issue_token(
                    args.name, label=label,
                    scope=args.scope, days=args.days)
                print(f"✓ token issued for '{args.name}' (label='{label}', "
                      f"scope={args.scope or 'inherit'}, days={args.days or 'never'})")
                print("")
                print("  → store this secret safely; it cannot be re-retrieved:")
                print(f"     Authorization: Bearer {tok}")
            except ValueError as e:
                print(f"✗ {e}", file=sys.stderr); sys.exit(1)
        elif args.sub == "revoke":
            if not args.name:
                print("✗ Usage: vcm token revoke <token-id>", file=sys.stderr); sys.exit(1)
            try:
                u.revoke_token(int(args.name))
                print(f"✓ token #{args.name} revoked")
            except ValueError as e:
                print(f"✗ {e}", file=sys.stderr); sys.exit(1)
        elif args.sub == "list":
            rows = u.list_tokens(args.name if args.name else None)
            if not rows:
                print("(no tokens)")
                return
            print(f"{'#':>3}  {'user':<14} {'label':<20} {'scope':<8} last-used")
            for r in rows:
                print(f"{r['id']:>3}  {r['username']:<14} "
                      f"{(r['label'] or '-'):<20} "
                      f"{r['scope']:<8} {r.get('last_used_at') or '-'}")
        else:
            print(f"✗ unknown token sub-action: {args.sub}", file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()
