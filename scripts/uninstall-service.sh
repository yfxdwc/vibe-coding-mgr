#!/usr/bin/env bash
# scripts/uninstall-service.sh — counterpart to install-service.sh
# (ADR-0025). Stops + disables + removes the unit but PRESERVES
# ~/.vcm/server.env and any DB files so a re-install doesn't lose
# operator state.

set -euo pipefail
shopt -s inherit_errexit

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

USER_UNIT_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/vcm-server.service"
ENV_FILE="$HOME/.vcm/server.env"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[uninstall] --dry-run: would stop vcm-server, disable it," \
       "and remove $USER_UNIT_FILE"
  [[ -f "$USER_UNIT_FILE" ]] && echo "  unit file exists: yes"
  echo "  leaving $ENV_FILE intact"
  exit 0
fi

if [[ ! -f "$USER_UNIT_FILE" ]]; then
  echo "[uninstall] no unit file at $USER_UNIT_FILE; nothing to do"
  exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now vcm-server.service 2>&1 || true
  systemctl --user stop vcm-server.service 2>&1 || true
fi

rm -f "$USER_UNIT_FILE"
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload 2>&1 || true
  systemctl --user reset-failed 2>&1 || true
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "[uninstall] preserved env file at $ENV_FILE (chmod 600)"
  echo "             delete manually if you also want to remove config:"
  echo "             rm $ENV_FILE"
fi

# Check whether any vcm-server is still listening.
if command -v ss >/dev/null 2>&1; then
  if ss -tlnH 2>/dev/null \
      | awk '{print $4}' \
      | grep -qE "(127\.0\.0\.1|0\.0\.0\.0|::):7[3-4][0-9][0-9]\$"; then
    echo ""
    echo "WARNING: a process is still listening on a 7xxx port."
    ss -tlnH 2>/dev/null \
      | awk '{print "  -", $4}' \
      | grep -E ":(7[3-4][0-9][0-9])\$" || true
  fi
fi

echo ""
echo "[uninstall] done. Reinstall with:  bash scripts/install-service.sh"
