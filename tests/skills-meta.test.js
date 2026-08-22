// tests/skills-meta.test.js — Skill registry meta-tests (ADR-0028).
//
// Asserts docs/SKILLS.md exists, each row references a real SKILL.md,
// each SKILL.md has the vcm-mandated frontmatter (name / description / tags),
// descriptions pass the banned-words regex, and canonical_refs resolve.
//
// Mirror of scripts/check_skills.py at the unit-test layer. The shell
// harness runs the Python check on every commit; this test gives
// vitest coverage that catches frontmatter regressions in CI.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VCM_ROOT = join(import.meta.dirname, '..');
const SKILLS_INDEX = join(VCM_ROOT, 'docs', 'SKILLS.md');
const SKILLS_DIR = join(VCM_ROOT, 'docs', 'skills');

// Banned words — must match sales-ai skill-authoring §3 + scripts/check_skills.py.
const BANNED_RE = /通用|最佳实践|总结|全局|整体|一切|所有|完整|系统(?!化)|架构(?!边界)/;

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n(.*?)\n---\s*\n/s);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

function listSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR).filter((d) => {
    const full = join(SKILLS_DIR, d);
    return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
  });
}

function readSkill(slug) {
  return readFileSync(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf8');
}

function indexedSlugs() {
  const text = readFileSync(SKILLS_INDEX, 'utf8');
  const slugs = new Set();
  for (const m of text.matchAll(/\]\(skills\/([a-z0-9-]+)\/SKILL\.md\)/g)) {
    slugs.add(m[1]);
  }
  return [...slugs].sort();
}

describe('docs/SKILLS.md (ADR-0028 §验收 1)', () => {
  it('exists at docs/SKILLS.md', () => {
    expect(existsSync(SKILLS_INDEX)).toBe(true);
  });

  it('indexes at least 6 skill rows (5 governance + skill-authoring meta)', () => {
    expect(indexedSlugs().length).toBeGreaterThanOrEqual(6);
  });

  it('every indexed slug has a real SKILL.md on disk', () => {
    const onDisk = listSkills();
    for (const slug of indexedSlugs()) {
      expect(onDisk).toContain(slug);
    }
  });

  it('every on-disk SKILL.md is referenced in docs/SKILLS.md', () => {
    const indexed = new Set(indexedSlugs());
    for (const slug of listSkills()) {
      expect(indexed.has(slug)).toBe(true);
    }
  });
});

describe('SKILL.md frontmatter (skill.schema.json)', () => {
  for (const slug of listSkills()) {
    describe(slug, () => {
      const text = readSkill(slug);
      const fm = parseFrontmatter(text);

      it('has YAML frontmatter', () => {
        expect(text.startsWith('---\n')).toBe(true);
      });

      it('declares required keys: name / description / tags', () => {
        expect(fm.name).toBeTruthy();
        expect(fm.description).toBeTruthy();
        expect(fm.tags).toBeTruthy();
      });

      it('name matches slug pattern (lowercase, hyphen-separated)', () => {
        expect(fm.name).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
        expect(fm.name.length).toBeGreaterThanOrEqual(3);
      });

      it('description length is 30-200 chars', () => {
        const len = (fm.description || '').length;
        expect(len).toBeGreaterThanOrEqual(30);
        expect(len).toBeLessThanOrEqual(200);
      });

      it('description has no banned words (skill-authoring §3)', () => {
        expect(BANNED_RE.test(fm.description || '')).toBe(false);
      });

      if (fm.authority === 'execution-index') {
        it('authority=execution-index provides canonical_ref', () => {
          expect(fm.canonical_ref).toBeTruthy();
        });
      }
    });
  }
});

describe('ADR <-> skill cross-reference', () => {
  it('every skill with a docs/adr/<n>-*.md canonical_ref resolves on disk', () => {
    const ADR_DIR = join(VCM_ROOT, 'docs', 'adr');
    for (const slug of listSkills()) {
      const fm = parseFrontmatter(readSkill(slug));
      const ref = fm.canonical_ref;
      if (!ref || !ref.includes('docs/adr/')) continue;
      // Resolve relative to docs/skills/<slug>/
      const abs = join(SKILLS_DIR, slug, ref);
      expect(existsSync(abs)).toBe(true);
      // No-op to silence unused-var linters
      void ADR_DIR;
    }
  });
});
