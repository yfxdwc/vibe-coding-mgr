// lib/cli/init.js
// Initialize a target directory with VCM governance templates.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

/**
 * Load a template file and substitute {{PLACEHOLDER}} tokens.
 */
function loadTemplate(name, vars = {}) {
  const path = resolve(TEMPLATES_DIR, name);
  let content = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

/**
 * Files created by `vcm init`. Map of relative path -> template name.
 * Files containing '{{PROJECT_NAME}}' or other placeholders are rendered.
 */
const FILES = {
  'AGENTS.md': { template: 'AGENTS.template.md', vars: true },
  'CHARTER.md': { template: 'CHARTER.template.md', vars: true },
};

/**
 * Detect project name from package.json or directory basename.
 */
function detectProjectName(targetDir) {
  const pkgPath = resolve(targetDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name;
    } catch {}
  }
  const pyprojectPath = resolve(targetDir, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf8');
      const match = content.match(/^name\s*=\s*["']([^"']+)["']/m);
      if (match) return match[1];
    } catch {}
  }
  return basename(resolve(targetDir));
}

/**
 * Ensure a file would be created, checking for existing conflicts.
 * Returns 'created' | 'skipped' | 'overwritten'.
 */
function writeFile(targetPath, content, force) {
  if (existsSync(targetPath)) {
    if (!force) return 'skipped';
  }
  writeFileSync(targetPath, content);
  return existsSync(targetPath) ? (force ? 'overwritten' : 'created') : 'created';
}

/**
 * Append `.gitignore.additions` to existing `.gitignore`, or create new.
 */
function appendGitignore(targetDir, additions, force) {
  const gitignorePath = resolve(targetDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf8');
    if (existing.includes('.vcm/')) return 'skipped';
    writeFileSync(gitignorePath, existing + '\n' + additions);
    return 'merged';
  }
  writeFileSync(gitignorePath, additions);
  return 'created';
}

export async function initCommand(targetDir, options) {
  const target = resolve(process.cwd(), targetDir);
  const projectName = detectProjectName(target);
  const force = options.force || false;

  console.log(chalk.bold(`\nvcm init — ${projectName}\n`));
  console.log(`  Target: ${target}`);
  console.log(`  Force:  ${force}\n`);

  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
    console.log(chalk.green(`  ✓ Created directory ${target}`));
  }

  const results = [];
  for (const [relPath, spec] of Object.entries(FILES)) {
    const targetPath = resolve(target, relPath);
    let content;
    if (spec.template) {
      content = loadTemplate(spec.template, spec.vars ? { PROJECT_NAME: projectName } : {});
    } else {
      content = spec.raw;
    }
    const status = writeFile(targetPath, content, force);
    results.push({ path: relPath, status });
  }

  // Append gitignore additions
  const additions = readFileSync(resolve(TEMPLATES_DIR, '.gitignore.additions'), 'utf8');
  const giStatus = appendGitignore(target, additions, force);
  results.push({ path: '.gitignore (additions)', status: giStatus });

  console.log(chalk.bold('\nResults:'));
  for (const r of results) {
    const icon = r.status === 'skipped' ? '⚠' : '✓';
    const color = r.status === 'skipped' ? chalk.yellow : chalk.green;
    console.log(color(`  ${icon} ${r.path} — ${r.status}`));
  }

  console.log(chalk.bold('\nNext steps:'));
  console.log(chalk.cyan('  1. Review AGENTS.md and CHARTER.md — edit for your project'));
  console.log(chalk.cyan('  2. vcm snapshot init-governance   # commit governance setup'));
  console.log(chalk.cyan('  3. vcm status                       # generate governance report'));
  console.log(chalk.cyan('  4. vcm validate                     # run 6 hard checks'));
  console.log('');
}
