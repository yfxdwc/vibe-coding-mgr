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
import { userTokenCommand } from '../lib/cli/user.js';
import { doctorCommand } from '../lib/cli/doctor.js';
import { schemaDocCommand } from '../lib/cli/schema-doc.js';

const VERSION = "0.18.3";

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
  .description('Manage skills (add/list/validate/convert/publish/unpublish/discover/install/deprecate/retire/stale/sweep)')
  .argument('<action>', 'add | list | validate | convert | publish | unpublish | discover | install | deprecate | retire | stale | sweep')
  .argument('[name]', 'Skill name (where applicable)')
  .option('-d, --desc <description>', 'Skill description (for add)')
  .option('-t, --tags <tags>', 'Comma-separated tags (for add)')
  .option('--from <fmt>', 'Source format (convert)')
  .option('--to <fmt>',   'Target format (convert)')
  .option('--input <path>', 'Read skill JSON from file (convert)')
  .option('--output <path>', 'Write to file instead of stdout (convert)')
  .option('--replaced-by <new>', 'Replacement slug (deprecate)')
  .option('--install-to <dir>', 'Install into specific dir (install)')
  .option('--force', 'Overwrite existing (publish, install)')
  .option('--yes', 'Skip confirmation (retire, sweep)')
  .option('--days <N>', 'Threshold days (stale, sweep; default 90 / 180)')
  .option('--tag <tag>', 'Filter by tag (discover)')
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
  .description('Manage peer project attention (GitHub API)')
  .argument('<action>', 'add | list | refresh | config')
  .argument('[repo]', 'Repository (owner/name) — for add/config')
  .action(peersCommand);

program
  .command('user')
  .description('Manage users (ADR-0011 per-user ACL)')
  .argument('<action>', 'add | list | passwd | delete')
  .argument('[name]', 'Username (for add/passwd/delete)')
  .option('--scope <scope>', 'User scope: read | push | admin', 'push')
  .option('--password <pw>', 'Password (CI use; prefer stdin/TTY)')
  .action((action, name, opts) => userTokenCommand('user', action, name, opts));

program
  .command('token')
  .description('Manage bearer tokens (ADR-0011 per-user ACL)')
  .argument('<action>', 'grant | revoke | list')
  .argument('[name]', 'Username (for grant) or token id (for revoke); empty=list all')
  .option('--label <label>', 'Token label (e.g. "ci-runner")')
  .option('--scope <scope>', 'Token scope override')
  .option('--days <N>', 'Token expiry in days')
  .action((action, name, opts) => userTokenCommand('token', action, name, opts));

program
  .command('doctor')
  .description('Comprehensive project health check (ADR-0013)')
  .option('--json', 'Emit JSON to stdout (CI use)')
  .option('--strict', 'Exit 1 on any warning (default: only fail)')
  .action(doctorCommand);

program
  .command('schema')
  .description('Schema utilities (ADR-0015 schema-doc generator)')
  .argument('<action>', 'doc')
  .argument('[spec]', 'Schema name (skill, state) or path to schema.json')
  .option('--output <path>', 'Write markdown to file instead of stdout')
  .action((action, spec, opts) => schemaDocCommand(spec, opts));

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
