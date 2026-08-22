#!/usr/bin/env bash
# scripts/install-launchd.sh — one-shot installer for the vcm-server
# launchd LaunchAgent (ADR-0027).
#
# What it does:
#   1. Verifies launchd is available (macOS only — exits on Linux).
#   2. Picks a free port in 7338..7399 via lsof.
#   3. Writes ~/.vcm/server.env from scripts/vcm-server.env.example,
#      then injects the chosen VCM_SERVER_PORT.
#   4. Renders scripts/vcm-server.plist into
#      ~/Library/LaunchAgents/com.vibe-coding-mgr.vcm-server.plist
#      with substituted paths AND an EnvironmentVariables block
#      snapshot of ~/.vcm/server.env.
#   5. launchctl unload -w (idempotent) + launchctl load -w.
#   6. Verifies /api/health via curl with a small retry loop
#      (mirrors install-service.sh §7 pattern).
#   7. Prints the install path + recent log lines so the operator
#      sees state immediately.
#
# Usage:
#   bash scripts/install-launchd.sh              # install
#   bash scripts/install-launchd.sh --dry-run    # do everything except
#                                                 # write files / talk to launchd
#   VCM_REPO=/path bash scripts/install-launchd.sh
#
# This script is idempotent: re-running it overwrites the plist
# and re-loads the agent. Existing ~/.vcm/server.env overrides
# are preserved (only VCM_SERVER_PORT is rewritten).

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

PLIST_TEMPLATE="$REPO_DIR/scripts/vcm-server.plist"
ENV_TEMPLATE="$REPO_DIR/scripts/vcm-server.env.example"
[[ -f "$PLIST_TEMPLATE" ]] || { echo "ERROR: $PLIST_TEMPLATE missing" >&2; exit 1; }
[[ -f "$ENV_TEMPLATE"  ]] || { echo "ERROR: $ENV_TEMPLATE missing"  >&2; exit 1; }

LABEL="com.vibe-coding-mgr.vcm-server"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENTS_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/vcm-server"
ENV_FILE="$HOME/.vcm/server.env"

# --- preflight (skipped in --dry-run so Linux CI can render plists) ----
# --dry-run is for validating plist rendering + env-file writing without
# talking to launchd. Operators on Linux CI use it to smoke-test that the
# template parses; the actual launchctl / lsof preflight only runs when
# we are about to mutate the OS.
if [[ $DRY_RUN -eq 0 ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "ERROR: this installer requires macOS (launchd)." >&2
    echo "On Linux use scripts/install-service.sh (systemd user unit, ADR-0025)." >&2
    exit 1
  fi
  if ! command -v launchctl >/dev/null 2>&1; then
    echo "ERROR: launchctl not found. Is this really macOS?" >&2
    exit 1
  fi
  if ! command -v lsof >/dev/null 2>&1; then
    echo "ERROR: lsof not found. Required for port auto-select." >&2
    exit 1
  fi
fi

# --- choose free port ----------------------------------------------------
pick_free_port() {
  for p in 7338 7339 7340 7341 7342 7343 7344 7345 7346 7347 \
           7348 7349 7350 7351 7352 7353 7354 7355 7356 7357 \
           7358 7359 7360 7361 7362 7363 7364 7365 7366 7367 \
           7368 7369 7370 7371 7372 7373 7374 7375 7376 7377 \
           7378 7379 7380 7381 7382 7383 7384 7385 7386 7387 \
           7388 7389 7390 7391 7392 7393 7394 7395 7396 7397 \
           7398 7399; do
    if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$p"; return
    fi
  done
  echo "ERROR: no free port in 7338..7399" >&2; return 1
}
PORT="$(pick_free_port)"

# --- render env file (if missing or portless) ----------------------------
write_env() {
  mkdir -p "${HOME}/.vcm" || true
  if [[ -f "$ENV_FILE" ]]; then
    echo "[install] ENV file already exists at $ENV_FILE (preserving overrides)"
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

# --- render plist --------------------------------------------------------
#
# Two things happen:
#   1. Replace path/port markers (@VCM_REPO_DIR@, @VCM_PYTHON@, etc.).
#   2. Expand the EnvironmentVariables dict with key=value snapshots
#      from ~/.vcm/server.env so launchd can launch the agent
#      without sourcing the env file (launchd has no analog to
#      systemd's EnvironmentFile=).
write_plist() {
  local rendered
  rendered="$(sed \
    -e "s|@VCM_REPO_DIR@|$REPO_DIR|g" \
    -e "s|@VCM_PYTHON@|$VENV_PY|g" \
    -e "s|@LOG_DIR@|$LOG_DIR|g" \
    -e "s|@VCM_PORT@|$PORT|g" \
    "$PLIST_TEMPLATE")"

  # Snapshot the env file into <key>VCM_*</key><string>VALUE</string>
  # pairs. Only keys starting with VCM_ are forwarded; comments and
  # blank lines are skipped; values are XML-escaped.
  if [[ -f "$ENV_FILE" ]]; then
    local env_block=""
    while IFS= read -r line; do
      # Strip comments + blank lines.
      line="${line%%#*}"
      line="$(echo "$line" | xargs)"   # trim whitespace
      [[ -z "$line" ]] && continue
      [[ "$line" =~ ^VCM_[A-Z0-9_]+= ]] || continue
      local key="${line%%=*}"
      local val="${line#*=}"
      # XML-escape ampersands + angle brackets in the value.
      val="${val//&/&amp;}"
      val="${val//</&lt;}"
      val="${val//>/&gt;}"
      env_block+=$'\n    <key>'"$key"'</key>\n    <string>'"$val"'</string>'
    done < "$ENV_FILE"
    # Insert the env block immediately after the literal
    # placeholder we put in the template; if no placeholder exists
    # (older template), append at end of dict.
    if grep -q '</dict>' <<< "$rendered" && grep -q '<key>EnvironmentVariables</key>' <<< "$rendered"; then
      # Replace the existing <dict>...</dict> block right after
      # <key>EnvironmentVariables</key> with our expanded block.
      # The template ships with a single placeholder dict
      # containing only VCM_SERVER_PORT; we rewrite it entirely.
      local ph_re='<key>EnvironmentVariables</key>[[:space:]]*<dict>[[:space:]]*<key>VCM_SERVER_PORT</key>[[:space:]]*<string>[^<]*</string>[[:space:]]*</dict>'
      rendered="$(awk -v block="$env_block" '
        BEGIN { replaced = 0 }
        {
          if (replaced == 0 && match($0, /<key>EnvironmentVariables<\/key>[[:space:]]*<dict>[[:space:]]*<key>VCM_SERVER_PORT<\/key>/)) {
            print "    <key>EnvironmentVariables</key>"
            print "    <dict>"
            print block
            print "    </dict>"
            replaced = 1
            next
          }
          print
        }' <<< "$rendered")"
    fi
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "--- DRY RUN: would write $PLIST_FILE ---"
    echo "$rendered"
    echo "--- end ---"
    return
  fi

  mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"
  chmod 700 "$LOG_DIR"
  printf '%s\n' "$rendered" > "$PLIST_FILE"
  chmod 644 "$PLIST_FILE"
}

# --- main ----------------------------------------------------------------
echo "[install] repo:    $REPO_DIR"
echo "[install] python:  $VENV_PY"
echo "[install] env:     $ENV_FILE"
echo "[install] plist:   $PLIST_FILE"
echo "[install] logs:    $LOG_DIR"

write_env
write_plist

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[install] --dry-run: skipping launchctl + curl"
  echo "would install at: http://127.0.0.1:$PORT/"
  exit 0
fi

# Validate the rendered plist with plutil before launchctl touches it.
# plutil is macOS-bundled and a hard pre-flight: a malformed plist
# would otherwise be silently rejected by launchctl.
if ! plutil -lint "$PLIST_FILE" >/dev/null; then
  echo "ERROR: rendered plist failed plutil -lint; aborting." >&2
  echo "Inspect $PLIST_FILE and re-run." >&2
  exit 1
fi

# Idempotent: unload any existing instance, then load the new plist.
# launchctl bootout/load is the modern (macOS 11+) path; bootout
# silently fails if the agent is not loaded, which is fine.
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_FILE" 2>/dev/null || \
  launchctl load -w "$PLIST_FILE"
launchctl enable "gui/$UID_NUM/$LABEL" 2>/dev/null || \
  launchctl load -w "$PLIST_FILE"
launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true

# Verify the server is actually serving. launchd marks the agent
# loaded BEFORE the in-process Flask bind() finishes + the schema
# bootstrap + audit-log dir creation complete, so a single 3s curl
# probe too often races. We retry for up to 5s (10 attempts × 0.5s)
# and only fail if EVERY retry timed out.
_wait_for_health() {
  local url="$1"
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    local body
    body=$(curl -s --max-time 1 "$url" 2>/dev/null || true)
    if printf '%s' "$body" | grep -qE '"status"[[:space:]]*:[[:space:]]*"(ok|healthy)"'; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if _wait_for_health "http://127.0.0.1:$PORT/api/health"; then
  printf '\nvcm-server installed: http://127.0.0.1:%s/\n\n' "$PORT"
  echo "  - status: launchctl list | grep $LABEL"
  echo "  - logs:   tail -f $LOG_DIR/err.log"
  echo "  - stop:   launchctl bootout gui/\$(id -u)/$LABEL"
  echo "  - remove: bash scripts/uninstall-launchd.sh"
  echo ""
  echo "Last 20 log lines (err.log):"
  tail -20 "$LOG_DIR/err.log" 2>&1 | sed 's/^/    /' || true
  exit 0
fi

# Could not reach /api/health in ~5s. Show the actual agent state.
agent_state=$(launchctl list 2>&1 | grep "$LABEL" || echo "(no $LABEL agent listed)")
echo "" >&2
echo "WARNING: launchd agent is loaded but /api/health did not return healthy in ~5s." >&2
echo "Agent state:" >&2
echo "  $agent_state" >&2
echo "Diagnose with:" >&2
echo "  tail -50 $LOG_DIR/err.log" >&2
echo "  launchctl print gui/\$(id -u)/$LABEL" >&2
echo "  curl -v http://127.0.0.1:$PORT/api/health" >&2
# Don't fail; the agent might be slow first boot (idempotent install
# should not regress working setups).
exit 0
