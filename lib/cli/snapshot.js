// lib/cli/snapshot.js
// Task-level snapshot using git tag + working-tree dirty backup.
// Based on ADR-0020 semantics.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`git ${cmd} failed: ${err.stderr?.trim() || err.message}`);
  }
}

export async function snapshotCommand(name, options) {
  const cwd = process.cwd();
  const head = git('rev-parse HEAD');
  const shortSha = head.substring(0, 7);
  const tag = `pre-${name}-${shortSha}`;
  const message = options.message || `task-start: ${name}`;

  console.log(chalk.bold(`\nvcm snapshot — ${name}\n`));
  console.log(`  HEAD: ${head}`);
  console.log(`  Tag:  ${tag}\n`);

  // Ensure we're in a git repo
  try {
    git('rev-parse --git-dir');
  } catch {
    console.error(chalk.red('  ✗ Not a git repository. Run `git init` first.'));
    process.exit(1);
  }

  // Create the .git/snapshots/ directory
  const snapshotsDir = resolve(cwd, '.git/snapshots');
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  // Dump working tree diff BEFORE creating tag (so dirty state is captured)
  const diffPath = resolve(snapshotsDir, `${tag}.diff`);
  let diffContent = '';
  try {
    diffContent = git('diff HEAD');
    const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).trim();
    if (untracked) {
      diffContent += '\n\n# Untracked files:\n' + untracked.split('\n').map(f => `?? ${f}`).join('\n');
    }
  } catch (err) {
    diffContent = `# Failed to capture diff: ${err.message}`;
  }
  writeFileSync(diffPath, diffContent);
  console.log(chalk.gray(`  ✓ Dirty backup → ${diffPath}`));

  // Create the tag (use --force if exists; skip --allow-empty for older git)
  try {
    git(`tag -a "${tag}" -m "${message.replace(/"/g, '\\"')}" -f HEAD`);
    console.log(chalk.green(`  ✓ Tag created: ${tag}`));
  } catch (err) {
    console.error(chalk.red(`  ✗ Tag creation failed: ${err.message}`));
    process.exit(1);
  }

  // Verify
  const tagExists = git(`tag -l "${tag}"`);
  if (tagExists === tag) {
    console.log(chalk.bold.green('\n  Snapshot ready.\n'));
    console.log(chalk.cyan('  Restore: ') + `git checkout ${tag}  # or use vcm rollback ${name}`);
    console.log(chalk.cyan('  List:    ') + 'vcm list\n');
  } else {
    console.error(chalk.red(`  ✗ Tag verification failed`));
    process.exit(1);
  }
}
