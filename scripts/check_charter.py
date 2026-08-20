#!/usr/bin/env python3
# check_charter.py — CHARTER §9 enforcement
# Vendored from sales-ai/scripts/check_charter.py, parameterized for vcm.
import sys
import os
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()
REQUIRED = ["AGENTS.md", "CHARTER.md", "README.md"]


def main():
    missing = [f for f in REQUIRED if not (ROOT / f).exists()]
    if missing:
        print(f"  ✗ Missing required files: {', '.join(missing)}")
        return 1
    print(f"  ✓ All {len(REQUIRED)} required files present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
