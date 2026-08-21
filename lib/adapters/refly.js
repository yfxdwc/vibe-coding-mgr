/**
 * lib/adapters/refly.js — refly-ai/refly adapter (ADR-0003)
 *
 * refly-ai/refly "durable skills" philosophy: rich metadata + version history
 * + icon/illustration references. We model the durable subset:
 *
 *   {
 *     id: "foo",
 *     displayName: "Foo",
 *     description: "...",
 *     tags: [...],
 *     durable: true,
 *     versions: [{ v: "0.1.0", at: "...", notes: "..." }],
 *     iconRef: "https://..." | null,
 *   }
 *
 * Mapping:
 *   durable=true           → lifecycle.phase: 'active', authority: 'canonical'
 *   versions[0].notes      → description (if description missing)
 *   iconRef                → ignored in vcm (no media schema)
 */

import { namePattern, normaliseNameBase } from './_base.js';

const normaliseName = normaliseNameBase;

export function fromRefly(reflySkill) {
  if (!reflySkill || typeof reflySkill !== 'object') {
    throw new TypeError('refly.fromRefly: expected object');
  }
  const tags = (reflySkill.tags || []).map((t) => String(t).toLowerCase());
  let description = String(reflySkill.description || '').trim();
  if (description.length < 30) {
    const last = reflySkill.versions?.[0];
    if (last?.notes) description = `Latest version (${last.v}): ${last.notes}`;
    else throw new RangeError(`description too short (${description.length})`);
  }

  const durable = !!reflySkill.durable;

  return {
    name: normaliseName(reflySkill.id || reflySkill.name),
    description: description.slice(0, 200),
    tags,
    authority: durable ? 'canonical' : 'execution-index',
    canonical_ref: durable ? `refly:latest` : undefined,
    source: {
      primary: undefined,
      compatible_with: ['refly-ai/refly'],
    },
    lifecycle: { phase: 'active' },
    validation: {},
    _origin: { format: 'refly-ai/refly', raw: clone(reflySkill) },
  };
}

export function toRefly(vcmSkill) {
  if (!vcmSkill || typeof vcmSkill !== 'object') {
    throw new TypeError('refly.toRefly: expected object');
  }
  return {
    id: vcmSkill.name,
    displayName: titleCase(vcmSkill.name),
    description: vcmSkill.description,
    tags: vcmSkill.tags || [],
    durable: vcmSkill.authority === 'canonical',
    versions: vcmSkill.validation?.last_validated
      ? [{ v: '0.1.0', at: vcmSkill.validation.last_validated, notes: vcmSkill.description }]
      : [],
    iconRef: null,
  };
}

function titleCase(slug) {
  return String(slug || '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
