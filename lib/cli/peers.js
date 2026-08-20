// lib/cli/peers.js
// Peer project attention — v1 STUB ONLY
// Full implementation (GitHub API + RSS watcher) is roadmap v1.5 / v2.
import chalk from 'chalk';

const STUB_MSG = `
  ⚠ vcm peers is a STUB in v0.1.0.

  Roadmap:
  - v1.5: GitHub API integration (rate-limit-aware)
  - v2:   RSS watcher fallback + watch list config

  For now, peers state is local-only. See docs/ROADMAP.md.
`;

export async function peersCommand(action, repo) {
  console.log(chalk.bold('\nvcm peers (v0.1.0 STUB)\n'));

  if (action === 'list') {
    console.log(chalk.gray('  (no peer projects tracked yet)'));
  } else if (action === 'add') {
    if (!repo) {
      console.log(chalk.red('  ✗ Usage: vcm peers add <owner/name>'));
      process.exit(1);
    }
    console.log(chalk.cyan(`  → Would track: ${repo}`));
  } else {
    console.log(chalk.red(`  ✗ Unknown action: ${action}. Use add | list`));
    process.exit(1);
  }

  console.log(chalk.gray(STUB_MSG));
}
