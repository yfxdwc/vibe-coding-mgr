#!/usr/bin/env bash
# scripts/uninstall-launchd.sh — counterpart to install-launchd.sh
# (ADR-0027). Stops + unloads + removes the launchd LaunchAgent
# but PRESERVES ~/.vcm/server.env and any DB files so a re-install
# doesn't lose operator state.

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

LABEL="com.vibe-coding-mgr.vcm-server"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"
ENV_FILE="$HOME/.vcm/server.env"
LOG_DIR="$HOME/Library/Logs/vcm-server"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[uninstall] --dry-run: would unload $LABEL, remove $PLIST_FILE,"
  echo "             and leave $ENV_FILE + $LOG_DIR intact"
  [[ -f "$PLIST_FILE" ]] && echo "  plist exists: yes"
  echo "  Reinstall with:  bash scripts/install-launchd.sh"
  exit 0
fi

# Preflight only runs in real-uninstall mode; --dry-run skips it so
# Linux CI can validate the script shape without launchd.
if [[ $DRY_RUN -eq 0 ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "[uninstall] this script requires macOS (launchd)." >&2
    echo "On Linux use scripts/uninstall-service.sh." >&2
    exit 1
  fi
fi

if [[ ! -f "$PLIST_FILE" ]]; then
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  plist exists: no (would skip uninstall)"
    echo "  Reinstall with:  bash scripts/install-launchd.sh"
  fi
  echo "[uninstall] no plist at $PLIST_FILE; nothing to do"
  exit 0
fi

if command -v launchctl >/dev/null 2>&1; then
  UID_NUM="$(id -u)"
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>&1 || true
  # Fallback for older macOS that doesn't have bootout.
  launchctl unload -w "$PLIST_FILE" 2>&1 || true
fi

rm -f "$PLIST_FILE"

if [[ -f "$ENV_FILE" ]]; then
  echo "[uninstall] preserved env file at $ENV_FILE (chmod 600)"
  echo "             delete manually if you also want to remove config:"
  echo "             rm $ENV_FILE"
fi
if [[ -d "$LOG_DIR" ]]; then
  echo "[uninstall] preserved log dir at $LOG_DIR"
  echo "             delete manually with: rm -rf $LOG_DIR"
fi

# Check whether any vcm-server is still listening.
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
      | awk '{print $9}' \
      | grep -qE ":(7[3-4][0-9][0-9])$"; then
    echo ""
    echo "WARNING: a process is still listening on a 7xxx port:"
    lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
      | awk '{print "  -", $1, $9}' \
      | grep -E ":(7[3-4][0-9][0-9])$" || true
  fi
fi

echo ""
echo "[uninstall] done. Reinstall with:  bash scripts/install-launchd.sh"
