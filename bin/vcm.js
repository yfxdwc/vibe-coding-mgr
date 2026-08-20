#!/usr/bin/env node
// bin/vcm.js — Vibe Coding Manager CLI entry point
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from '../lib/cli/init.js';
import { snapshotCommand } from '../lib/cli/snapshot.js';
import { skillCommand } from '../lib/cli/skill.js';
import { statusCommand } from '../lib/cli/status.js';
import { validateCommand } from '../lib/cli/validate.js';
import { pushCommand } from '../lib/cli/push.js';
import { peersCommand } from '../lib/cli/peers.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('vcm')
  .description('Vibe Coding Manager — governance + tooling + cross-project attention for vibe coding projects')
  .version(VERSION);

program
  .command('init')
  .description('Initialize a project with VCM governance templates')
  .argument('[target-dir]', 'Target directory (defaults to current directory)', '.')
  .option('--force', 'Overwrite existing files')
  .action(initCommand);

program
  .command('snapshot')
  .description('Create a task-level snapshot (git tag + dirty backup)')
  .argument('<name>', 'Snapshot name')
  .option('-m, --message <msg>', 'Snapshot message', '')
  .action(snapshotCommand);

program
  .command('skill')
  .description('Manage skills (add/list/validate)')
  .argument('<action>', 'add | list | validate')
  .argument('[name]', 'Skill name (for add/validate)')
  .option('-d, --desc <description>', 'Skill description (for add)')
  .option('-t, --tags <tags>', 'Comma-separated tags (for add)')
  .action(skillCommand);

program
  .command('status')
  .description('Show project governance status as local HTML report')
  .option('-o, --output <path>', 'Output HTML path', '.vcm/report.html')
  .option('--no-open', 'Do not open browser after generation')
  .action(statusCommand);

program
  .command('validate')
  .description('Run the 6 hard checks (CHARTER §9 + §10)')
  .option('--ci', 'CI mode: exit 1 on any hard violation')
  .action(validateCommand);

program
  .command('push')
  .description('Push current state to vcm-server (optional central dashboard)')
  .option('-s, --server <url>', 'Server URL', 'http://127.0.0.1:7338')
  .action(pushCommand);

program
  .command('peers')
  .description('Manage peer project attention (v1: stub only)')
  .argument('<action>', 'add | list')
  .argument('[repo]', 'Repository (owner/name)')
  .action(peersCommand);

// Default help text styling
program.configureHelp({
  styleTitle: (str) => chalk.bold.cyan(str),
});

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`\n✗ vcm error: ${err.message}\n`));
  if (process.env.VCM_DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
