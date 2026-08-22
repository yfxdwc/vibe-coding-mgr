# ADR-0025 — Persistent vcm-server via systemd user unit

**状态**: 已实施（v0.13.0）
**日期**: 2026-08-21
**作者**: mm7 / next-agent

## 背景

v0.12.0 ships server functionality that is genuinely useful only
when the server is reachable:

- ADR-0020 (docs full-text search) — the `/docs` viewer's "search"
  button needs `/api/docs/search`.
- ADR-0021 (MCP-HTTP) — shared dashboards for Claude / Codex need
  a long-lived `POST /mcp` endpoint.
- ADR-0022 (peer gossip) + ADR-0023 (cross-server marketplace) —
  the `?scope=all` flag on `/api/peer/registry` only makes sense
  if vcm-server is running long enough for another server's
  gossip fetch to complete.
- ADR-0024 (`/api/audit/facets`) — the chip row re-queries the
  facet endpoint whenever the filter changes.

Until v0.13.0 the only way to run `vcm-server` was:

```bash
.venv/bin/python3 server/app.py   # binds 127.0.0.1:7338 by default
```

That breaks whenever the parent shell exits (closing the laptop lid,
closing the SSH session, switching windows). There is no machine-boot
recovery, no crash restart, no journal logging.

ADR-0022's "后果 → 正面" includes the line

> **No background threads, no daemon complexity.**

That was a deliberate decision about vcm-server's *in-process*
architecture: no `threading.Thread(daemon=True)`, no in-memory
goroutines looping forever. The server is a request/response HTTP
daemon — when no requests are coming in, it does literally nothing.

**This ADR is the deliberate counter-decision at a different
level**: the OS-level supervisor that wraps vcm-server can be a
daemon (restart on crash, restart on boot, journal logs), without
compromising ADR-0022's "in-process simplicity." The daemon is
*around* the process, not *inside* it. The Flask app still does
only what HTTP requests ask it to do.

## 决策

Ship four things:

1. **`scripts/vcm-server.service`** — a systemd user unit template
   that runs `vcm-server` from the repo's `.venv`, reads env from
   a separate file, restarts on failure with a 5-second backoff,
   and logs to the user journal.
2. **`scripts/vcm-server.env.example`** — an example env-file
   template (in-repo, declarative only; the actual `server.env`
   lives in `~/.vcm/`, gitignored).
3. **`scripts/install-service.sh`** — one-shot installer that
   picks a free port (7338 first, then 7339..7399 if busy),
   writes `~/.config/systemd/user/vcm-server.service` with
   substituted paths, writes `~/.vcm/server.env` from the
   template, runs `systemctl --user daemon-reload`, then
   `enable --now`. Idempotent: re-running with the same args
   is a no-op; re-running with a different repo path is a
   reinstall.
4. **`scripts/uninstall-service.sh`** — counterpart that stops,
   disables, and removes the unit (keeps `server.env` + the DB
   intact so a re-install doesn't lose state).

Plus **`tests/daemon.test.js`** — a vitest smoke test that
verifies the .service file ships with the required directives
(`Type=`, `ExecStart=`, `Restart=`, `EnvironmentFile=`,
`WantedBy=`), and that `install-service.sh` accepts `--dry-run`
without performing side effects.

### Why systemd **user** unit, not system

- No `sudo` / root required (CHARTER §1: keep installation cheap).
- Per-developer isolation. Two developers on the same host each
  have their own vcm-server on a different port, fully isolated.
- `loginctl enable-linger $USER` makes it survive logout
  (user-1 systemd call, not system-1).
- The unit file lives in
  `~/.config/systemd/user/vcm-server.service`, XDG-compliant.

### Why not pm2 / supervisord / forever

- `pm2` and `forever` are Node-only; vcm-server is a Python
  process. Introducing one would be the first Node tool vcm
  uses to manage a Python process — a layering violation.
- `supervisord` requires `pip install supervisor` + a separate
  config file in `/etc/supervisor/conf.d/`. Adds a runtime
  dependency that isn't currently in the vcm repo
  (CHARTER §8).
- systemd is already on every modern Linux that vcm-server
  targets. Zero new deps. The `.service` file IS the manifest.

### Why not macOS launchd / Windows service

- **Out of scope** for v0.13.0. The project's pre-flight
  environment is Linux (HANDOFF §16 user-base is Linux-first).
- Adding a launchd plist doubles the surface area for each
  change; v0.14.0 can ship `vcm-server.plist` if needed.
- Workaround for now: macOS users run `vcm-server` under a
  user-side `tmux` session (documented in `ONBOARDING.md`).

### Environment isolation

- `~/.vcm/server.env` (gitignored). Holds `VCM_SERVER_PORT`,
  `VCM_SERVER_DB`, `VCM_AUDIT_LOG`, and optional auth vars.
- The `.service` file references it via `EnvironmentFile=`.
  The install script generates this file from
  `scripts/vcm-server.env.example` if it doesn't exist.
- `server.env` is `chmod 600` after write (audit log + DB path
  leak is real).

### Port auto-selection

- Default `VCM_SERVER_PORT=7338` matches the Flask app default.
- The install script tests each port from 7338..7399 via
  `ss -tln` and picks the first one that has no listener.
  This avoids the repowise-on-7338 collision seen in
  development (the user's machine had repowise holding 7338;
  install dropped vcm-server on 7339, no manual surgery).
- The chosen port is recorded in `server.env` and surfaced by
  the install script's success line:
  `vcm-server installed: http://127.0.0.1:7339/`.

### Restart policy

- `Restart=on-failure` (no auto-restart on clean
  `systemctl stop`).
- `RestartSec=5s` (no tight loop).
- `StartLimitBurst=5` + `StartLimitIntervalSec=60s` in the
  `[Unit]` section (NOT `[Service]` — `man systemd.service` says
  those two directives belong in `[Unit]`; systemd 255 silently
  ignores them in `[Service]`, which would defeat the cap. Earlier
  v0.13.0 drafts placed them in `[Service]`; the spec was fixed
  immediately once a live restart surfaced the warning). On 5
  failures in 60s, the unit enters failed state for operator
  inspection — no zombie flap.
- `Type=simple` (Flask dev server has no separate notifier;
  systemd watches the PID).

### Hardening (lightweight)

- `NoNewPrivileges=yes` (don't allow setuid escalation inside).
- `ProtectHome=read-only` (the venv + repo cwd are the only
  writable paths vcm-server needs).
- `PrivateTmp=yes` (separate `/tmp` namespace for the audit
  JSONL if env misconfigured).
- `MemoryDenyWriteExecute=yes` + `LockPersonality=yes` +
  `RestrictRealtime=yes` + `RestrictSUIDSGID=yes` (standard
  hardening from the systemd manual page; if any break
  vcm-server, downgrade).
- `UMask=0077` (server.env + log files come out user-private).

### Verification

```bash
# after install:
systemctl --user status vcm-server
curl http://127.0.0.1:$VCM_SERVER_PORT/api/health
# expected: {"status":"ok","service":"vcm-server","version":"0.13.0"}

# uninstall:
scripts/uninstall-service.sh
```

### 反对意见

**Q: Doesn't this contradict ADR-0022's "no daemon complexity"?  
A: No. ADR-0022 was about *in-process* simplicity — no
background threads inside vcm-server (peer gossip is
request-time, not polling). This ADR is about *OS-level*
supervision — systemd can wrap any process. The two
decisions compose without conflict. A web server is, by
definition, a daemon when supervised — `nginx`, `caddy`,
`gunicorn`, Flask via `waitress-serve` are all daemons in
this sense.

**Q: Why not just use `nohup` or `disown`?  
A: `nohup` survives logout but not reboot. It also doesn't
restart on crash, doesn't journal logs, doesn't have a status
query. systemd gives all of that for free. `nohup` is what we
had at v0.12.0 — exactly the gap this ADR closes.

**Q: Why not a `Procfile` (foreman) / `pm2` / `compose.yaml`?  
A: All three would require either a global Node install
(foreman / pm2) or a docker dependency (compose.yaml).
CHARTER §8 says local-first, 0 new deps. systemd is already
on the target OS. The service file is a single declarative
file we control in-tree.

**Q: Won't `Restart=on-failure` hide real bugs?  
A: vcm-server already has 289/289 unit tests (incl.
ADR-0024's `?source_ip=` root-cause fix). The auto-restart is
for "the laptop woke from sleep and the socket was reset" —
those are not bugs, just kernel-level cleanup. Real bugs
surface via `journalctl --user -u vcm-server -n 200` after
the unit crashes; the install script prints that path in the
success output.

**Q: What about Windows?  
A: Out of scope (see "Why not macOS launchd / Windows
service" section). Users on Windows run vcm-server in WSL,
where the Linux instructions work; or fall back to the
manual launch documented in `ONBOARDING.md`.

### 后果

#### 正面

- `vcm-server` survives `loginctl` logout, reboot, and
  crashes. `Restart=on-failure + RestartSec=5` covers most
  failure modes without flapping.
- One canonical install command:
  `bash scripts/install-service.sh` → start;
  `bash scripts/uninstall-service.sh` → stop.
- Zero new deps in `package.json` or `requirements.txt`.
  systemd is a kernel-side abstraction.
- The service file is plain-text, diff-able, review-able in
  PRs (unlike `pm2 save` or supervisord's RPC state).
- Idempotency: re-running install with the same paths is a
  no-op (`daemon-reload` + `enable --now` are both safe).
- Port auto-selection handles the real-world 7338 collision
  seen during v0.12.0 development.

#### 负面 / 风险

- Linux-only. macOS / Windows users fall back to a manual
  launch (documented). v0.14.0 may add `vcm-server.plist`.
- Hardening directives (`MemoryDenyWriteExecute`, etc.) may
  break the install on older systemd (< 235). On Ubuntu
  24.04 (systemd 255) they work. We document the minimum.
- `Restart=on-failure` masks intermittent issues.
  Mitigation: unit starts printing the journal hint on every
  install, AND the install script `cat`s the last 20 log
  lines into the success message so the operator sees recent
  state.
- Port collision policy (skip-if-busy) means a fresh install
  on a shared box might land on an unexpected port.
  Mitigation: install script surfaces the chosen port in the
  success message AND writes it to `server.env` so
  `/api/health` reflects it on first call.

### 验收

```bash
# 1. Unit file is parseable by systemd-analyze.
systemd-analyze verify scripts/vcm-server.service

# 2. Install end-to-end (on a clean VM).
bash scripts/install-service.sh
# expected: prints "vcm-server installed: http://127.0.0.1:7338/"
curl http://127.0.0.1:7338/api/health | jq -r .status  # → "ok"

# 3. Survives reboot + crash.
sudo systemctl reboot         # auto-start after boot
kill -9 $(pgrep -f "server/app.py")   # auto-restart after 5s

# 4. Uninstall removes the unit but keeps ~/.vcm/server.env.
bash scripts/uninstall-service.sh
ls -la ~/.config/systemd/user/vcm-server.service  # → not present

# 5. Tests:
npm test -- tests/daemon.test.js   # → 5 passed (verifies .service
                                   #  directives + --dry-run flag)

# 6. Hard checks:
bash scripts/routine_coverage.sh   # → exit 0
```

### 不做

- ❌ macOS launchd `.plist` (v0.14.0).
- ❌ Windows service (out of scope; use WSL or manual launch).
- ❌ Auto-update on `git pull` (operator rebuilds + restarts).
- ❌ Multi-instance (one vcm-server per user per host; if you
  need two, pass `VCM_SERVER_PORT` and use a second systemd
  alias unit).
- ❌ TLS termination (CHARTER §8 says local-first; that's a
  v1.0 concern).
- ❌ gunicorn / waitress deployment (Flask dev server is fine
  for a single-user tool).
- ❌ Restart on `git pull` (operator runs `npm test &&
  systemctl --user restart vcm-server`).

## 参考

- [ADR-0022 peer gossip](0022-peer-leaderboard-gossip.md) —
  the precedent "no in-process daemon complexity" decision.
  This ADR explicitly composes with it, not contradicts it.
- [docs/ONBOARDING.md](../ONBOARDING.md) — install + uninstall
  steps documented for end users.
- [README.md](../../README.md) — "Running persistently"
  section added next to the manual launch block.
- [CHARTER.md §8](../../CHARTER.md) — local-first / 0 new deps
  (we honor it: no pm2 / supervisor / forever).
- system manuals: `man systemd.service`, `man systemd.exec` —
  directives referenced above are from these.
