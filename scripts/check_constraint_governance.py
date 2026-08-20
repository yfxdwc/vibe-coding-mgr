#!/usr/bin/env python3
# check_constraint_governance.py — Constraint governance
import sys
import os
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()


def main():
    # Check that constraints are documented somewhere (AGENTS.md, CHARTER.md, or docs/)
    has_agents = (ROOT / "AGENTS.md").exists()
    has_charter = (ROOT / "CHARTER.md").exists()
    if not (has_agents or has_charter):
        print(f"  ✗ No AGENTS.md or CHARTER.md — constraints not documented")
        return 1
    print(f"  ✓ Constraints documented (AGENTS.md={has_agents}, CHARTER.md={has_charter})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
