// lib/cli/user.js — Dispatcher for `vcm user` and `vcm token` (ADR-0011)
//
// Forwards to the Python shim lib/cli/users_cli.py which uses
// server/users.py. This indirection avoids duplicating bcrypt + sqlite
// logic in JS.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..', '..');
const PYTHON = join(PROJECT_ROOT, '.venv', 'bin', 'python3');
const SCRIPT = join(HERE, 'users_cli.py');

export async function userTokenCommand(action, sub, name, options = {}) {
  const scriptArgs = [SCRIPT, action, sub, name || ''];
  if (options.label)    scriptArgs.push('--label', options.label);
  if (options.scope)    scriptArgs.push('--scope', options.scope);
  if (options.days)     scriptArgs.push('--days',  String(options.days));
  if (options.password) scriptArgs.push('--password', options.password);
  const r = spawnSync(PYTHON, scriptArgs, { encoding: 'utf8', stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
