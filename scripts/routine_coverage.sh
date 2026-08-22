#!/usr/bin/env bash
# routine_coverage.sh — driver for vcm's 7 hard checks.
# ADR-0031 added check_db_schema.py (7th). Local-friendly version
# (no biweekly report generation).

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
  "check_db_schema.py"
  "check_skills.py"
)

EXIT=0
for script in "${CHECKS[@]}"; do
  echo "--- $script ---"
  if ! out=$($PY scripts/$script --no-fail 2>&1); then
    echo "  ✗ FAIL: $script (exit=$?)"
    # v0.18.4 fix: print the captured output so the CI failure log
    # surfaces the actual error message instead of just 'FAIL'.
    # Without this, check_skills.py and similar non-print-on-failure
    # checks had no actionable diagnostic in CI logs.
    [ -n "$out" ] && echo "$out" | sed 's/^/    | /'
    EXIT=1
  else
    echo "$out"
  fi
done

# ADR-0031 §4: forbid accidental root-db creation. Warn-only.
echo "--- check_db_path_grep ---"
hits=$(grep -rnE "sqlite3\.connect\(['\"]vcm\.db" \
       --include='*.py' --include='*.js' "$ROOT/bin" "$ROOT/lib" "$ROOT/server" 2>/dev/null \
       | grep -v "server/vcm.db" || true)
if [ -n "$hits" ]; then
  echo "  ⚠ Found relative-path sqlite3.connect('vcm.db') calls:"
  echo "$hits" | sed 's/^/    /'
  echo "  → Use VCM_SERVER_DB or absolute path to server/vcm.db"
else
  echo "  ✓ No stray 'vcm.db' sqlite3.connect calls"
fi

echo ""
echo "[routine_coverage] done, exit=$EXIT"
exit $EXIT
