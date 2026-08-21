// tests/adapters.test.js — skill adapter layer (ADR-0003)
//
// Round-trip tests: each of the 5 external formats should be convertible
// to a vcm skill (validated by the vcm schema), and re-convertible back.

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as adapters from '../lib/adapters/index.js';
import { fromVercel, toVercel } from '../lib/adapters/vercel.js';
import { fromTechLeadsClub, toTechLeadsClub } from '../lib/adapters/tech-leads-club.js';
import { fromAas, toAas } from '../lib/adapters/aas.js';
import { fromAddyosmani, toAddyosmani } from '../lib/adapters/addyosmani.js';
import { fromRefly, toRefly } from '../lib/adapters/refly.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SCHEMA_PATH = join(ROOT, 'lib/schemas/skill.schema.json');
const skillSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(skillSchema);

const LONG_DESC = 'this skill helps convert between skill metadata formats without losing any optional context during round-trip conversion';

describe('adapter registry', () => {
  it('exposes 5 external formats + vcm canonical', () => {
    expect(adapters.list()).toEqual(['aas', 'addyosmani', 'refly', 'tech-leads-club', 'vcm', 'vercel']);
  });

  it('resolves friendly aliases (vercel-labs/skills → vercel)', () => {
    expect(adapters.resolveKey('vercel-labs/skills')).toBe('vercel');
    expect(adapters.resolveKey('sickn33/agentic-awesome-skills')).toBe('aas');
    expect(adapters.resolveKey('refly-ai/refly')).toBe('refly');
    expect(adapters.resolveKey('nope')).toBe(null);
  });

  it('rejects unknown format in convert()', () => {
    expect(() => adapters.convert({}, 'nope', 'vercel')).toThrow(/unknown source/);
    expect(() => adapters.convert({}, 'vercel', 'nope')).toThrow(/unknown target/);
    expect(() => adapters.convert({}, 'vercel', 'vercel')).toThrow(/must differ/);
  });
});

describe('vercel-labs adapter', () => {
  it('fromVercel produces a vcm-valid skill (after _origin stripped)', () => {
    const out = fromVercel({
      name: 'cool-thing',
      description: LONG_DESC,
      tags: ['cool', 'demo'],
      instructions: 'Do the cool thing.',
    });
    // _origin is intentionally outside schema (metadata for round-trip)
    const { _origin, ...visible } = out;
    const ok = validate(visible);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
    expect(out.name).toBe('cool-thing');
    expect(out.source.compatible_with).toContain('vercel-labs/skills');
    expect(_origin).toBeDefined(); // metadata carried for round-tripping
  });

  it('toVercel round-trip preserves name/description/tags', () => {
    const vcm = fromVercel({
      name: 'cool-thing',
      description: LONG_DESC,
      tags: ['cool'],
      instructions: 'Do the cool thing.',
    });
    const back = toVercel(vcm);
    expect(back.name).toBe('cool-thing');
    expect(back.description).toBe(LONG_DESC);
    expect(back.tags).toEqual(['cool']);
  });

  it('rejects too-short description', () => {
    expect(() => fromVercel({ name: 'foo', description: 'too short' }))
      .toThrow(/description too short/);
  });

  it('rejects name that fails vcm slug pattern', () => {
    // "123-leading-digit" -> normalised to "123-leading-digit" which fails
    // the pattern [a-z][a-z0-9-]*[a-z0-9] (must start with a letter).
    expect(() => fromVercel({ name: '123-leading-digit', description: LONG_DESC }))
      .toThrow(/name/);
  });
});

describe('tech-leads-club adapter', () => {
  it('badges map to authority', () => {
    const canonical = fromTechLeadsClub({
      name: 'foo',
      description: LONG_DESC,
      tags: ['x'],
      badges: ['official'],
      reviewer: 'alice',
      validated_at: '2026-08-21T01:00:00Z',
    });
    expect(canonical.authority).toBe('canonical');
    expect(canonical.validation.last_validated).toBe('2026-08-21T01:00:00Z');

    const ix = fromTechLeadsClub({
      name: 'foo-ix', description: LONG_DESC, tags: [],
    });
    expect(ix.authority).toBe('execution-index');
  });

  it('round-trips', () => {
    const out = fromTechLeadsClub({
      name: 'my-skill', description: LONG_DESC, tags: ['x', 'y'],
      badges: ['official'], reviewer: 'alice', validated_at: '2026-08-21T01:00:00Z',
    });
    const back = toTechLeadsClub(out);
    expect(back.name).toBe('my-skill');
    expect(back.reviewer).toBe('alice');
    expect(back.badges).toContain('official');
  });
});

describe('AAS (sickn33) adapter', () => {
  it('load_policy=auto → lifecycle.active', () => {
    const out = fromAas({
      name: 'foo',
      description: LONG_DESC,
      tags: ['x'],
      manifest: { match: ['src/glob.py'], load_policy: 'auto' },
    });
    expect(out.lifecycle.phase).toBe('active');
    const { _origin, ...visible } = out;
    expect(validate(visible)).toBe(true);
  });

  it('load_policy default → draft', () => {
    const out = fromAas({ name: 'foo-draft', description: LONG_DESC, tags: [] });
    expect(out.lifecycle.phase).toBe('draft');
  });

  it('round-trips', () => {
    const out = fromAas({
      name: 'foo',
      description: LONG_DESC,
      tags: ['bar'],
      manifest: { match: ['*.py'], load_policy: 'on-demand' },
    });
    const back = toAas(out);
    expect(back.manifest.match).toEqual(['*.py']);
    expect(back.manifest.load_policy).toBe('on-demand');
  });
});

describe('addyosmani adapter', () => {
  it.each([
    ['initialize', 'draft'],
    ['plan',       'draft'],
    ['execute',    'active'],
    ['verify',     'active'],
    ['ship',       'active'],
    ['reflect',    'review'],
  ])('lifecycle %s → vcm phase %s', (src, expected) => {
    const out = fromAddyosmani({
      name: 'foo-' + src, description: LONG_DESC, tags: [], lifecycle: src,
    });
    expect(out.lifecycle.phase).toBe(expected);
  });

  it('ship → validation.last_validated set', () => {
    const out = fromAddyosmani({
      name: 'shipped', description: LONG_DESC, tags: [], lifecycle: 'ship',
    });
    expect(out.validation.last_validated).toBeTruthy();
  });
});

describe('refly adapter', () => {
  it('durable=true → authority=canonical', () => {
    const out = fromRefly({
      id: 'my-durable', description: LONG_DESC, tags: [],
      durable: true, versions: [{ v: '0.1.0', at: '2026-08-21T00:00:00Z', notes: 'init' }],
    });
    expect(out.authority).toBe('canonical');
    expect(out.canonical_ref).toBe('refly:latest');
  });

  it('falls back to versions[0].notes if description missing', () => {
    const out = fromRefly({
      id: 'inferred-desc', tags: [], durable: false,
      versions: [{ v: '0.1.0', at: '2026-08-21', notes: LONG_DESC }],
    });
    expect(out.description).toContain(LONG_DESC.slice(0, 50));
  });

  it('toRefly round-trip preserves id and durable flag', () => {
    const out = fromRefly({
      id: 'thingy', description: LONG_DESC, tags: ['a'], durable: true,
      versions: [{ v: '0.1.0', at: '2026-08-21', notes: LONG_DESC }],
    });
    const back = toRefly(out);
    expect(back.id).toBe('thingy');
    expect(back.durable).toBe(true);
  });
});

describe('converter pivot correctness', () => {
  it('convert(vercel → vcm) drops _origin and validates against schema', () => {
    const out = adapters.convert({
      name: 'cool-thing', description: LONG_DESC, tags: ['cool-tag'],
      instructions: 'Do it.',
    }, 'vercel', 'vcm');
    expect(out._origin).toBeUndefined();
    const ok = validate(out);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it('convert(vcm → vercel) returns only vercel-shaped fields', () => {
    const out = adapters.convert({
      name: 'cool-thing', description: LONG_DESC, tags: ['cool'],
      authority: 'execution-index',
      source: { compatible_with: ['vercel-labs/skills'] },
    }, 'vcm', 'vercel');
    expect(out.name).toBe('cool-thing');
    expect(out.description).toBe(LONG_DESC);
    expect(out.tags).toEqual(['cool']);
    expect(out).toHaveProperty('instructions');
  });

  it('convert(aas → tech-leads-club) loses manifest data, gains badges', () => {
    const aasSkill = {
      name: 'flow-x', description: LONG_DESC, tags: ['flow-tag'],
      manifest: { match: ['*.flow'], load_policy: 'auto' },
    };
    const out = adapters.convert(aasSkill, 'aas', 'tech-leads-club');
    expect(out.name).toBe('flow-x');
    expect(out).toHaveProperty('tags');
    expect(out).not.toHaveProperty('manifest');
  });

  it('convert(refly → addyosmani) maps durable=true → lifecycle=six-phase', () => {
    const reflySkill = {
      id: 'refly-skill', description: LONG_DESC, tags: [],
      durable: true,
      versions: [{ v: '0.1.0', at: '2026-08-21', notes: LONG_DESC }],
    };
    const out = adapters.convert(reflySkill, 'refly', 'addyosmani');
    // durable=true → vcm.phase=active → addyosmani 'execute' (no last_validated)
    expect(out.lifecycle).toBe('execute');
  });
});
