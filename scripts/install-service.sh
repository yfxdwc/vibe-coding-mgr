#!/usr/bin/env bash
# scripts/install-service.sh — one-shot installer for the vcm-server
# systemd USER unit (ADR-0025).
#
# What it does:
#   1. Verifies systemd is available + the user owns the user systemd dir.
#   2. Picks a free port in 7338..7399 (auto-skip occupied ones).
#   3. Writes ~/.vcm/server.env from scripts/vcm-server.env.example,
#      then injects the chosen VCM_SERVER_PORT.
#   4. Renders scripts/vcm-server.service into
#      ~/.config/systemd/user/vcm-server.service with substituted paths.
#   5. systemctl --user daemon-reload, then enable --now.
#   6. Verifies vcm-server actually serves /api/health via curl.
#   7. Enables loginctl linger so the unit survives logout.
#   8. Prints the last 20 lines of journal entries so the operator
#      sees recent state immediately.
#
# Usage:
#   bash scripts/install-service.sh              # install from CWD or
#                                                # from VCM_REPO env var
#   bash scripts/install-service.sh --dry-run    # do everything except
#                                                # write files / talk to systemd
#   VCM_REPO=/path bash scripts/install-service.sh
#
# This script is idempotent: re-running it with the same paths
# performs the same unit enable+start as the first run.

set -euo pipefail
shopt -s inherit_errexit

# --- args -----------------------------------------------------------------
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# --- locate repo + python ------------------------------------------------
REPO_DIR="${VCM_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
VENV_PY="$REPO_DIR/.venv/bin/python3"
[[ -x "$VENV_PY" ]] || {
  echo "ERROR: $VENV_PY not found or not executable." >&2
  echo "Run 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt' first." >&2
  exit 1
}

UNIT_TEMPLATE="$REPO_DIR/scripts/vcm-server.service"
ENV_TEMPLATE="$REPO_DIR/scripts/vcm-server.env.example"
[[ -f "$UNIT_TEMPLATE" ]] || { echo "ERROR: $UNIT_TEMPLATE missing" >&2; exit 1; }
[[ -f "$ENV_TEMPLATE" ]]   || { echo "ERROR: $ENV_TEMPLATE missing" >&2; exit 1; }

USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
USER_UNIT_FILE="$USER_UNIT_DIR/vcm-server.service"
ENV_FILE="${HOME}/.vcm/server.env"

# --- preflight ------------------------------------------------------------
if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl not found. This installer requires systemd." >&2
  echo "On macOS / Windows, see ONBOARDING.md for the manual launch path." >&2
  exit 1
fi
if [[ ! -d "$HOME/.config/systemd" ]]; then
  echo "ERROR: $HOME/.config/systemd does not exist. Are you running with a real systemd user instance?" >&2
  exit 1
fi

# --- choose free port ----------------------------------------------------
pick_free_port() {
  # Returns first port in 7338..7399 that nobody is LISTENing on for
  # either TCP4 or TCP6 on 127.0.0.1. We don't care about remote-bind
  # because the Flask app default-hosts on 127.0.0.1.
  for p in 7338 7339 7340 7341 7342 7343 7344 7345 7346 7347 \
           7348 7349 7350 7351 7352 7353 7354 7355 7356 7357 \
           7358 7359 7360 7361 7362 7363 7364 7365 7366 7367 \
           7368 7369 7370 7371 7372 7373 7374 7375 7376 7377 \
           7378 7379 7380 7381 7382 7383 7384 7385 7386 7387 \
           7388 7389 7390 7391 7392 7393 7394 7395 7396 7397 \
           7398 7399; do
    if ! ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE "(127\.0\.0\.1|::1|0\.0\.0\.0|::):$p\$"; then
      echo "$p"; return
    fi
  done
  echo "ERROR: no free port in 7338..7399" >&2; return 1
}
PORT="$(pick_free_port)"

# --- render env file (if missing) ----------------------------------------
write_env() {
  mkdir -p "${HOME}/.vcm" || true
  if [[ -f "$ENV_FILE" && $DRY_RUN -eq 0 ]]; then
    echo "[install] ENV file already exists at $ENV_FILE (preserving overrides)"
    # Update only the port so the unit + env stay coherent
    if grep -qE '^#?[ ]*VCM_SERVER_PORT=' "$ENV_FILE"; then
      sed -i.bak -E "s/^#?[ ]*VCM_SERVER_PORT=.*/VCM_SERVER_PORT=$PORT/" "$ENV_FILE"
      rm -f "$ENV_FILE.bak"
    else
      printf '\nVCM_SERVER_PORT=%s\n' "$PORT" >> "$ENV_FILE"
    fi
  else
    cp "$ENV_TEMPLATE" "$ENV_FILE.tmp"
    sed -i -E "s/^#?[ ]*VCM_SERVER_PORT=.*/VCM_SERVER_PORT=$PORT/" "$ENV_FILE.tmp"
    if [[ $DRY_RUN -eq 0 ]]; then
      mv "$ENV_FILE.tmp" "$ENV_FILE"
      chmod 600 "$ENV_FILE"
    else
      cat "$ENV_FILE.tmp"
      rm -f "$ENV_FILE.tmp"
    fi
  fi
}

# --- render unit file -----------------------------------------------------
write_unit() {
  local rendered
  rendered="$(sed \
    -e "s|@VCM_REPO_DIR@|$REPO_DIR|g" \
    -e "s|@VCM_PYTHON@|$VENV_PY|g" \
    -e "s|@VCM_ENV_FILE@|$ENV_FILE|g" \
    "$UNIT_TEMPLATE")"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "--- DRY RUN: would write $USER_UNIT_FILE ---"
    echo "$rendered"
    echo "--- end ---"
    return
  fi
  mkdir -p "$USER_UNIT_DIR"
  printf '%s\n' "$rendered" > "$USER_UNIT_FILE"
  chmod 644 "$USER_UNIT_FILE"
}

# --- main ----------------------------------------------------------------
echo "[install] repo:    $REPO_DIR"
echo "[install] python:  $VENV_PY"
echo "[install] env:     $ENV_FILE"
echo "[install] unit:    $USER_UNIT_FILE"

write_env
write_unit

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[install] --dry-run: skipping systemctl + loginctl + curl"
  echo "would install at: http://127.0.0.1:$PORT/"
  exit 0
fi

# Reload user systemd to pick up the new unit, then enable + start.
systemctl --user daemon-reload
systemctl --user enable vcm-server.service
systemctl --user restart vcm-server.service

# Best-effort: enable linger so the unit survives logout.
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" 2>/dev/null || true
fi

# Verify the server is actually serving.
sleep 1
if curl -s --max-time 3 "http://127.0.0.1:$PORT/api/health" \
   | grep -q '"status":"ok"'; then
  printf '\nvcm-server installed: http://127.0.0.1:%s/\n\n' "$PORT"
  echo "  - status: systemctl --user status vcm-server"
  echo "  - logs:   journalctl --user -u vcm-server -n 20 -f"
  echo "  - stop:   systemctl --user stop vcm-server"
  echo "  - remove: bash scripts/uninstall-service.sh"
  echo ""
  echo "Last 20 log lines:"
  journalctl --user -u vcm-server -n 20 --no-pager 2>&1 \
    | sed 's/^/    /'
else
  echo "" >&2
  echo "WARNING: vcm-server is registered but /api/health did not return {\"status\":\"ok\"}." >&2
  echo "Check: journalctl --user -u vcm-server -n 50" >&2
  exit 1
fi
