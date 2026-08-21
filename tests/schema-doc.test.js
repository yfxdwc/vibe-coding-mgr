// tests/schema-doc.test.js — vcm schema doc (ADR-0015)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');

function run(args, cwd = VCM_ROOT) {
  return spawnSync('node', [`${VCM_ROOT}/bin/vcm.js`, ...args],
                    { encoding: 'utf8', cwd });
}

describe('vcm schema doc (ADR-0015)', () => {
  it('emits Markdown for skill schema', () => {
    const r = run(['schema', 'doc', 'skill']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Skill');
    expect(r.stdout).toContain('## Required fields');
    expect(r.stdout).toContain('### `name`');
    expect(r.stdout).toMatch(/pattern: `?\^/);
  });

  it('emits Markdown for state schema', () => {
    const r = run(['schema', 'doc', 'state']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# State');
    expect(r.stdout).toContain('### `schema_version`');
  });

  it('accepts arbitrary path to schema.json', () => {
    const r = run(['schema', 'doc', 'lib/schemas/skill.schema.json']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Skill');
  });

  it('--output writes to file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vcm-schemadoc-'));
    const out = join(tmp, 'doc.md');
    try {
      const r = run(['schema', 'doc', 'skill', '--output', out]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('✓ wrote');
      const content = readFileSync(out, 'utf8');
      expect(content).toContain('# Skill');
      expect(content).toContain('## Required fields');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('errors gracefully on unknown schema', () => {
    const r = run(['schema', 'doc', 'no/such/schema.json']);
    expect(r.status).not.toBe(0);
  });

  it('includes enum, default, and minimum constraints when present', () => {
    // Use the existing skill schema which has enum on authority
    const r = run(['schema', 'doc', 'skill']);
    expect(r.stdout).toContain('enum: ["canonical","execution-index"]');
    expect(r.stdout).toContain('default: `"execution-index"`');
    expect(r.stdout).toMatch(/minLength: `3`/);
  });

  it('separates required vs optional fields', () => {
    const r = run(['schema', 'doc', 'skill']);
    // Required header appears before optional header
    const req = r.stdout.indexOf('## Required fields');
    const opt = r.stdout.indexOf('## Optional fields');
    expect(req).toBeGreaterThan(0);
    expect(opt).toBeGreaterThan(req);
    // name is required; authority is not
    expect(r.stdout.indexOf('### `name`')).toBeLessThan(r.stdout.indexOf('### `authority`'));
  });
});
