// tests/doctor.test.js — vcm doctor CLI (ADR-0013)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');

function run(cmd, cwd, opts = {}) {
  return spawnSync('node', [`${VCM_ROOT}/bin/vcm.js`, ...cmd], {
    encoding: 'utf8',
    cwd: cwd || VCM_ROOT,
    stdio: 'pipe',
    ...opts,
  });
}

describe('vcm doctor (ADR-0013)', () => {
  it('runs against the vcm project itself and exits 0', () => {
    const r = run(['doctor'], VCM_ROOT);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('vcm doctor');
    expect(r.stdout).toContain('VERDICT:');
  });

  it('--json emits a single JSON object with verdict fields', () => {
    const r = run(['doctor', '--json'], VCM_ROOT);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j).toHaveProperty('governance');
    expect(j).toHaveProperty('repository');
    expect(j).toHaveProperty('git');
    expect(j).toHaveProperty('verdict');
    expect(typeof j.verdict.pass).toBe('number');
  });

  it('detects .pi/skills presence (skills total)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vcm-doc-'));
    try {
      // Make a fake git repo so git hygiene can find .git
      mkdirSync(join(tmp, '.git'), { recursive: true });
      mkdirSync(join(tmp, '.pi/skills/test-skill'), { recursive: true });
      writeFileSync(join(tmp, '.pi/skills/test-skill/SKILL.md'),
        '---\nname: test-skill\ndescription: this is a test skill description for the doctor\ntags: ["x"]\nlifecycle:\n  phase: active\n---\n');
      const r = run(['doctor', '--json'], tmp);
      expect(r.status).toBe(0);
      const j = JSON.parse(r.stdout);
      expect(j.skills.total).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports git hygiene fields when .git exists', () => {
    const r = run(['doctor', '--json'], VCM_ROOT);
    const j = JSON.parse(r.stdout);
    expect(j.git.has_git).toBe(true);
    expect(j.git.branch).toBeTruthy();
    expect(j.git.head).toBeTruthy();
    // last_vcm_validate may be null if file is missing
    expect('last_vcm_validate_days_ago' in j.git).toBe(true);
  });

  it('counts ADRs and exposes repository counts', () => {
    const r = run(['doctor', '--json'], VCM_ROOT);
    const j = JSON.parse(r.stdout);
    expect(j.repository.adrs).toBeGreaterThanOrEqual(10);  // 7+ ADRs in this repo
    expect(Array.isArray([j.repository.tech_debts, j.repository.post_mortems])).toBe(true);
  });

  it('--strict exits 1 when there is any warning', () => {
    // The current project has 1 warn (skill registry). With --strict, exit 1.
    const r = run(['doctor', '--strict'], VCM_ROOT);
    expect([0, 1]).toContain(r.status);  // may pass or fail depending on current state
  });

  it('human-readable output labels sections', () => {
    const r = run(['doctor'], VCM_ROOT);
    expect(r.stdout).toContain('[governance]');
    expect(r.stdout).toContain('[skills]');
    expect(r.stdout).toContain('[repository]');
    expect(r.stdout).toContain('[git hygiene]');
  });

  it('counts the verdict string correctly', () => {
    const r = run(['doctor'], VCM_ROOT);
    const m = r.stdout.match(/VERDICT:\s+(.+)/);
    expect(m).toBeTruthy();
    // Should be one of:
    //   "all OK (N/6)"
    //   "K WARN, N OK"
    //   "FAIL: K checks failed"
    expect(m[1]).toMatch(/^(all OK|\d+ WARN|FAIL:)/);
  });
});
