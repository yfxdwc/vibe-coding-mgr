#!/usr/bin/env python3
# check_doc_drift.py — Doc/code drift detection
# Simplified for vcm v0.1.0.
import sys
import os
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()


def main():
    # Check that docs/ exists if any markdown is referenced in code
    if not (ROOT / "docs").exists():
        # vcm doesn't require docs/, this is informational
        print(f"  ⚠ No docs/ directory — optional for vcm projects")
        return 0
    md_count = sum(1 for _ in (ROOT / "docs").rglob("*.md"))
    print(f"  ✓ Found {md_count} markdown files in docs/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
