// tests/lifecycle.test.js — skill lifecycle automation (ADR-0006)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import {
  deprecateSkill, retireSkill, staleSkills, sweepSkills,
  readSkillMd, writeSkillMd,
} from '../lib/cli/lifecycle.js';

const VCM_ROOT = join(import.meta.dirname, '..');

function run(cmd, cwd) {
  return execSync(cmd, { encoding: 'utf8', cwd: cwd || process.cwd(), stdio: 'pipe' });
}

function makeSkill(cwd, name, opts = {}) {
  const skillDir = join(cwd, '.pi/skills', name);
  mkdirSync(skillDir, { recursive: true });
  const fm = {
    name,
    description: opts.description || `${name} skill for testing lifecycle automation routines in the vcm governance toolchain`,
    tags: ['lifecycle-test'],
    authority: 'execution-index',
    canonical_ref: 'pending',
    lifecycle: { phase: opts.phase || 'active' },
    ...(opts.stewardship ? { stewardship: opts.stewardship } : {}),
  };
  const yaml = require_yaml();
  const fmText = yaml.dump(fm);
  const md = `---\n${fmText}---\n\n# ${name}\n`;
  writeFileSync(join(skillDir, 'SKILL.md'), md);
  return skillDir;
}

// Lazy import to avoid ESM-default-export footgun (matches lifecycle.js)
function require_yaml() {
  // js-yaml exports named exports only, so we wrap it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ym = require('js-yaml');
  return ym.default || ym;
}

describe('lifecycle: front-matter round-trip', () => {
  it('readSkillMd returns frontmatter and body', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-'));
    try {
      const skillDir = makeSkill(tmp, 'round-trip-test');
      const { fm, body } = readSkillMd(join(skillDir, 'SKILL.md'));
      expect(fm.name).toBe('round-trip-test');
      expect(fm.tags).toEqual(['lifecycle-test']);
      expect(body).toContain('# round-trip-test');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  it('writeSkillMd preserves frontmatter', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-'));
    try {
      const skillDir = makeSkill(tmp, 'write-test');
      const fm = { name: 'write-test', tags: ['a', 'b'], description: 're-thought description for the write-test skill after a rewrite' };
      writeSkillMd(join(skillDir, 'SKILL.md'), fm, '\n# write-test\n');
      const back = readSkillMd(join(skillDir, 'SKILL.md'));
      expect(back.fm.name).toBe('write-test');
      expect(back.fm.tags).toEqual(['a', 'b']);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe('lifecycle: deprecate', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-dep-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('marks skill deprecated with deprecated_at timestamp', () => {
    makeSkill(tmp, 'old-skill');
    deprecateSkill(tmp, 'old-skill');
    const { fm } = readSkillMd(join(tmp, '.pi/skills/old-skill/SKILL.md'));
    expect(fm.lifecycle.phase).toBe('deprecated');
    expect(fm.lifecycle.deprecated_at).toBeTruthy();
    // ISO date check
    expect(new Date(fm.lifecycle.deprecated_at).getTime()).not.toBeNaN();
  });

  it('records replaced_by if provided', () => {
    makeSkill(tmp, 'old-skill');
    deprecateSkill(tmp, 'old-skill', 'new-skill');
    const { fm } = readSkillMd(join(tmp, '.pi/skills/old-skill/SKILL.md'));
    expect(fm.lifecycle.replaced_by).toBe('new-skill');
  });

  it('exits 2 if skill does not exist', () => {
    expect(() => deprecateSkill(tmp, 'no-such-skill'))
      .toThrow(/process\.exit/);
  });
});

describe('lifecycle: retire', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-ret-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('refuses without --yes flag', () => {
    makeSkill(tmp, 'old-skill');
    expect(() => retireSkill(tmp, 'old-skill'))
      .toThrow(/process\.exit/);
    expect(existsSync(join(tmp, '.pi/skills/old-skill'))).toBe(true);
  });

  it('deletes the skill dir with --yes', () => {
    makeSkill(tmp, 'to-retire');
    retireSkill(tmp, 'to-retire', { yes: true });
    expect(existsSync(join(tmp, '.pi/skills/to-retire'))).toBe(false);
  });

  it('exits 2 if skill does not exist', () => {
    expect(() => retireSkill(tmp, 'no-such', { yes: true }))
      .toThrow(/process\.exit/);
  });
});

describe('lifecycle: stale', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-st-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('lists skills older than N days', () => {
    makeSkill(tmp, 'oldie');
    // fake mtime: 100 days ago
    const path = join(tmp, '.pi/skills/oldie/SKILL.md');
    utimesSync(path, new Date(Date.now() - 100 * 86400 * 1000), new Date(Date.now() - 100 * 86400 * 1000));
    makeSkill(tmp, 'freshie');

    const captured = [];
    const _orig = console.log;
    console.log = (...args) => captured.push(args.join(' '));
    try { staleSkills(tmp, 30); } finally { console.log = _orig; }
    const out = captured.join('\n');
    expect(out).toContain('oldie');
    expect(out).not.toContain('freshie');
  });

  it('reports nothing when all skills are fresh', () => {
    makeSkill(tmp, 'freshie');
    const captured = [];
    const _orig = console.log;
    console.log = (...args) => captured.push(args.join(' '));
    try { staleSkills(tmp, 90); } finally { console.log = _orig; }
    const out = captured.join('\n');
    expect(out).toMatch(/no skills stale/);
  });
});

describe('lifecycle: sweep', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-sw-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('dry-run reports targets but does not modify', () => {
    makeSkill(tmp, 'to-deprecate');
    const path = join(tmp, '.pi/skills/to-deprecate/SKILL.md');
    utimesSync(path, new Date(Date.now() - 200 * 86400 * 1000), new Date(Date.now() - 200 * 86400 * 1000));
    const captured = [];
    const _orig = console.log;
    console.log = (...args) => captured.push(args.join(' '));
    try { sweepSkills(tmp, { dryRun: true, days: 90 }); } finally { console.log = _orig; }
    expect(captured.join('\n')).toContain('Dry run');
    const { fm } = readSkillMd(path);
    expect(fm.lifecycle?.phase).toBe('active');   // unchanged
  });

  it('with --yes actually deprecates in bulk', () => {
    makeSkill(tmp, 'sweep-1');
    makeSkill(tmp, 'sweep-2');
    for (const n of ['sweep-1', 'sweep-2']) {
      const p = join(tmp, '.pi/skills', n, 'SKILL.md');
      utimesSync(p, new Date(Date.now() - 200 * 86400 * 1000), new Date(Date.now() - 200 * 86400 * 1000));
    }
    sweepSkills(tmp, { dryRun: false, yes: true, days: 90 });
    for (const n of ['sweep-1', 'sweep-2']) {
      const { fm } = readSkillMd(join(tmp, '.pi/skills', n, 'SKILL.md'));
      expect(fm.lifecycle.phase).toBe('deprecated');
    }
  });

  it('skips already-deprecated skills', () => {
    makeSkill(tmp, 'already-old', { phase: 'deprecated' });
    const path = join(tmp, '.pi/skills/already-old/SKILL.md');
    utimesSync(path, new Date(Date.now() - 200 * 86400 * 1000), new Date(Date.now() - 200 * 86400 * 1000));
    const result = sweepSkills(tmp, { dryRun: true, days: 90 });
    expect(result.find(s => s.name === 'already-old')).toBeUndefined();
  });
});

describe('lifecycle: CLI integration', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcm-lc-cli-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('vcm skill deprecate updates the SKILL.md', () => {
    makeSkill(tmp, 'life-cli-1');
    run(`node ${VCM_ROOT}/bin/vcm.js skill deprecate life-cli-1`, tmp);
    const { fm } = readSkillMd(join(tmp, '.pi/skills/life-cli-1/SKILL.md'));
    expect(fm.lifecycle.phase).toBe('deprecated');
  });

  it('vcm skill retire --yes deletes the skill', () => {
    makeSkill(tmp, 'will-retire');
    run(`node ${VCM_ROOT}/bin/vcm.js skill retire will-retire --yes`, tmp);
    expect(existsSync(join(tmp, '.pi/skills/will-retire'))).toBe(false);
  });

  it('vcm skill stale --days 1 lists older skills only', () => {
    makeSkill(tmp, 'ancient');
    const path = join(tmp, '.pi/skills/ancient/SKILL.md');
    utimesSync(path, new Date(Date.now() - 100 * 86400 * 1000), new Date(Date.now() - 100 * 86400 * 1000));
    const out = run(`node ${VCM_ROOT}/bin/vcm.js skill stale --days 30`, tmp);
    expect(out).toContain('ancient');
  });
});
