// lib/cli/status.js
// Generate a local HTML status report from .vcm-state.json
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { validateProjectState } from '../schemas/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectProjectState(cwd) {
  const state = {
    schema_version: '0.1.0',
    project: {
      name: basename(cwd),
      path: cwd,
      registered_at: new Date().toISOString(),
    },
    generated_at: new Date().toISOString(),
    vcm_version: '0.1.0',
    governance: {
      agents_md_present: existsSync(resolve(cwd, 'AGENTS.md')),
      charter_md_present: existsSync(resolve(cwd, 'CHARTER.md')),
      skills_count: 0,
      adrs_count: 0,
      tds_count: 0,
      post_mortems_count: 0,
      skills_registered: [],
    },
    health: {
      last_snapshot_at: safeExec('git tag -l "pre-*" --format=%cI | head -1') || new Date(0).toISOString(),
      last_ci_pass: true,
      ci_warnings: 0,
      ci_failures: 0,
    },
    git: {
      head_commit: safeExec('git rev-parse HEAD') || '',
      branch: safeExec('git rev-parse --abbrev-ref HEAD') || '',
      dirty: false,
      last_commit_at: safeExec('git log -1 --format=%cI') || '',
    },
  };

  // Count skills (search .pi/skills, docs/skills)
  for (const dir of ['.pi/skills', 'docs/skills']) {
    const abs = resolve(cwd, dir);
    if (!existsSync(abs)) continue;
    const skills = readdirSync(abs).filter(name => {
      try {
        return statSync(resolve(abs, name)).isDirectory() &&
               existsSync(resolve(abs, name, 'SKILL.md'));
      } catch { return false; }
    });
    if (skills.length > 0 && state.governance.skills_registered.length === 0) {
      state.governance.skills_registered = skills;
      state.governance.skills_count = skills.length;
    }
  }

  // Count ADRs
  const adrDir = resolve(cwd, 'docs/adr');
  if (existsSync(adrDir)) {
    state.governance.adrs_count = readdirSync(adrDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md').length;
  }

  // Count TDs
  const tdFile = resolve(cwd, 'docs/TECH_DEBT.md');
  if (existsSync(tdFile)) {
    const content = readFileSync(tdFile, 'utf8');
    state.governance.tds_count = (content.match(/^### TD-\d+/gm) || []).length;
  }

  // Count post-mortems
  const pmDir = resolve(cwd, 'docs/post-mortems');
  if (existsSync(pmDir)) {
    state.governance.post_mortems_count = readdirSync(pmDir).filter(f => f.endsWith('.md')).length;
  }

  // Git dirty check
  const gitStatus = safeExec('git status --porcelain');
  state.git.dirty = !!gitStatus;
  const lastCommitDate = safeExec('git log -1 --format=%cI');
  state.git.last_commit_at = lastCommitDate;

  return state;
}

function renderHTML(state) {
  const g = state.governance;
  const h = state.health;
  const git = state.git;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>vcm status — ${state.project.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
    h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    h2 { color: #374151; margin-top: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; }
    .card .label { font-size: 0.875rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 1.5rem; font-weight: 600; margin-top: 0.5rem; }
    .card.success { border-color: #10b981; background: #ecfdf5; }
    .card.warn { border-color: #f59e0b; background: #fffbeb; }
    .card.error { border-color: #ef4444; background: #fef2f2; }
    ul.skills { list-style: none; padding: 0; }
    ul.skills li { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 0.25rem 0.75rem; border-radius: 999px; margin: 0.25rem; font-size: 0.875rem; }
    .meta { color: #6b7280; font-size: 0.875rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>📊 vcm status — ${state.project.name}</h1>
  <p class="meta">
    Generated ${state.generated_at} • vcm ${state.vcm_version} • schema ${state.schema_version}
  </p>

  <h2>Governance</h2>
  <div class="grid">
    <div class="card ${g.agents_md_present ? 'success' : 'error'}">
      <div class="label">AGENTS.md</div>
      <div class="value">${g.agents_md_present ? '✓' : '✗'}</div>
    </div>
    <div class="card ${g.charter_md_present ? 'success' : 'error'}">
      <div class="label">CHARTER.md</div>
      <div class="value">${g.charter_md_present ? '✓' : '✗'}</div>
    </div>
    <div class="card">
      <div class="label">Skills</div>
      <div class="value">${g.skills_count}</div>
    </div>
    <div class="card">
      <div class="label">ADRs</div>
      <div class="value">${g.adrs_count}</div>
    </div>
    <div class="card">
      <div class="label">TDs</div>
      <div class="value">${g.tds_count}</div>
    </div>
    <div class="card">
      <div class="label">Post-mortems</div>
      <div class="value">${g.post_mortems_count}</div>
    </div>
  </div>

  ${g.skills_registered.length > 0 ? `
  <h2>Registered Skills</h2>
  <ul class="skills">
    ${g.skills_registered.map(s => `<li>${s}</li>`).join('\n    ')}
  </ul>
  ` : ''}

  <h2>Git</h2>
  <div class="grid">
    <div class="card">
      <div class="label">Branch</div>
      <div class="value" style="font-size: 1rem;">${git.branch || 'N/A'}</div>
    </div>
    <div class="card">
      <div class="label">HEAD</div>
      <div class="value" style="font-family: monospace; font-size: 0.875rem;">${git.head_commit ? git.head_commit.substring(0, 7) : 'N/A'}</div>
    </div>
    <div class="card ${git.dirty ? 'warn' : 'success'}">
      <div class="label">Working tree</div>
      <div class="value">${git.dirty ? '⚠ dirty' : '✓ clean'}</div>
    </div>
  </div>

  <footer>
    Generated by <a href="https://github.com/your-org/vibe-coding-mgr">vibe-coding-mgr</a> v${state.vcm_version}
  </footer>
</body>
</html>`;
}

export async function statusCommand(options) {
  const cwd = process.cwd();
  const outputPath = resolve(cwd, options.output);

  // Ensure output directory exists
  const { mkdirSync } = await import('node:fs');
  mkdirSync(resolve(outputPath, '..'), { recursive: true });

  console.log(chalk.bold('\nvcm status\n'));

  const state = detectProjectState(cwd);

  // Validate
  const validation = validateProjectState(state);
  if (!validation.valid) {
    console.warn(chalk.yellow('  ⚠ State validation warnings:'));
    for (const e of validation.errors) {
      console.warn(chalk.yellow(`      - ${e}`));
    }
  }

  // Render HTML
  const html = renderHTML(state);
  writeFileSync(outputPath, html);
  console.log(chalk.green(`  ✓ Report written: ${outputPath}`));

  // Print console summary
  const g = state.governance;
  console.log(chalk.bold('\n  Summary:'));
  console.log(`    AGENTS.md:    ${g.agents_md_present ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`    CHARTER.md:   ${g.charter_md_present ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`    Skills:       ${g.skills_count}`);
  console.log(`    ADRs:         ${g.adrs_count}`);
  console.log(`    TDs:          ${g.tds_count}`);
  console.log(`    Post-mortems: ${g.post_mortems_count}`);

  if (options.open !== false) {
    // Try to open browser
    try {
      const opener = process.platform === 'darwin' ? 'open' :
                     process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${opener} "${outputPath}"`, { stdio: 'ignore' });
    } catch {
      // Silently ignore — user can open manually
    }
  }

  console.log('');
}
