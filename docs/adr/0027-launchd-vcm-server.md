# ADR-0027 — Persistent vcm-server on macOS via launchd LaunchAgent

**状态**: 已实施（v0.15.0）
**日期**: 2026-08-22
**作者**: mm7 / next-agent
**修订自**: ADR-0025 §"不做 — macOS launchd .plist (v0.14.0)"

## 背景

ADR-0025 (v0.13.0) shipped a systemd **user** unit that wraps
`vcm-server` so it survives logout, reboot, and crashes on Linux.
ADR-0025 explicitly deferred the macOS counterpart:

> ❌ macOS launchd `.plist` (v0.14.0).

The deferral was correct for v0.13.0 (single-OS, single-user
machine), but the project's primary user does the bulk of
vibe-coding on macOS as well as Linux. With v0.14.x shipping
the persistent dashboard + bilingual UI, the macOS gap is
the one place where a `python3 server/app.py &` (or `tmux`)
workaround is genuinely inconvenient: every laptop reboot
loses the dashboard.

macOS has shipped `launchd` since 10.4 (2005); it is the
canonical OS-level supervisor and the equivalent of
`systemd --user`. The user's "Install vibe-coding-mgr
globally" workflow today already runs against `launchd` for
many other tools (Docker Desktop, Raycast, Rectangle) — so
adding one more `LaunchAgent` plist is consistent with the
platform's idiom.

This ADR is the deliberate counterpart of ADR-0025. It does
**not** introduce a new framework, runtime dep, or process
model. It mirrors the same four files (`*.plist` template,
install/uninstall scripts, dry-run smoke test) under the
`scripts/` tree, and reuses the same `~/.vcm/server.env`
contract so operators do not have to remember two
configuration paths.

## 决策

Ship four files (one in `docs/adr/`, three under `scripts/`):

1. **`scripts/vcm-server.plist`** — `launchd` LaunchAgent
   template that runs `vcm-server` from the repo's `.venv`,
   inherits env from `~/.vcm/server.env` via a small wrapper
   shell snippet embedded in `ProgramArguments`, restarts on
   crash via `KeepAlive`, and logs to `~/Library/Logs/vcm-server/`.
2. **`scripts/install-launchd.sh`** — one-shot installer that
   renders the template into
   `~/Library/LaunchAgents/com.vibe-coding-mgr.vcm-server.plist`,
   `launchctl load -w` (load + bootstrap + enable at next
   login), and verifies `/api/health` via curl (with a small
   retry loop, mirroring `install-service.sh`'s §7 pattern).
3. **`scripts/uninstall-launchd.sh`** — counterpart that
   `launchctl unload -w` and removes the plist, preserving
   `~/.vcm/server.env` and any DB files.
4. **`tests/launchd.test.js`** — vitest smoke test (mirrors
   `tests/daemon.test.js`). Asserts the plist contains the
   required launchd keys (`Label`, `ProgramArguments`,
   `RunAtLoad`, `KeepAlive`, `StandardOutPath`,
   `StandardErrorPath`, `WorkingDirectory`), that the
   install script supports `--dry-run`, and that the
   uninstall script preserves the env file.

The plist shares `scripts/vcm-server.env.example` and the
`~/.vcm/server.env` contract with the systemd path. There is
**one** env file; operators do not have to remember two
sources of truth. On macOS the install script just points the
embedded wrapper at the same env file.

### Why launchd, not screen / tmux / nohup

- **`tmux`** survives logout but not reboot. The current
  workaround at HANDOFF §"macOS / Windows" already calls
  this out as a gap.
- **`nohup`** survives logout but not reboot and has no
  crash restart, no log rotation, no status query.
- **A Docker container** runs `vcm-server` but adds a
  runtime dependency (Docker Desktop) and a layering
  inversion (we now ship Python code inside a Linux
  container on a Mac, which is fine but heavier than
  needed for a single-user CLI tool).

launchd is already on every macOS the project supports
(macOS 10.4+); the plist is a single declarative file we
control in-tree, just like the systemd unit. No new
runtime dep, no new framework, no new process model.

### Why a separate script pair (not merge into `install-service.sh`)

- `install-service.sh` does `systemctl --user daemon-reload`,
  `systemctl --user enable --now`, and probes via `systemctl`
  — none of which exist on macOS.
- macOS users do not have `~/.config/systemd/` at all; the
  unit paths differ.
- Mixing the two paths in one script would require an
  `[[ "$OSTYPE" == "darwin"* ]]` branch on every step. Two
  separate scripts are easier to read, audit, and test.

The install scripts share the **port-auto-select** logic
(`ss -tln` on Linux, `lsof -nP -iTCP` on macOS) and the
**env-file-render** logic. Those two helpers are small
enough that duplication is cheaper than abstraction here.

### Plist structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vibe-coding-mgr.vcm-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>@VCM_PYTHON@</string>
    <string>@VCM_REPO_DIR@/server/app.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>@VCM_REPO_DIR@</string>
  <key>EnvironmentVariables</key>
  ... <!-- rendered from ~/.vcm/server.env at install time -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>NetworkState</key>
    <true/>
  </dict>
  <key>StandardOutPath</key>
  <string>@LOG_DIR@/out.log</string>
  <key>StandardErrorPath</key>
  <string>@LOG_DIR@/err.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
```

### Why `EnvironmentVariables` instead of a wrapper script

launchd does not have an `EnvironmentFile=` directive the
way systemd does. Two options:

1. **Wrapper shell script** at `~/.vcm/run-vcm-server.sh`
   that `set -a; source ~/.vcm/server.env; set +a; exec
   /path/to/python /path/to/server/app.py`. The plist's
   `ProgramArguments` calls the wrapper.
2. **Inline `EnvironmentVariables`** in the plist, rendered
   from `~/.vcm/server.env` by the install script.

We pick option 2 because it keeps the operator-visible
artefact count to **two** files (the plist + the env file),
mirroring the systemd path. The env-file → plist transform
is a 12-line `awk`/`sed` in the install script and is
covered by the smoke test.

### Restart policy

- `KeepAlive.SuccessfulExit=false` — restart on crash, but
  not on clean `launchctl stop` or on `SIGTERM`.
- `KeepAlive.NetworkState=true` — also restart when the
  network comes back, mirroring the Linux unit's
  `Wants=network-online.target`.
- `RunAtLoad=true` — start the service immediately when
  `launchctl load -w` is called. `-w` makes the load stick
  across reboots.
- No `ThrottleInterval` (default is 10s on launchd); close
  to the systemd `RestartSec=5s`.

### Log rotation

launchd does not natively rotate log files. macOS provides
`newsyslog` (config at `/etc/newsyslog.conf` or
`/etc/newsyslog.conf.d/`), which is the platform-canonical
rotation tool. We do **not** ship a newsyslog config by
default — operators who want rotation can add
`~/Library/Logs/vcm-server/out.log` to their personal
newsyslog config (or use a global one). For most users
the daily-mount point of macOS is small enough that
hand-rotation is fine.

The plist's `<key>StandardOutPath</key>` points at
`~/Library/Logs/vcm-server/out.log`. The install script
creates the directory if missing.

### Port auto-selection

Mirrors `install-service.sh`'s `pick_free_port()` but uses
`lsof -nP -iTCP -sTCP:LISTEN` instead of `ss`:

```bash
pick_free_port() {
  for p in 7338 7339 ... 7399; do
    if ! lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$p"; return
    fi
  done
  ...
}
```

`lsof` ships with every macOS; no extra dependency. The
chosen port is written into `server.env` (same contract
as the Linux path) so `/api/health` reflects it on first
call.

### Hardening (launchd-equivalent)

launchd does not have an analog to systemd's
`NoNewPrivileges`, `ProtectHome=`, etc. The closest
analogues are:

- `ProcessType=Background` — runs in the user's session
  context (same as the systemd user unit).
- macOS sandbox / App Sandbox is not used here because
  `vcm-server` needs to read the user's `~/.vcm/` (which
  is the only reason for `ProcessType=Background` instead
  of `Interactive`).
- `umask 0077` for log directory creation in the install
  script — same pattern as the systemd unit.

If a future user wants tighter hardening, the `Seatbelt`
profile (macOS sandbox) can be added later as an opt-in
sub-plist key, but v0.15.0 deliberately keeps this simple.

### Verification

```bash
# 1. Plist is well-formed XML and parses as launchd.
plutil -lint scripts/vcm-server.plist     # → "OK"

# 2. Install end-to-end (on a clean macOS user account).
bash scripts/install-launchd.sh
# expected: prints "vcm-server installed: http://127.0.0.1:<port>/"
curl http://127.0.0.1:<port>/api/health | jq -r .status  # → "healthy"

# 3. Survives reboot.
sudo shutdown -r now     # auto-start after boot
#   verify: launchctl list | grep vibe-coding-mgr

# 4. Crash recovery.
kill -9 $(pgrep -f "server/app.py")   # auto-restart within ~10s
launchctl list | grep vibe-coding-mgr # → PID changed

# 5. Uninstall removes the plist but keeps ~/.vcm/server.env.
bash scripts/uninstall-launchd.sh
ls -la ~/Library/LaunchAgents/com.vibe-coding-mgr.vcm-server.plist
# → "No such file or directory"

# 6. Tests:
npm test -- tests/launchd.test.js   # → all passed

# 7. Hard checks:
bash scripts/routine_coverage.sh    # → exit 0
```

### 反对意见

**Q: Doesn't this conflict with ADR-0025's "one canonical install
command" goal?  
A: It splits into **two** install commands (`install-service.sh`
for Linux, `install-launchd.sh` for macOS), but each is canonical
on its platform. The two scripts share the env-file contract and
the uninstall contract, so an operator who switches OSes still
feels the same shape. The alternative (a `bootstrap.sh` that
auto-detects the OS) would add conditional logic to every step
and obscure what is actually a one-line `launchctl load` vs
`systemctl --user enable --now` divergence.

**Q: Why not also add Windows service support?  
A: Out of scope. Windows users currently run `vcm-server` in
WSL (where the Linux instructions work) or fall back to the
manual launch path in ONBOARDING.md. NSSM / WinSW are Windows
counterparts but each has its own quirks; deferring to a
hypothetical v0.16.0 Windows ADR is cheaper than expanding this
one.

**Q: Doesn't launchd's lack of `EnvironmentFile=` mean operators
have to remember a third config path?  
A: No — `~/.vcm/server.env` is the single source of truth on
both platforms. The Linux systemd unit references it via
`EnvironmentFile=`; the macOS plist embeds a snapshot of its
key=value pairs at install time (and re-renders on every
re-install). Operators edit the same file on both platforms.

**Q: What about log rotation?  
A: Defer. macOS provides `newsyslog` but adding a system-level
newsyslog config requires `sudo` and is platform-specific.
Operators who want rotation can wire `newsyslog -p` or use a
homebrew `logrotate` setup. The HANDOFF + README will note this.

**Q: Won't `KeepAlive.SuccessfulExit=false` restart forever if
there's a real bug?  
A: launchd adds a default 10-second `ThrottleInterval`
between restarts. After 5 rapid crashes (the platform's own
backoff, not ours), `launchctl list` shows the agent as
"throttled" and the operator must `launchctl kickstart -k`
to retry. The install script surfaces the journal log path
so operators can diagnose. This is the launchd-equivalent of
ADR-0025's `StartLimitBurst=5`.

### 后果

#### 正面

- macOS users get the same `survives reboot + crashes` guarantee
  Linux users got in v0.13.0.
- One env file, one install command per platform — the
  env-file contract is shared, only the supervisor changes.
- Zero new runtime deps. `plutil` is part of macOS,
  `launchctl` is part of macOS.
- The plist is plain-text, diff-able, review-able in PRs
  (unlike `pm2 save` state or supervisord RPC).
- Idempotent: re-running install with the same paths is a
  no-op (existing plist overwritten; `launchctl unload`
  + `launchctl load -w` reload the agent).
- Port auto-selection handles the same 7338 collision seen
  in Linux development.

#### 负面 / 风险

- macOS-only. Linux users still use `install-service.sh`;
  Windows still falls back to manual launch or WSL.
- Hardening gap: launchd has no `ProtectHome=` analog. We
  rely on macOS's own user-sandbox + umask 0077 for log
  files. If tighter isolation is needed later, add a
  Seatbelt profile in a follow-up ADR.
- `EnvironmentVariables` snapshot is taken at install time,
  so editing `server.env` requires `bash scripts/install-launchd.sh`
  again to refresh the plist. Mitigation: the install script
  always re-renders; the user just needs to know that.

### 验收

```bash
# 1. Plist is parseable.
plutil -lint scripts/vcm-server.plist   # → "OK"

# 2. Smoke test passes on Linux (the test verifies plist shape,
#    install/uninstall script --dry-run, and shared env contract).
npm test -- tests/launchd.test.js      # → all passed

# 3. Hard checks:
bash scripts/routine_coverage.sh       # → exit 0

# 4. ADR-0025 §"不做" line 278 updated to ✅ DONE.
```

### 不做

- ❌ Windows service (out of scope; use WSL or manual launch).
- ❌ newsyslog auto-rotation (operator configures as desired).
- ❌ Multi-instance on macOS (one vcm-server per user per host;
  if you need two, pass `VCM_SERVER_PORT` and use a second
  LaunchAgent label).
- ❌ TLS termination (CHARTER §8; v1.0 concern).
- ❌ gunicorn / waitress deployment (Flask dev server is fine
  for a single-user tool).
- ❌ Apple notarization of the wrapper script (vcm-server is
  installed from source via `npm install`, not distributed as
  a `.app`).
- ❌ Sandboxed Seatbelt profile (v0.16.0 follow-up if needed).

## 参考

- [ADR-0025 persistent vcm-server](0025-persistent-vcm-server.md) —
  the systemd counterpart this mirrors.
- [CHARTER §8](../../CHARTER.md) — local-first, 0 new deps.
- [launchd.plist(5) man page](https://developer.apple.com/library/archive/documentation/Darwin/Reference/ManPages/man5/launchd.plist.5.html) —
  canonical reference for plist keys.
- [Apple TN2083: Daemons and Agents](https://developer.apple.com/library/archive/technotes/tn2083/_index.html) —
  the Background ProcessType + LaunchAgent distinction we follow.
