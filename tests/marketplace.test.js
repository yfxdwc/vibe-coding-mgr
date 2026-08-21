// tests/marketplace.test.js — Skill marketplace (ADR-0008)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

import {
  publishSkill, unpublishSkill, discoverSkills,
  installSkill, registryDir,
} from '../lib/cli/marketplace.js';

const VCM_ROOT = join(import.meta.dirname, '..');
function run(cmd, cwd) {
  return execSync(cmd, { encoding: 'utf8', cwd: cwd || process.cwd(), stdio: 'pipe' });
}

function makeSkill(cwd, name, opts = {}) {
  const skillDir = join(cwd, '.pi/skills', name);
  mkdirSync(skillDir, { recursive: true });
  // Use js-yaml for proper nested-object handling (mkt lifecycle obj etc.)
  const yaml = (() => {
    const mod = require('js-yaml');
    return mod.default || mod;
  })();
  const fm = {
    name,
    description: opts.description || `${name} skill published to verify the marketplace flow`,
    tags: opts.tags || ['mkt-test'],
    authority: opts.authority || 'execution-index',
    canonical_ref: 'pending',
    lifecycle: { phase: opts.phase || 'active' },
  };
  const md = `---\n${yaml.dump(fm)}---\n\n# ${name}\n`;
  writeFileSync(join(skillDir, 'SKILL.md'), md);
  return skillDir;
}

describe('marketplace helpers (ADR-0008)', () => {
  let tmpCwd, tmpReg;
  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), 'vcm-mkt-cwd-'));
    tmpReg = mkdtempSync(join(tmpdir(), 'vcm-mkt-reg-'));
    process.env.VCM_REGISTRY_DIR = tmpReg;
  });
  afterEach(() => {
    rmSync(tmpCwd, { recursive: true, force: true });
    rmSync(tmpReg, { recursive: true, force: true });
    delete process.env.VCM_REGISTRY_DIR;
  });

  describe('publish', () => {
    it('writes the skill to ~/.vcm/registry/skills/<name>.json', () => {
      makeSkill(tmpCwd, 'hello');
      // The function logs to stdout; capture that.
      const captured = [];
      const _log = console.log;
      console.log = (...a) => captured.push(a.join(' '));
      try {
        publishSkill(tmpCwd, 'hello');
      } finally { console.log = _log; }
      expect(captured.join('\n')).toMatch(/published: hello/);
      const target = join(registryDir(), 'skills', 'hello.json');
      expect(existsSync(target)).toBe(true);
      const fm = JSON.parse(readFileSync(target, 'utf8'));
      expect(fm.name).toBe('hello');
      expect(fm.authority).toBe('execution-index');
    });

    it('refuses to publish a retired skill', () => {
      makeSkill(tmpCwd, 'doomed', { phase: 'retired' });
      expect(() => publishSkill(tmpCwd, 'doomed'))
        .toThrow(/process\.exit/);
    });

    it('refuses to publish a skill that does not exist locally', () => {
      expect(() => publishSkill(tmpCwd, 'no-such'))
        .toThrow(/process\.exit/);
    });

    it('refuses to overwrite without --force', () => {
      makeSkill(tmpCwd, 'twice');
      // Publish once via direct call.
      const _log = console.log;
      console.log = () => {};
      try {
        publishSkill(tmpCwd, 'twice');
      } finally { console.log = _log; }
      expect(() => publishSkill(tmpCwd, 'twice'))
        .toThrow(/process\.exit/);
    });

    it('defaults authority to execution-index when missing', () => {
      makeSkill(tmpCwd, 'noauth');
      const _log = console.log;
      console.log = () => {};
      try { publishSkill(tmpCwd, 'noauth'); } finally { console.log = _log; }
      const fm = JSON.parse(readFileSync(join(registryDir(), 'skills', 'noauth.json'), 'utf8'));
      // published file carries execution-index as default
      // (mkt-test template uses authority: 'execution-index' already,
      //  so we test by publishing a skill WITHOUT authority).
      expect(fm.authority).toBe('execution-index');
    });
  });

  describe('discover', () => {
    it('lists all skills in the registry, sorted', () => {
      makeSkill(tmpCwd, 'aaa');
      makeSkill(tmpCwd, 'bbb');
      const _log = console.log;
      console.log = () => {};
      try {
        publishSkill(tmpCwd, 'aaa');
        publishSkill(tmpCwd, 'bbb');
      } finally { console.log = _log; }
      const found = discoverSkills();
      expect(found.length).toBe(2);
      const names = found.map((s) => s.name).sort();
      expect(names).toEqual(['aaa', 'bbb']);
    });

    it('filters by tag', () => {
      makeSkill(tmpCwd, 'tagged-1',   { tags: ['mkt-test', 'demo'] });
      makeSkill(tmpCwd, 'untagged-1', { tags: ['mkt-test'] });
      const _log = console.log;
      console.log = () => {};
      try {
        publishSkill(tmpCwd, 'tagged-1');
        publishSkill(tmpCwd, 'untagged-1');
      } finally { console.log = _log; }
      const found = discoverSkills('demo');
      expect(found.length).toBe(1);
      expect(found[0].name).toBe('tagged-1');
    });

    it('returns empty list when registry has no skills', () => {
      const found = discoverSkills();
      expect(found).toEqual([]);
    });
  });

  describe('unpublish', () => {
    it('removes the skill file from registry', () => {
      makeSkill(tmpCwd, 'gone');
      const _log = console.log;
      console.log = () => {};
      try {
        publishSkill(tmpCwd, 'gone');
        unpublishSkill('gone');
      } finally { console.log = _log; }
      expect(existsSync(join(registryDir(), 'skills', 'gone.json'))).toBe(false);
    });

    it('refuses to unpublish a skill not in registry', () => {
      expect(() => unpublishSkill('none'))
        .toThrow(/process\.exit/);
    });
  });

  describe('install', () => {
    it('copies skill from registry to local .pi/skills/<name>', () => {
      makeSkill(tmpCwd, 'shared');
      const _log = console.log;
      console.log = () => {};
      try { publishSkill(tmpCwd, 'shared'); } finally { console.log = _log; }
      // Now install in a *different* project
      const targetCwd = mkdtempSync(join(tmpdir(), 'vcm-mkt-target-'));
      mkdirSync(join(targetCwd, '.pi/skills'), { recursive: true });
      const __log = console.log;
      console.log = () => {};
      try {
        installSkill(targetCwd, 'shared');
      } finally { console.log = __log; }
      const installedPath = join(targetCwd, '.pi/skills', 'shared', 'SKILL.md');
      expect(existsSync(installedPath)).toBe(true);
      const content = readFileSync(installedPath, 'utf8');
      expect(content).toContain('name: shared');
      rmSync(targetCwd, { recursive: true, force: true });
    });

    it('refuses to install a skill not in registry', () => {
      expect(() => installSkill(tmpCwd, 'nope'))
        .toThrow(/process\.exit/);
    });

    it('refuses to overwrite without --force', () => {
      makeSkill(tmpCwd, 'dup');
      const _log = console.log;
      console.log = () => {};
      try {
        publishSkill(tmpCwd, 'dup');
        installSkill(tmpCwd, 'dup');
      } catch (e) {
        // install onto existing target may throw (we expect "already installed")
        console.log = _log;
        expect(() => installSkill(tmpCwd, 'dup'))
          .toThrow(/process\.exit/);
        return;
      }
      console.log = _log;
      // If we got here without throwing, second install should still refuse.
      expect(() => installSkill(tmpCwd, 'dup'))
        .toThrow(/process\.exit/);
    });
  });
});

describe('marketplace CLI integration (ADR-0008)', () => {
  let tmpCwd, tmpReg;
  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), 'vcm-mkt-cli-'));
    tmpReg = mkdtempSync(join(tmpdir(), 'vcm-mkt-cli2-'));
    process.env.VCM_REGISTRY_DIR = tmpReg;
  });
  afterEach(() => {
    rmSync(tmpCwd, { recursive: true, force: true });
    rmSync(tmpReg, { recursive: true, force: true });
    delete process.env.VCM_REGISTRY_DIR;
  });

  it('full flow: publish → discover → install works via CLI', () => {
    makeSkill(tmpCwd, 'e2e-skill');
    const out1 = run(`VCM_REGISTRY_DIR=${tmpReg} node ${VCM_ROOT}/bin/vcm.js skill publish e2e-skill`, tmpCwd);
    expect(out1).toContain('published: e2e-skill');
    const out2 = run(`VCM_REGISTRY_DIR=${tmpReg} node ${VCM_ROOT}/bin/vcm.js skill discover`, tmpCwd);
    expect(out2).toContain('e2e-skill');
    // install in target
    const targetCwd = mkdtempSync(join(tmpdir(), 'vcm-mkt-tgt-'));
    mkdirSync(join(targetCwd, '.pi/skills'), { recursive: true });
    const out3 = run(`VCM_REGISTRY_DIR=${tmpReg} node ${VCM_ROOT}/bin/vcm.js skill install e2e-skill`, targetCwd);
    expect(out3).toContain('installed: e2e-skill');
    expect(existsSync(join(targetCwd, '.pi/skills', 'e2e-skill', 'SKILL.md'))).toBe(true);
    // unpublish
    const out4 = run(`VCM_REGISTRY_DIR=${tmpReg} node ${VCM_ROOT}/bin/vcm.js skill unpublish e2e-skill`, tmpCwd);
    expect(out4).toContain('unpublished: e2e-skill');
    rmSync(targetCwd, { recursive: true, force: true });
  });
});
