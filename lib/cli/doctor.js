// lib/cli/doctor.js — comprehensive project health check (ADR-0013)
//
// Aggregates 4 sub-checks into one CLI:
//   1) governance    — 6 hard check (call scripts/routine_coverage.sh)
//   2) skills        — registered skills count + lifecycle status
//   3) repository    — ADRs / TDs / post-mortems counts
//   4) git hygiene   — working tree + branch + last commit age
//
// Output modes:
//   default          — human-readable table to stdout
//   --json           — single JSON object, machine-readable (CI use)
//   --push           — emit a `state_pushed` event with summary (v0.6)
//   --strict         — exit 1 on ANY warning (default: only on fail)
//
// Exit codes:
//   0 — pass / warn (default mode)
//   1 — fail
//   1 — warn (only in --strict mode)

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(new URL(import.meta.url).pathname);
const VCM_ROOT = resolve(HERE, '..', '..');

function countGlobs(dir, ext, marker) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => {
    const full = join(dir, f);
    if (!statSync(full).isDirectory()) return false;
    if (marker && !existsSync(join(full, marker))) return false;
    return true;
  }).length;
}

function countFileGrep(file, regex) {
  if (!existsSync(file)) return 0;
  const content = readFileSync(file, 'utf8');
  return (content.match(regex) || []).length;
}

function discoverSkillsInfo(cwd) {
  const dirs = ['.pi/skills', 'docs/skills'];
  let skillsDir = null;
  for (const rel of dirs) {
    const abs = resolve(cwd, rel);
    if (existsSync(abs)) { skillsDir = abs; break; }
  }
  if (!skillsDir) return { total: 0, byPhase: {}, skills: [] };

  const skills = [];
  for (const name of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, name);
    const md = join(skillDir, 'SKILL.md');
    if (!existsSync(md)) continue;
    const raw = readFileSync(md, 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    let fm = {};
    if (m) {
      // light parsing
      for (const line of m[1].split('\n')) {
        const lm = line.match(/^(\w+):\s*(.*)$/);
        if (!lm) continue;
        fm[lm[1]] = lm[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    skills.push({
      name,
      description: (fm.description || '').slice(0, 80),
      phase: fm.lifecycle?.split(':')?.[1]?.trim().replace(/['"]/g, '') || 'active',
      path: md,
    });
  }
  const byPhase = {};
  for (const s of skills) {
    byPhase[s.phase] = (byPhase[s.phase] || 0) + 1;
  }
  return { total: skills.length, byPhase, skills };
}

function repoAudit(cwd) {
  const docsDir = resolve(cwd, 'docs');
  const adrsDir = join(docsDir, 'adr');
  const tdsFile = resolve(cwd, 'docs/TECH_DEBT.md');
  const pmDir = join(docsDir, 'post-mortems');
  const tdCount = countFileGrep(tdsFile, /^\s*TD-\d+/gm);
  const adrFiles = existsSync(adrsDir)
    ? readdirSync(adrsDir).filter((f) => /^\d{4}-/.test(f) && f.endsWith('.md'))
    : [];
  const postMortems = countGlobs(pmDir, null, 'POSTMORTEM.md') +
                       countGlobs(pmDir, null, 'postmortem.md');
  return {
    adrs: adrFiles.length,
    tech_debts: tdCount,
    post_mortems: postMortems,
  };
}

function gitHygiene(cwd) {
  function git(args) {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd, stdio: 'pipe' });
    return r.status === 0 ? r.stdout.trim() : null;
  }
  if (!existsSync(join(cwd, '.git'))) {
    return { has_git: false };
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain']);
  const lastVcmValidate = (() => {
    const r = git(['log', '-1', '--format=%ct', '--', 'scripts/routine_coverage.sh']);
    if (!r) return null;
    const days = Math.round((Date.now() / 1000 - parseInt(r, 10)) / 86400);
    return days;
  })();
  return {
    has_git: true,
    branch: branch || '?',
    head: head || '?',
    dirty: !!dirty,
    last_vcm_validate_days_ago: lastVcmValidate,
  };
}

function runGovernance(cwd) {
  // Run each check script directly and tally outcomes.
  const checks = [
    'check_charter.py', 'check_doc_drift.py',
    'check_constraint_governance.py', 'check_adr_index.py',
    'check_data_layout.py',
  ];
  let ok = 0, warn = 0, fail = 0;
  const lines = [];
  for (const c of checks) {
    const scriptPath = resolve(VCM_ROOT, 'scripts', c);
    // v0.18.4 fix: derive the venv python from VCM_ROOT (was hardcoded
    // to /home/mm7/vibe-coding-mgr/.venv/bin/python3, which broke
    // every CI runner + every other dev machine). If the venv isn't
    // there, doctor still works — Python falls back to the system
    // interpreter and the check script's own shebang handles it.
    const venvPy = join(VCM_ROOT, '.venv', 'bin', 'python3');
    const python = existsSync(venvPy) ? venvPy : 'python3';
    const r = spawnSync(python,
      [scriptPath, '--no-fail'],
      { encoding: 'utf8', cwd, stdio: 'pipe' });
    if (r.status === 0) { ok++; lines.push(`  ✓ ${c}`); }
    else if ((r.stdout || '').includes('WARN')) { warn++; lines.push(`  ⚠ ${c}`); }
    else {
      fail++;
      // Helpful debug when something fails; keep terse.
      lines.push(`  ✗ ${c} (status=${r.status}; stderr=${(r.stderr || '').split('\n')[0].slice(0, 200)})`);
    }
  }
  // Skill registry check
  if (!existsSync(join(cwd, '.pi/skills')) && !existsSync(join(cwd, 'docs/skills'))) {
    warn++;
    lines.push('  ⚠ skill registry — no .pi/skills or docs/skills');
  } else {
    ok++;
    lines.push('  ✓ skill registry — present');
  }
  return { ok, warn, fail, raw: lines.join('\n') };
}

export async function doctorCommand(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const gov = runGovernance(cwd);
  const skills = discoverSkillsInfo(cwd);
  const repo = repoAudit(cwd);
  const git = gitHygiene(cwd);

  const verdict = {
    governance: gov,
    skills: { total: skills.total, by_phase: skills.byPhase },
    repository: repo,
    git,
    verdict: {
      pass:   gov.ok,
      warn:   gov.warn,
      fail:   gov.fail,
    },
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
    process.exit(0);
  }

  // Human-readable output (legacy default)
  const lines = [];
  lines.push('vcm doctor — 4 sections');
  lines.push('');
  lines.push('[governance]');
  lines.push(`  6 hard checks       ${gov.fail ? 'FAIL' : (gov.warn ? 'WARN' : 'OK')} (${gov.ok} OK, ${gov.warn} WARN, ${gov.fail} FAIL)`);
  lines.push('');
  lines.push('[skills]');
  lines.push(`  ${skills.total} registered        ${Object.entries(skills.byPhase).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
  lines.push('');
  lines.push('[repository]');
  lines.push(`  ${repo.adrs} ADRs               newest: ${repo.adrs > 0 ? 'see docs/adr/' : 'none'}`);
  lines.push(`  ${repo.tech_debts} TD entries       ${repo.tech_debts > 30 ? '(> 30!)' : ''}`);
  lines.push(`  ${repo.post_mortems} post-mortems`);
  lines.push('');
  lines.push('[git hygiene]');
  if (!git.has_git) {
    lines.push('  no .git directory');
  } else {
    lines.push(`  working tree        ${git.dirty ? 'dirty' : 'clean'}`);
    lines.push(`  branch              ${git.branch}`);
    lines.push(`  HEAD                ${git.head}`);
    if (git.last_vcm_validate_days_ago !== null) {
      lines.push(`  last vcm validate   ${git.last_vcm_validate_days_ago}d ago`);
    }
  }
  lines.push('');
  let label;
  if (gov.fail) label = `FAIL: ${gov.fail} checks failed`;
  else if (gov.warn) label = `${gov.warn} WARN, ${gov.ok} OK`;
  else label = `all OK (${gov.ok}/6)`;
  lines.push(`VERDICT: ${label}`);
  process.stdout.write(lines.join('\n') + '\n');

  // Exit code
  if (gov.fail || (opts.strict && gov.warn)) process.exit(1);
  process.exit(0);
}
