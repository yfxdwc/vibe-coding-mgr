/**
 * lib/adapters/index.js — skill format registry (ADR-0003)
 *
 * Public API:
 *   list()                      → string[] of supported format keys
 *   convert(skill, from, to)    → converts a skill object between formats
 *   sources()                   → friendly labels
 *
 * "vcm" is also accepted as a passthrough (returns a clone + validates).
 *
 * Usage from CLI:
 *   cat skill.json | vcm skill convert --from vercel --to vcm
 */

import * as vercel  from './vercel.js';
import * as tlcs    from './tech-leads-club.js';
import * as aas     from './aas.js';
import * as addyosmani_ from './addyosmani.js';
import * as refly   from './refly.js';

const ADAPTERS = {
  vercel,
  'tech-leads-club': tlcs,
  aas,
  addyosmani: addyosmani_,
  refly,
};

// friendly keys (alias of vercel-labs/skills → vercel, etc.)
const ALIASES = {
  'vercel-labs/skills':          'vercel',
  'tech-leads-club/agent-skills': 'tech-leads-club',
  'sickn33/agentic-awesome-skills': 'aas',
  'addyosmani/agent-skills':     'addyosmani',
  'refly-ai/refly':              'refly',
};

export function list() {
  return [...Object.keys(ADAPTERS), 'vcm'].sort();
}

export function sources() {
  return {
    'vercel':            'vercel-labs/skills',
    'tech-leads-club':   'tech-leads-club/agent-skills',
    'aas':               'sickn33/agentic-awesome-skills',
    'addyosmani':        'addyosmani/agent-skills',
    'refly':             'refly-ai/refly',
    'vcm':               'vibe-coding-mgr (canonical)',
  };
}

export function resolveKey(nameOrAlias) {
  if (nameOrAlias === 'vcm') return 'vcm';
  if (ADAPTERS[nameOrAlias]) return nameOrAlias;
  if (ALIASES[nameOrAlias]) return ALIASES[nameOrAlias];
  return null;
}

export function convert(skill, from, to) {
  const fromKey = resolveKey(from);
  const toKey   = resolveKey(to);
  if (!fromKey) throw new RangeError(`unknown source format: ${from}`);
  if (!toKey)   throw new RangeError(`unknown target format: ${to}`);
  if (fromKey === toKey) throw new RangeError(`--from (${fromKey}) and --to (${toKey}) must differ`);

  // vcm is the pivot: fromX → vcm → toY. Strip _origin when target is vcm.
  const pivot = pivotTo(skill, fromKey);
  if (toKey === 'vcm') {
    const { _origin, ...clean } = pivot;
    return clone(clean);
  }
  return pivotFrom(pivot, toKey);
}

// Dispatch helpers — pair each adapter's from/to functions.
function pivotTo(skill, fromKey) {
  switch (fromKey) {
    case 'vercel':           return vercel.fromVercel(skill);
    case 'tech-leads-club':  return tlcs.fromTechLeadsClub(skill);
    case 'aas':              return aas.fromAas(skill);
    case 'addyosmani':       return addyosmani_.fromAddyosmani(skill);
    case 'refly':            return refly.fromRefly(skill);
    case 'vcm':              return sanitiseVcm(skill);
    default: throw new RangeError(`no pivot adapter for ${fromKey}`);
  }
}

function pivotFrom(vcmSkill, toKey) {
  switch (toKey) {
    case 'vercel':           return vercel.toVercel(vcmSkill);
    case 'tech-leads-club':  return tlcs.toTechLeadsClub(vcmSkill);
    case 'aas':              return aas.toAas(vcmSkill);
    case 'addyosmani':       return addyosmani_.toAddyosmani(vcmSkill);
    case 'refly':            return refly.toRefly(vcmSkill);
    case 'vcm':              return vcmSkill;
    default: throw new RangeError(`no pivot adapter for ${toKey}`);
  }
}

function sanitiseVcm(skill) {
  // Strip _origin so a vcm-skill passed through convert() yields a clean clone
  const { _origin, ...clean } = skill;
  return clone(clean);
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
