// tests/cli.test.js — CLI command smoke tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const VCM_ROOT = join(import.meta.dirname, '..');

function run(cmd, cwd) {
  return execSync(cmd, { encoding: 'utf8', cwd: cwd || process.cwd(), stdio: 'pipe' });
}

describe('vcm CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcm-test-'));
    // Make it a git repo so snapshot command works
    execSync('git init -q', { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('vcm --version shows 0.14.1', () => {
    const out = run(`node ${VCM_ROOT}/bin/vcm.js --version`);
    expect(out.trim()).toBe('0.14.1');
  });

  it('vcm init creates AGENTS.md and CHARTER.md', () => {
    run(`node ${VCM_ROOT}/bin/vcm.js init`, tmpDir);
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'CHARTER.md'))).toBe(true);
  });

  it('vcm init substitutes {{PROJECT_NAME}} placeholder', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-test-app' }));
    run(`node ${VCM_ROOT}/bin/vcm.js init`, tmpDir);
    const agents = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('my-test-app');
  });

  it('vcm init skips existing files by default', () => {
    writeFileSync(join(tmpDir, 'AGENTS.md'), 'CUSTOM CONTENT');
    run(`node ${VCM_ROOT}/bin/vcm.js init`, tmpDir);
    const agents = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(agents).toBe('CUSTOM CONTENT');
  });

  it('vcm init --force overwrites', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-test-app' }));
    writeFileSync(join(tmpDir, 'AGENTS.md'), 'CUSTOM CONTENT');
    run(`node ${VCM_ROOT}/bin/vcm.js init --force`, tmpDir);
    const agents = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('my-test-app'); // templated, not custom
  });

  it('vcm snapshot creates a git tag', () => {
    // Need at least one commit first
    writeFileSync(join(tmpDir, 'README.md'), '# test');
    execSync('git add -A && git commit -q -m "init"', { cwd: tmpDir });
    run(`node ${VCM_ROOT}/bin/vcm.js snapshot test-feat`, tmpDir);
    const tags = run('git tag -l', tmpDir);
    expect(tags).toContain('pre-test-feat-');
  });

  it('vcm status generates HTML report', () => {
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# AGENTS');
    writeFileSync(join(tmpDir, 'CHARTER.md'), '# CHARTER');
    execSync('git add -A && git commit -q -m "init"', { cwd: tmpDir });
    run(`node ${VCM_ROOT}/bin/vcm.js status -o .vcm/report.html --no-open`, tmpDir);
    expect(existsSync(join(tmpDir, '.vcm', 'report.html'))).toBe(true);
    const html = readFileSync(join(tmpDir, '.vcm', 'report.html'), 'utf8');
    expect(html).toContain('<title>vcm status');
  });

  it('vcm peers lists (empty config)', () => {
    const out = run(`node ${VCM_ROOT}/bin/vcm.js peers list`);
    // v0.2.0+ uses real GitHub API; with no peers configured, shows "(no peer projects tracked)"
    expect(out).toContain('no peer projects tracked');
  });
});
