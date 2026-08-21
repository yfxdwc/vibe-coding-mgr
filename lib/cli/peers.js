// lib/cli/peers.js — Peer project attention (real GitHub API integration, v0.2.0+)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(process.env.HOME || '~', '.vcm', 'peers.yaml');

// Simple YAML parser (single-level key: value, supports github_token + peers list)
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { github_token: null, peers: [] };
  }
  const text = readFileSync(CONFIG_PATH, 'utf8');
  const cfg = { github_token: null, peers: [] };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^github_token:\s*"?([^"]+)"?$/);
    if (m) { cfg.github_token = m[1].trim() || null; continue; }
    const m2 = t.match(/^-\s*"?([^"]+)"?$/);
    if (m2) { cfg.peers.push(m2[1].trim()); continue; }
  }
  return cfg;
}

function saveConfig(cfg) {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const lines = [
    '# vcm peers config',
    '# github_token: <your-token-here>  (optional; raises rate limit 60/h → 5000/h)',
    'github_token: ' + (cfg.github_token ? `"${cfg.github_token}"` : ''),
    '',
    'peers:',
  ];
  for (const p of cfg.peers) lines.push(`  - "${p}"`);
  writeFileSync(CONFIG_PATH, lines.join('\n') + '\n');
}

const GH_API = 'https://api.github.com';

async function ghFetch(path, token) {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'vcm/0.2.0' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${GH_API}${path}`, { headers });
  if (!r.ok) {
    if (r.status === 403) {
      const remaining = r.headers.get('x-ratelimit-remaining');
      throw new Error(`GitHub API 403 (rate limit remaining: ${remaining})`);
    }
    if (r.status === 404) throw new Error(`GitHub API 404: ${path}`);
    throw new Error(`GitHub API ${r.status}: ${path}`);
  }
  return r.json();
}

export async function peersCommand(action, repo) {
  if (action === 'config') {
    if (!repo) {
      console.log(chalk.bold('\n  Current config:\n'));
      const cfg = loadConfig();
      console.log(`    ${chalk.cyan('Config:')}  ${CONFIG_PATH}`);
      console.log(`    ${chalk.cyan('Token:')}   ${cfg.github_token ? '✓ set' : '✗ not set'}`);
      console.log(`    ${chalk.cyan('Peers:')}   ${cfg.peers.length}`);
      for (const p of cfg.peers) console.log(`              - ${p}`);
      console.log(chalk.gray('\n  Add peers with: vcm peers add <owner/repo>'));
      console.log(chalk.gray('  Set token with: VCM_GITHUB_TOKEN=ghp_... vcm peers refresh'));
      console.log('');
      return;
    }
    // `peers config <owner/repo>` → add a peer
    const cfg = loadConfig();
    if (!cfg.peers.includes(repo)) {
      cfg.peers.push(repo);
      saveConfig(cfg);
      console.log(chalk.green(`\n  ✓ Added peer: ${repo}`));
    } else {
      console.log(chalk.yellow(`\n  ⚠ Peer already tracked: ${repo}`));
    }
    console.log('');
    return;
  }

  if (action === 'refresh') {
    console.log(chalk.bold('\nvcm peers refresh\n'));
    const cfg = loadConfig();
    const token = cfg.github_token || process.env.VCM_GITHUB_TOKEN;
    if (cfg.peers.length === 0) {
      console.log(chalk.yellow('  ⚠ No peers configured. Run: vcm peers config <owner/repo>'));
      return;
    }
    console.log(`  Token: ${token ? '✓' : '✗ (60/h rate limit)'}`);
    console.log(`  Peers: ${cfg.peers.length}\n`);
    const results = [];
    for (const p of cfg.peers) {
      try {
        const data = await ghFetch(`/repos/${p}`, token);
        results.push({
          repo: p,
          ok: true,
          stars: data.stargazers_count,
          open_issues: data.open_issues_count,
          pushed_at: data.pushed_at,
          description: (data.description || '').slice(0, 60),
        });
      } catch (err) {
        results.push({ repo: p, ok: false, error: err.message });
      }
    }
    console.log(`  ${chalk.bold('Repo'.padEnd(40))} ${chalk.bold('Stars'.padEnd(8))} ${chalk.bold('Issues'.padEnd(10))} ${chalk.bold('Last push'.padEnd(12))} Note`);
    console.log('  ' + '─'.repeat(90));
    for (const r of results) {
      if (!r.ok) {
        console.log(`  ${chalk.red(r.repo.padEnd(40))} ${chalk.red('ERROR')} ${r.error}`);
      } else {
        console.log(`  ${r.repo.padEnd(40)} ${String(r.stars).padEnd(8)} ${String(r.open_issues).padEnd(10)} ${(r.pushed_at || '').slice(0, 10).padEnd(12)} ${r.description}`);
      }
    }
    console.log('');
    return;
  }

  if (action === 'list') {
    console.log(chalk.bold('\nvcm peers\n'));
    const cfg = loadConfig();
    if (cfg.peers.length === 0) {
      console.log(chalk.yellow('  (no peer projects tracked)'));
      console.log(chalk.gray('  Add: vcm peers config <owner/repo>'));
    } else {
      for (const p of cfg.peers) console.log(`  - ${p}`);
    }
    console.log('');
    return;
  }

  if (action === 'add') {
    if (!repo) {
      console.log(chalk.red('  ✗ Usage: vcm peers add <owner/repo>'));
      process.exit(1);
    }
    console.log(chalk.cyan(`  → alias for: vcm peers config ${repo}`));
    return peersCommand('config', repo);
  }

  console.log(chalk.red(`  ✗ Unknown action: ${action}. Use add | list | refresh | config`));
  process.exit(1);
}
