/**
 * lib/adapters/addyosmani.js — addyosmani/agent-skills adapter (ADR-0003)
 *
 * addyosmani/agent-skills uses a 6-phase lifecycle:
 *   initialize → plan → execute → verify → ship → reflect
 *
 * Source format (minimal):
 *   {
 *     name: "foo",
 *     description: "...",
 *     tags: [...],
 *     lifecycle: "execute"   // one of the 6 phases
 *     goals: ["...", "..."]  // explicit goal list (added in v0.2)
 *   }
 *
 * Mapping: lifecycle string → vcm.lifecycle.phase enum
 *   initialize/plan         → draft
 *   execute/verify          → active
 *   ship                    → active (with validated_at)
 *   reflect                 → review
 */

/**
 * @param {object} addSkill
 * @returns {object} vcm skill
 */
export function fromAddyosmani(addSkill) {
  if (!addSkill || typeof addSkill !== 'object') {
    throw new TypeError('addyosmani.fromAddyosmani: expected object');
  }
  const tags = (addSkill.tags || []).map((t) => String(t).toLowerCase());
  const description = String(addSkill.description || '').trim();
  if (description.length < 30) {
    throw new RangeError(`description too short (${description.length})`);
  }

  const phaseMap = {
    initialize: 'draft',
    plan:       'draft',
    execute:    'active',
    verify:     'active',
    ship:       'active',
    reflect:    'review',
  };
  const phase = phaseMap[addSkill.lifecycle] || 'draft';

  return {
    name: normaliseName(addSkill.name),
    description,
    tags,
    authority: 'execution-index',
    source: {
      primary: undefined,
      compatible_with: ['addyosmani/agent-skills'],
    },
    lifecycle: { phase },
    validation: addSkill.lifecycle === 'ship'
      ? { last_validated: new Date().toISOString(), checks_passed: ['no-duplicate'] }
      : {},
    _origin: {
      format: 'addyosmani/agent-skills',
      raw: clone(addSkill),
    },
  };
}

/**
 * @param {object} vcmSkill
 * @returns {object} addyosmani subset
 */
export function toAddyosmani(vcmSkill) {
  if (!vcmSkill || typeof vcmSkill !== 'object') {
    throw new TypeError('addyosmani.toAddyosmani: expected object');
  }
  const phase = vcmSkill.lifecycle?.phase || 'draft';
  const lifecycleMap = {
    draft:   'initialize',
    active:  vcmSkill.validation?.last_validated ? 'ship' : 'execute',
    review:  'reflect',
    deprecated: 'reflect',
  };
  const o = vcmSkill._origin?.raw || {};
  return {
    name: vcmSkill.name,
    description: vcmSkill.description,
    tags: vcmSkill.tags || [],
    lifecycle: lifecycleMap[phase] || 'initialize',
    goals: o.goals || [],
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
