#!/usr/bin/env python3
# check_data_layout.py — Required file presence
import sys
import os
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()

# For vcm projects, the minimum layout is:
#   AGENTS.md
#   CHARTER.md
#   README.md
#   .gitignore
REQUIRED = ["AGENTS.md", "CHARTER.md", "README.md", ".gitignore"]


def main():
    missing = [f for f in REQUIRED if not (ROOT / f).exists()]
    if missing:
        print(f"  ⚠ Missing recommended files: {', '.join(missing)}")
        # Not a hard fail — let user decide
        return 0
    print(f"  ✓ All {len(REQUIRED)} recommended files present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
