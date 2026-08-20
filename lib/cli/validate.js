// lib/cli/validate.js
// Run the 6 hard checks against the current project
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, '..', '..', 'scripts');

/**
 * @typedef {{ name: string, status: 'OK'|'WARN'|'FAIL', output: string }} CheckResult
 */

/** @type {(scriptName: string, args?: string) => CheckResult} */
function runCheck(scriptName, args) {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);
  if (!existsSync(scriptPath)) {
    return { name: scriptName, status: 'WARN', output: `script not found: ${scriptPath}` };
  }
  try {
    const output = execSync(`python3 ${scriptPath} ${args || ''}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    // Heuristic: any "FAIL" or "✗" in output → FAIL, "WARN" → WARN, else OK
    if (/FAIL|✗\s*[1-9]|硬违例/.test(output)) return { name: scriptName, status: 'FAIL', output };
    if (/WARN|⚠/.test(output)) return { name: scriptName, status: 'WARN', output };
    return { name: scriptName, status: 'OK', output };
  } catch (err) {
    return { name: scriptName, status: 'FAIL', output: err.stderr || err.message };
  }
}

const CHECKS = [
  { script: 'check_charter.py', args: '--no-fail' },
  { script: 'check_doc_drift.py', args: '--no-fail' },
  { script: 'check_constraint_governance.py', args: '--no-fail' },
  { script: 'check_adr_index.py', args: '--no-fail' },
  { script: 'check_data_layout.py', args: '--no-fail' },
];

export async function validateCommand(options) {
  console.log(chalk.bold('\nvcm validate — 6 hard checks\n'));

  const results = [];
  for (const check of CHECKS) {
    process.stdout.write(`  Running ${check.script}... `);
    const result = runCheck(check.script, check.args);
    const icon = result.status === 'OK' ? chalk.green('✓') :
                 result.status === 'WARN' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(`${icon} ${result.status}`);
    results.push(result);
  }

  // Skill registry check (always pass if .pi/skills or docs/skills exists)
  console.log('\n  Running skill registry check...');
  try {
    const hasPiSkills = existsSync(resolve(process.cwd(), '.pi/skills'));
    const hasDocsSkills = existsSync(resolve(process.cwd(), 'docs/skills'));
    if (hasPiSkills || hasDocsSkills) {
      console.log(chalk.green(`  ✓ OK — skill directory present`));
      results.push({ name: 'skill_registry', status: 'OK', output: '' });
    } else {
      console.log(chalk.yellow(`  ⚠ WARN — no .pi/skills or docs/skills directory`));
      results.push({ name: 'skill_registry', status: 'WARN', output: '' });
    }
  } catch (err) {
    console.log(chalk.red(`  ✗ FAIL — ${err.message}`));
    results.push({ name: 'skill_registry', status: 'FAIL', output: err.message });
  }

  // Summary
  console.log(chalk.bold('\nSummary:'));
  const ok = results.filter(r => r.status === 'OK').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`  ${chalk.green('OK')} ${ok}  ${chalk.yellow('WARN')} ${warn}  ${chalk.red('FAIL')} ${fail}`);

  if (fail > 0) {
    console.log(chalk.red.bold('\n  ✗ Hard violations detected'));
    if (options.ci) {
      process.exit(1);
    }
  } else if (warn > 0) {
    console.log(chalk.yellow.bold('\n  ⚠ Warnings present'));
  } else {
    console.log(chalk.green.bold('\n  ✓ All checks passed'));
  }
  console.log('');
}
