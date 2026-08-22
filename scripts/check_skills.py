#!/usr/bin/env python3
# check_skills.py — vcm's 7th hard check (SKILL.md registry integrity).
# Closes CHARTER §10 "三项全满足" requirement: every hard constraint
# must have (1) SKILL.md, (2) ADR number, (3) CI guard. This script
# is the (3).
#
# Banned-words regex MUST match sales-ai/.pi/skills/skill-authoring/SKILL.md
# §3 — keep both in sync.
import sys
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()

SKILLS_INDEX = ROOT / "docs" / "SKILLS.md"
SKILLS_DIR = ROOT / "docs" / "skills"
ADR_DIR = ROOT / "docs" / "adr"

# Banned words — must match sales-ai skill-authoring §3.
# Negative-lookahead variants: 系统(?!化) means "系统" alone is banned but "系统化" is OK.
BANNED_RE = re.compile(r"通用|最佳实践|总结|全局|整体|一切|所有|完整|系统(?!化)|架构(?!边界)")

REQUIRED_FRONTMATTER = ["name", "description", "tags"]


def parse_frontmatter(text):
    """Extract YAML frontmatter from a SKILL.md as a dict.

    Tolerant parser: handles 3-4 line minimal cases without PyYAML.
    Returns dict of {key: value} or {} if no frontmatter.
    """
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}
    body = m.group(1)
    result = {}
    for line in body.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            result[key] = value
    return result


def extract_skill_paths_from_index(index_text):
    """Pull skill paths from docs/SKILLS.md markdown table column 5.

    The table format is: `| [name](skills/<name>/SKILL.md) | ... |`
    Extract the path inside the link.
    """
    paths = set()
    for m in re.finditer(r"\]\((skills/[a-z0-9-]+/SKILL\.md)\)", index_text):
        paths.add(m.group(1))
    return sorted(paths)


def check_frontmatter(path):
    """Return (ok: bool, errors: list[str])."""
    errors = []
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if not fm:
        errors.append("no YAML frontmatter")
        return False, errors

    for key in REQUIRED_FRONTMATTER:
        if key not in fm:
            errors.append(f"missing frontmatter key: {key}")

    desc = fm.get("description", "")
    if not (30 <= len(desc) <= 200):
        errors.append(f"description length {len(desc)} not in [30, 200]")

    if BANNED_RE.search(desc):
        matched = BANNED_RE.search(desc).group(0)
        errors.append(f"description contains banned word: {matched}")

    name = fm.get("name", "")
    if not re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", name) or len(name) < 3:
        errors.append(f"name '{name}' does not match slug pattern")

    # authority + canonical_ref check
    authority = fm.get("authority", "")
    canonical_ref = fm.get("canonical_ref", "")
    if authority == "execution-index" and not canonical_ref:
        errors.append("authority=execution-index requires canonical_ref")
    if canonical_ref:
        # Resolve relative to skill file location
        # skills/<name>/SKILL.md -> ../../<canonical_ref>
        ref_path = (path.parent / canonical_ref).resolve()
        if not ref_path.exists():
            errors.append(f"canonical_ref points to missing file: {ref_path}")

    return (len(errors) == 0), errors


def main():
    failures = []

    # 1. docs/SKILLS.md must exist
    if not SKILLS_INDEX.exists():
        print(f"  ✗ Missing required file: {SKILLS_INDEX.relative_to(ROOT)}")
        return 1
    print(f"  ✓ {SKILLS_INDEX.relative_to(ROOT)} present")

    # 2. Extract paths from index
    index_text = SKILLS_INDEX.read_text(encoding="utf-8")
    indexed = extract_skill_paths_from_index(index_text)
    if not indexed:
        print("  ✗ No skill rows found in docs/SKILLS.md")
        return 1
    print(f"  ✓ docs/SKILLS.md references {len(indexed)} skills")

    # 3. Each indexed path must resolve to a real SKILL.md
    actual = set()
    for rel in indexed:
        abs_path = ROOT / "docs" / rel
        if not abs_path.exists():
            failures.append(f"indexed skill missing on disk: {rel}")
            continue
        actual.add(rel)
        ok, errors = check_frontmatter(abs_path)
        if not ok:
            failures.append(f"{rel}: {'; '.join(errors)}")

    # 4. Each on-disk SKILL.md must be referenced in the index
    on_disk = set()
    if SKILLS_DIR.exists():
        for f in SKILLS_DIR.rglob("SKILL.md"):
            rel = str(f.relative_to(ROOT / "docs"))
            on_disk.add(rel)
    orphaned = on_disk - actual
    if orphaned:
        failures.append(
            f"{len(orphaned)} skill(s) on disk but not in index: {sorted(orphaned)}"
        )

    if failures:
        for f in failures:
            print(f"  ✗ {f}")
        return 1

    print(f"  ✓ All {len(actual)} skills pass frontmatter / banned-words / canonical_ref")
    return 0


if __name__ == "__main__":
    sys.exit(main())
