#!/usr/bin/env bash
# routine_coverage.sh — driver for vcm's 7 hard checks (6 + skill registry).
# Local-friendly version (no biweekly report generation).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || exit 1

PY="${PY:-python3}"
export VCM_ROOT="${VCM_ROOT:-$ROOT}"

CHECKS=(
  "check_charter.py"
  "check_doc_drift.py"
  "check_constraint_governance.py"
  "check_adr_index.py"
  "check_data_layout.py"
  "check_skills.py"
)

EXIT=0
for script in "${CHECKS[@]}"; do
  echo "--- $script ---"
  if ! out=$($PY scripts/$script --no-fail 2>&1); then
    echo "  ✗ FAIL: $script"
    EXIT=1
  else
    echo "$out"
  fi
done

echo ""
echo "[routine_coverage] done, exit=$EXIT"
exit $EXIT
