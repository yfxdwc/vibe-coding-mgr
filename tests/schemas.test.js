// tests/schemas.test.js
import { describe, it, expect } from 'vitest';
import { validateSkillManifest, validateProjectState } from '../lib/schemas/validate.js';

describe('validateSkillManifest', () => {
  const validSkill = {
    name: 'sales-ai-test-skill',
    description: '修改 backend 模块前必读 — 含架构摘要、热点清单、blast radius 查询方法',
    tags: ['dev', 'backend'],
    authority: 'execution-index',
    canonical_ref: '../docs/foo.md',
  };

  it('accepts a well-formed skill', () => {
    const r = validateSkillManifest(validSkill);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects description with banned words (skill-authoring §3)', () => {
    const r = validateSkillManifest({ ...validSkill, description: '通用前端最佳实践总结' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('banned'))).toBe(true);
  });

  it('rejects short description (< 30 chars)', () => {
    const r = validateSkillManifest({ ...validSkill, description: 'too short' });
    expect(r.valid).toBe(false);
  });

  it('rejects description > 200 chars', () => {
    const long = 'a'.repeat(201);
    const r = validateSkillManifest({ ...validSkill, description: long });
    expect(r.valid).toBe(false);
  });

  it('rejects name with invalid pattern', () => {
    const r = validateSkillManifest({ ...validSkill, name: 'Invalid_Name' });
    expect(r.valid).toBe(false);
  });

  it('rejects name with uppercase', () => {
    const r = validateSkillManifest({ ...validSkill, name: 'BadName' });
    expect(r.valid).toBe(false);
  });

  });

describe('validateProjectState', () => {
  const validState = {
    schema_version: '0.1.0',
    project: { name: 'sales-ai', path: '/home/mm7/sales-ai', registered_at: '2026-08-20T00:00:00Z' },
    generated_at: '2026-08-20T00:00:00Z',
    vcm_version: '0.1.0',
    governance: {
      agents_md_present: true,
      charter_md_present: true,
      skills_count: 15,
      adrs_count: 18,
      tds_count: 60,
      post_mortems_count: 5,
    },
    health: { last_snapshot_at: '2026-08-20T00:00:00Z', last_ci_pass: true, ci_warnings: 0, ci_failures: 0 },
    git: { head_commit: 'abc1234', branch: 'master', dirty: false, last_commit_at: '2026-08-20T00:00:00Z' },
  };

  it('accepts a well-formed state', () => {
    const r = validateProjectState(validState);
    expect(r.valid).toBe(true);
  });

  it('rejects missing schema_version', () => {
    const { schema_version, ...rest } = validState;
    const r = validateProjectState(rest);
    expect(r.valid).toBe(false);
  });

  it('rejects missing project', () => {
    const { project, ...rest } = validState;
    const r = validateProjectState(rest);
    expect(r.valid).toBe(false);
  });
});
