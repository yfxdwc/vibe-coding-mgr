#!/usr/bin/env python3
# check_db_schema.py — ADR-0031: assert service db has 4 expected tables.
# 7th hard check (alongside the original 6). DB path truth source is
# VCM_SERVER_DB env (default <repo>/server/vcm.db), matching
# server/app.py:40 and server/dashboard.py:12.
import sys
import os
import sqlite3
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()
DB = Path(os.environ.get("VCM_SERVER_DB", str(ROOT / "server" / "vcm.db")))

# 4 expected tables. ADR-0007 says "DB is the single source of truth" —
# these are the tables vcm-server code assumes exist.
EXPECTED = ["projects", "states", "users", "tokens"]


def main():
    if not DB.exists():
        print(f"  ✗ DB file missing: {DB}")
        return 1
    try:
        conn = sqlite3.connect(str(DB))
        present = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
    except sqlite3.DatabaseError as e:
        print(f"  ✗ DB at {DB} is corrupt: {e}")
        return 1

    missing = [t for t in EXPECTED if t not in present]
    extra = sorted(present - set(EXPECTED))

    if missing:
        print(f"  ✗ DB {DB} missing tables: {missing}")
        print(f"    present: {sorted(present)}")
        return 1

    suffix = f"; extras: {extra}" if extra else ""
    print(f"  ✓ DB {DB} OK ({len(EXPECTED)}/4 tables present){suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())