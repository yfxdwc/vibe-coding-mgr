# ONBOARDING — 5-minute setup for a new project

## Prerequisites

- Node.js 20+
- Python 3.10+ (for the 6 hard check scripts)
- Git (for snapshot command)

## Step 1: Install vibe-coding-mgr

```bash
# Option A: Global install
npm install -g vibe-coding-mgr

# Option B: Per-project
cd my-project
npm install vibe-coding-mgr
```

## Step 2: Initialize governance

```bash
cd my-project
vcm init
```

This creates:
- `AGENTS.md` (template — edit for your project)
- `CHARTER.md` (template — edit for your project)
- Appends `.vcm/` to `.gitignore`

## Step 3: Customize

Open `AGENTS.md` and `CHARTER.md`. Replace placeholder values:
- `{{PROJECT_NAME}}` → your project's name
- Generic charter principles → your project's specific values

Commit the governance files:

```bash
git add AGENTS.md CHARTER.md .gitignore
git commit -m "feat: bootstrap vcm governance"
vcm snapshot bootstrap-governance
```

## Step 4: Register a skill

```bash
vcm skill add my-domain-rule \
  --desc "修改 my-domain 前必读 — 含 [your rules]" \
  --tags "dev,my-domain"
```

This creates `docs/skills/my-domain-rule/SKILL.md` (or `.pi/skills/...`).

Edit the SKILL.md body, then validate:

```bash
vcm skill validate my-domain-rule
```

## Step 5: Generate status report

```bash
vcm status
# Opens .vcm/report.html in browser
```

Shows: AGENTS.md ✓ / CHARTER.md ✓ / skills count / ADRs / TDs / post-mortems / git status.

## Step 6: Validate

```bash
vcm validate
# Runs 6 hard checks
```

Expected output: 6 ✓ OK in a clean project.

## Step 7: (Optional) Set up central dashboard

```bash
# On one machine (your dev server):
git clone https://github.com/your-org/vibe-coding-mgr
cd vibe-coding-mgr
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt
python3 server/app.py   # binds 127.0.0.1:7338

# From each project:
vcm push --server http://your-dev-server:7338
# → See all projects at http://your-dev-server:7338/
```

## Step 7b: (Optional) Run `vcm-server` persistently (systemd, v0.13.0+)

For a long-lived dashboard that survives logout, reboot, and crashes,
install as a systemd user unit (ADR-0025; Linux only):

```bash
cd vibe-coding-mgr
bash scripts/install-service.sh
# → vcm-server installed: http://127.0.0.1:7338/

# Day-to-day:
systemctl --user status vcm-server
journalctl --user -u vcm-server -n 50 -f

# Edit config without restart:
$EDITOR ~/.vcm/server.env
systemctl --user restart vcm-server

# Uninstall (keeps ~/.vcm/server.env and any DB files):
bash scripts/uninstall-service.sh
```

Notes:

- No `sudo` / root required; the unit lives at
  `~/.config/systemd/user/vcm-server.service` (XDG).
- No `pm2` / `supervisord` / Node global tools required — CHARTER §8
  says local-first, 0 new deps. systemd is already on the OS.
- If port 7338 is taken (e.g. by another service), the installer
  auto-picks a free one in 7338..7399 and writes the choice to
  `~/.vcm/server.env` so `/api/health` reflects it on first call.
- `loginctl enable-linger $USER` is enabled so the unit survives SSH
  logout.
- macOS / Windows: use `tmux` to keep `python3 server/app.py` alive
  across logout, OR run inside WSL where the Linux path applies.
  A `vcm-server.plist` for launchd is on the v0.14.0 roadmap.

## Daily workflow

```bash
# Before risky changes
vcm snapshot my-feature

# ... do work ...

# If something breaks
vcm rollback my-feature
# → Restores tag + applies dirty backup

# End of day
vcm validate && vcm status
```

## Troubleshooting

**Q: `vcm snapshot` says "Not a git repository"**
A: Run `git init` first.

**Q: `vcm validate` fails on Python scripts**
A: Ensure Python 3.10+ is installed. Scripts live in `scripts/`.

**Q: `vcm skill validate` says "banned words"**
A: Your description contains words like "通用/最佳实践/总结". See [skill-authoring §3](https://github.com/your-org/sales-ai/blob/main/.pi/skills/skill-authoring/SKILL.md).

## Next steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the design
- Read [PHILOSOPHY.md](./PHILOSOPHY.md) to understand the 5 values
- Read [REFERENCES.md](./REFERENCES.md) for ADRs that drove this design
