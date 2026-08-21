// lib/cli/push.js
// Push current state to vcm-server (optional central dashboard)
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectState(cwd) {
  const head = safeExec('git rev-parse HEAD') || 'unknown';
  const branch = safeExec('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const dirty = !!safeExec('git status --porcelain');
  const lastCommit = safeExec('git log -1 --format=%cI');

  function countIn(dir, ext = '.md') {
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).filter(f => f.endsWith(ext)).length;
  }
  function findSkills(cwd) {
    for (const dir of ['.pi/skills', 'docs/skills']) {
      const abs = resolve(cwd, dir);
      if (!existsSync(abs)) continue;
      return readdirSync(abs).filter(name => {
        try {
          return statSync(resolve(abs, name)).isDirectory() &&
                 existsSync(resolve(abs, name, 'SKILL.md'));
        } catch { return false; }
      });
    }
    return [];
  }
  const skillsRegistered = findSkills(cwd);

  const tdFile = resolve(cwd, 'docs/TECH_DEBT.md');
  let tdsCount = 0;
  if (existsSync(tdFile)) {
    tdsCount = (readFileSync(tdFile, 'utf8').match(/^### TD-\d+/gm) || []).length;
  }

  return {
    schema_version: '0.1.0',
    project: { name: cwd.split('/').pop(), path: cwd },
    generated_at: new Date().toISOString(),
    vcm_version: '0.2.0',
    governance: {
      agents_md_present: existsSync(resolve(cwd, 'AGENTS.md')),
      charter_md_present: existsSync(resolve(cwd, 'CHARTER.md')),
      skills_count: skillsRegistered.length,
      skills_registered: skillsRegistered,
      adrs_count: countIn(resolve(cwd, 'docs/adr')) - 1, // exclude INDEX.md
      tds_count: tdsCount,
      post_mortems_count: countIn(resolve(cwd, 'docs/post-mortems')),
    },
    health: {
      last_snapshot_at: null,
      last_ci_pass: null,
      ci_warnings: 0,
      ci_failures: 0,
    },
    git: {
      head_commit: head,
      branch,
      dirty,
      last_commit_at: lastCommit,
    },
  };
}

export async function pushCommand(options) {
  const cwd = process.cwd();
  const serverUrl = options.server || 'http://127.0.0.1:7338';

  console.log(chalk.bold('\nvcm push\n'));
  console.log(`  Server: ${serverUrl}`);
  console.log(`  Project: ${cwd.split('/').pop()}\n`);

  const state = detectState(cwd);

  // Save local state first
  const vcmDir = resolve(cwd, '.vcm');
  if (!existsSync(vcmDir)) mkdirSync(vcmDir, { recursive: true });
  const statePath = resolve(vcmDir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(chalk.gray(`  ✓ Local state saved: ${statePath}`));

  // Push to server
  try {
    const resp = await fetch(`${serverUrl}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (resp.ok) {
      console.log(chalk.green(`  ✓ Pushed to ${serverUrl}/api/collect`));
    } else {
      console.log(chalk.yellow(`  ⚠ Server returned ${resp.status}: ${await resp.text()}`));
      console.log(chalk.gray(`    (State saved locally — push will retry on next run)`));
    }
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Cannot reach ${serverUrl}: ${err.message}`));
    console.log(chalk.gray(`    (State saved locally — server may be down)`));
  }

  console.log('');
}
