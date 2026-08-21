/**
 * lib/adapters/tech-leads-club.js — tech-leads-club/agent-skills adapter (ADR-0003)
 *
 * Source format (minimal):
 *   {
 *     name: "foo",
 *     description: "...",
 *     tags: [...],
 *     validated_at: "2026-08-21T..." | null,
 *     reviewer: "github-user" | null,
 *     badges: ["security-reviewed", "official", ...] | [],
 *   }
 *
 * tech-leads-club distinguishes between "validated" (peer-reviewed) and
 * community skills. We map badges to authority:
 *   - "official" or "security-reviewed"  → authority: "canonical"
 *   - otherwise                          → authority: "execution-index"
 */

/**
 * @param {object} tlcs
 * @returns {object} vcm skill
 */
export function fromTechLeadsClub(tlcs) {
  if (!tlcs || typeof tlcs !== 'object') {
    throw new TypeError('tech-leads-club.fromTechLeadsClub: expected object');
  }
  const tags = (tlcs.tags || []).map((t) => String(t).toLowerCase());
  const description = String(tlcs.description || '').trim();
  if (description.length < 30) {
    throw new RangeError(`description too short (${description.length})`);
  }
  const badges = Array.isArray(tlcs.badges) ? tlcs.badges : [];
  const authority = (badges.includes('official') || badges.includes('security-reviewed'))
    ? 'canonical' : 'execution-index';

  return {
    name: normaliseName(tlcs.name),
    description,
    tags,
    authority,
    canonical_ref: tlcs.reviewer ? `tlcs:${tlcs.reviewer}` : undefined,
    source: {
      primary: undefined,
      compatible_with: ['tech-leads-club/agent-skills', ...badgesToCompat(badges)],
    },
    validation: tlcs.validated_at ? {
      last_validated: tlcs.validated_at,
      validator: tlcs.reviewer ? `tlcs:${tlcs.reviewer}` : undefined,
      checks_passed: badges.length ? ['no-duplicate'] : [],
    } : {},
    lifecycle: { phase: 'active' },
    _origin: { format: 'tech-leads-club/agent-skills', raw: clone(tlcs) },
  };
}

/**
 * @param {object} vcmSkill
 * @returns {object} tech-leads-club/agent-skills subset
 */
export function toTechLeadsClub(vcmSkill) {
  if (!vcmSkill || typeof vcmSkill !== 'object') {
    throw new TypeError('tech-leads-club.toTechLeadsClub: expected object');
  }
  const o = vcmSkill._origin?.raw || {};
  const validated = vcmSkill.validation?.last_validated || null;
  const reviewer = (vcmSkill.canonical_ref || '').startsWith('tlcs:')
    ? vcmSkill.canonical_ref.slice(5) : null;
  const badges = vcmSkill.authority === 'canonical'
    ? (validated ? ['official'] : ['security-reviewed'])
    : [];
  return {
    name: vcmSkill.name,
    description: vcmSkill.description,
    tags: vcmSkill.tags || [],
    validated_at: validated,
    reviewer,
    badges,
    original: o,
  };
}

function badgesToCompat(badges) {
  const map = {
    'official': 'vercel-labs/skills',
    'security-reviewed': 'sickn33/agentic-awesome-skills',
  };
  return [...new Set(badges.map((b) => map[b]).filter(Boolean))];
}

function normaliseName(n) {
  const k = String(n || '').toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(k)) {
    throw new RangeError(`name ${JSON.stringify(n)} -> ${JSON.stringify(k)} fails vcm name pattern`);
  }
  return k;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
