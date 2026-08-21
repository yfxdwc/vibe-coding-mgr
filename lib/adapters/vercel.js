/**
 * lib/adapters/vercel.js — vercel-labs/skills adapter (ADR-0003)
 *
 * Source format (minimal):
 *   { name: "foo", description: "...", instructions: "...", tags?: [...] }
 *
 * Note: vercel-labs/skills has a richer schema (markdown file with frontmatter),
 * but we only model the JSON-frontmatter subset for in-memory conversion.
 * No file I/O, no network — pure function.
 */

/**
 * @param {object} vercelSkill
 * @returns {object} vcm skill object (passes skill.schema.json)
 */
export function fromVercel(vercelSkill) {
  if (!vercelSkill || typeof vercelSkill !== 'object') {
    throw new TypeError('vercel.fromVercel: expected object');
  }
  const tags = normaliseTags(vercelSkill.tags);
  // description: prefer description, fall back to first 200 chars of instructions
  const description = (vercelSkill.description || truncate(vercelSkill.instructions, 200) || '').trim();
  if (description.length < 30) {
    throw new RangeError(`vercel.fromVercel: description too short (${description.length} chars, min 30)`);
  }
  return {
    name: normaliseName(vercelSkill.name),
    description,
    tags,
    authority: 'execution-index',
    source: {
      primary: undefined,
      compatible_with: ['vercel-labs/skills'],
    },
    lifecycle: { phase: 'active' },
    validation: {},
    // carry the original body so round-tripping works
    _origin: { format: 'vercel-labs/skills', raw: clone(vercelSkill) },
  };
}

/**
 * @param {object} vcmSkill
 * @returns {object} vercel-labs/skills subset
 */
export function toVercel(vcmSkill) {
  if (!vcmSkill || typeof vcmSkill !== 'object') {
    throw new TypeError('vercel.toVercel: expected object');
  }
  return {
    name: vcmSkill.name,
    description: vcmSkill.description,
    instructions: extractInstructions(vcmSkill),
    tags: vcmSkill.tags || [],
  };
}

function normaliseName(n) {
  if (typeof n !== 'string') throw new TypeError('name must be string');
  const k = n.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(k)) {
    throw new RangeError(`name ${JSON.stringify(n)} -> ${JSON.stringify(k)} fails vcm name pattern`);
  }
  return k;
}

function normaliseTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => {
    if (typeof t !== 'string') throw new TypeError(`tag must be string, got ${typeof t}`);
    return t.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }).filter((t) => t.length >= 2);
}

function truncate(s, max) {
  if (!s) return '';
  const t = String(s).trim();
  return t.length <= max ? t : t.slice(0, max - 3) + '...';
}

function extractInstructions(vcm) {
  if (vcm._origin?.raw?.instructions) return vcm._origin.raw.instructions;
  // fallback: stitch description + tag hint
  return vcm.description;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
