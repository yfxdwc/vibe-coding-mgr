# Contributing to vibe-coding-mgr

> **TL;DR**: write an ADR first → run `bash scripts/routine_coverage.sh` →
> `npm test` → Conventional Commits referencing the ADR. Full details below.

Thanks for your interest in vibe-coding-mgr (vcm). The project is
deliberately small and disciplined; contributions that follow the
shape of the existing codebase land faster than ones that try to
re-architect it. If you're here to fix a bug, add a CLI subcommand,
or propose a new governance constraint, this guide is for you.

## 1. Code of conduct

Be conservative. Write ADRs before code. Follow the 6 hard checks.
The full rule set lives in [CHARTER.md](CHARTER.md); the operational
contract is in [AGENTS.md](AGENTS.md). When in doubt, mirror how the
last three releases (`v0.14.x`, `v0.15.0`, `v0.16.0`) shipped.

## 2. Before you code

Three questions. If any answer is "no" or "I don't know", stop and
resolve it before opening a PR:

1. **Is there an ADR?** Every hard constraint must have a written
   `docs/adr/NNNN-*.md` before code lands (CHARTER §10). Bug fixes
   and refactors usually don't need a new ADR but must reference
   the existing one they touch.
2. **Do the hard checks pass?** `bash scripts/routine_coverage.sh`
   must exit 0 (see §4 below). The pre-commit hook runs the same
   checks; you cannot `--no-verify` skip without a `[no-charter]`
   tag in the commit message (rare, reserved for emergency hotfixes).
3. **Do tests pass?** `npm test` should print `Tests  NNN passed (NNN)`.
   If you added a new behavior, add a test alongside it — the
   project uses `tests/<topic>.test.js` naming.

## 3. ADR discipline

The project rule: **every hard constraint has an ADR**. Hard
constraints include anything the system enforces (CLI subcommands,
server routes, skill validation rules, hard check scripts,
deployment topology).

To write a new ADR:

1. Pick the next number: `ls docs/adr/ | grep -oE '^[0-9]+' | sort -n | tail -1`
2. Use the template at `docs/adr/NNNN-short-slug.md` — see the
   existing files for the 7-section structure (背景 / 决策 /
   反对意见 / 后果 / 验收 / 不做 / 参考)
3. Update `docs/adr/INDEX.md` if it exists (the script
   `scripts/check_adr_index.py` enforces uniqueness)
4. Reference the ADR number in your commit message and PR
   description: `feat(vcm): MCP HTTP transport (ADR-0021)`
5. If the ADR ships a `SKILL.md`, mirror the ADR in
   `docs/skills/<name>/SKILL.md` and add a row in
   `docs/SKILLS.md` — `scripts/check_skills.py` enforces the
   pair (see [ADR-0028](docs/adr/0028-skill-rollout.md))

If your change is **not** a hard constraint (typo fix in docs,
test-only refactor, CI workflow tweak), skip the ADR but still
follow the commit style (§5).

## 4. The 6 hard checks

`bash scripts/routine_coverage.sh` runs **6 hard check scripts** (the
project's historical name "6 hard checks" is preserved per
[ADR-0028](docs/adr/0028-skill-rollout.md) — the v0.16.0 addition
of `check_skills.py` upgraded the previous soft skill-registry
warning into a real 6th check):

| Script | Purpose |
|---|---|
| `check_charter.py` | AGENTS.md + CHARTER.md + README.md all exist |
| `check_doc_drift.py` | docs/ directory present and not empty |
| `check_constraint_governance.py` | Constraints documented (AGENTS.md or CHARTER.md) |
| `check_adr_index.py` | ADR numbers unique (`NNNN-*.md` prefix) |
| `check_data_layout.py` | Recommended files present (AGENTS.md / CHARTER.md / README.md / .gitignore) |
| `check_skills.py` | `docs/SKILLS.md` exists; every indexed row resolves; every SKILL.md has frontmatter; descriptions pass banned-words regex; canonical_ref points at a real ADR |

The harness is `scripts/routine_coverage.sh` — it iterates the 6
scripts and exits non-zero on any failure. The pre-commit hook
calls this same harness.

The pre-commit hook calls `routine_coverage.sh` and refuses to
commit if any check exits non-zero. The check is **fast** (~50ms
total) and safe to run on every commit.

**No `--no-verify` without a tag.** The `[no-charter]` commit tag
is the project's documented escape hatch for emergency hotfixes
where the constraint gate would block a security patch. Use it
sparingly and explain in the commit body why.

## 5. Commit style

[Conventional Commits](https://www.conventionalcommits.org/) with
the project's prefixes:

| Prefix | When |
|---|---|
| `feat` | New user-facing feature (CLI subcommand, server route, dashboard view) |
| `fix` | Bug fix; must reference the affected ADR |
| `docs` | Markdown-only changes (README, HANDOFF, ONBOARDING, ADR typo fix) |
| `chore` | Version bumps, dependency housekeeping, tag operations |
| `refactor` | Internal restructuring with no user-visible behavior change |
| `test` | Test-only changes that don't add new behavior |

Format:

```
<prefix>(vcm | vcm-server | vcm-cli | docs): <summary> (ADR-NNNN)

<body — what changed and why, in present tense>

Refs: ADR-NNNN, ADR-NNNN
```

The `(ADR-NNNN)` suffix is required for `feat` and `fix` commits
that touch a hard constraint; encouraged (not required) for
`docs` / `chore` / `refactor`.

## 6. Releases

vcm follows a deliberate, design-disciplined release cadence. Every
release has:

1. A release commit that bumps the version in **5 surfaces**:
   - `package.json` (the npm-published source of truth)
   - `bin/vcm.js` (`const VERSION`)
   - `server/mcp_server.py` (`SERVER_INFO["version"]`)
   - `tests/cli.test.js` (the `--version` smoke test assertion)
   - `tests/server.test.js` (the `/api/health` version assertion)
2. A `CHANGELOG.md` entry above the previous release, with the
   `### Added` / `### Changed` / `### Design notes` sections
3. An annotated git tag: `git tag -a v<X>.<Y>.<Z> -m "..."`
   (the tag is what `.github/workflows/publish.yml` watches to
   trigger `npm publish` with provenance)

**Versioning policy**:

- **patch** (v0.X.Y → v0.X.(Y+1)): ADR follow-ups, bug fixes, no
  new constraint (e.g. v0.13.0 → v0.13.1 was a post-release bugfix
  to the systemd StartLimit directives)
- **minor** (v0.X.0 → v0.(X+1).0): new feature, new ADR, new hard
  check, new skill (e.g. v0.15.0 added the launchd path)
- **major** (vN.0.0): reserved for the v1.0.0 stability milestone
  in [ROADMAP.md](docs/ROADMAP.md) — breaking changes to JSON
  Schemas, removed commands, etc.

The current head version is in `package.json`; the README banner
must match (`grep -E '^\$ vcm --version' README.md` should show
the same `X.Y.Z`).

## 7. Local sanity check before opening a PR

```bash
# 1. Hard checks pass
bash scripts/routine_coverage.sh                  # expect exit 0

# 2. All tests pass
npm test                                           # expect "Tests  NNN passed (NNN)"

# 3. CLI binary works
node bin/vcm.js --version                          # expect current version

# 4. Server health (if you have vcm-server running)
curl -s http://127.0.0.1:7340/api/health | jq     # expect "status":"healthy"
# Or whichever port install-service.sh auto-picked

# 5. No stale untracked files
git status                                         # expect "nothing to commit, working tree clean"
```

## 8. Where to ask

- **Issues**: file a GitHub issue with the label that fits
  (`bug`, `enhancement`, `docs`, `governance`)
- **Discussions**: open a GitHub Discussion for design questions
  before writing an ADR
- **Security**: see the project's `SECURITY.md` if it exists;
  otherwise file a private issue and tag the maintainers

## 9. License

By contributing, you agree that your contributions will be licensed
under the same MIT license as the project (see [LICENSE](LICENSE)).
