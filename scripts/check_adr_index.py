#!/usr/bin/env python3
# check_adr_index.py — ADR numbering integrity
import sys
import os
import re
from pathlib import Path
from collections import Counter

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()


def main():
    adr_dir = ROOT / "docs" / "adr"
    if not adr_dir.exists():
        print(f"  ⚠ No docs/adr/ — no ADRs to check")
        return 0
    numbers = []
    for f in adr_dir.glob("*.md"):
        if f.name == "INDEX.md":
            continue
        m = re.match(r"^(\d{4})-", f.name)
        if m:
            numbers.append(m.group(1))
    counter = Counter(numbers)
    dupes = [n for n, c in counter.items() if c > 1]
    if dupes:
        print(f"  ✗ Duplicate ADR numbers: {', '.join(dupes)}")
        return 1
    print(f"  ✓ {len(numbers)} ADRs, all unique")
    return 0


if __name__ == "__main__":
    sys.exit(main())
