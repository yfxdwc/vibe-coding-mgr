/**
 * lib/adapters/aas.js - sickn33/agentic-awesome-skills (AAS Core) adapter (ADR-0003).
 *
 * AAS Core's "manifest" idea: a skill describes what files/expressions it
 * applies to. We model the manifest subset (runtime values are real globs;
 * JSDoc strings avoid the literal "slash-star-star-slash" sequence because
 * that would close the doc block).
 *
 * Example runtime shape:
 *   name: "foo"
 *   description: "..."
 *   tags: [...]
 *   manifest: {
 *     match: "src/<DOUBLE_STAR>.py",    // real glob, escaped in this comment
 *     exclude: "<DOUBLE_STAR>/test_*.ext",
 *     load_policy: "auto" | "on-demand"
 *   }
 *
 * load_policy maps to vcm's lifecycle.phase:
 *   auto       -> active
 *   on-demand  -> draft (vcm validate must opt-in)
 */

/**
 * @param {object} aas
 * @returns {object} vcm skill
 */
export function fromAas(aas) {
  if (!aas || typeof aas !== 'object') {
    throw new TypeError('aas.fromAas: expected object');
  }
  const tags = (aas.tags || []).map((t) => String(t).toLowerCase());
  const description = String(aas.description || '').trim();
  if (description.length < 30) {
    throw new RangeError(`description too short (${description.length})`);
  }

  const manifest = aas.manifest || {};
  const phase = manifest.load_policy === 'auto' ? 'active' : 'draft';

  return {
    name: normaliseName(aas.name),
    description,
    tags,
    authority: 'execution-index',
    source: {
      primary: undefined,
      compatible_with: ['sickn33/agentic-awesome-skills'],
    },
    lifecycle: { phase },
    validation: {},
    _origin: {
      format: 'sickn33/agentic-awesome-skills',
      raw: clone(aas),
    },
  };
}

/**
 * @param {object} vcmSkill
 * @returns {object} AAS Core subset
 */
export function toAas(vcmSkill) {
  if (!vcmSkill || typeof vcmSkill !== 'object') {
    throw new TypeError('aas.toAas: expected object');
  }
  const o = vcmSkill._origin?.raw || {};
  return {
    name: vcmSkill.name,
    description: vcmSkill.description,
    tags: vcmSkill.tags || [],
    manifest: o.manifest || {
      match: [],
      exclude: [],
      load_policy: vcmSkill.lifecycle?.phase === 'active' ? 'auto' : 'on-demand',
    },
  };
}

function normaliseName(n) {
  const k = String(n || '').toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(k)) {
    throw new RangeError(`name ${JSON.stringify(n)} -> ${JSON.stringify(k)} fails vcm name pattern`);
  }
  return k;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
