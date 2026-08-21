/**
 * lib/adapters/_base.js — shared helpers for adapter modules (ADR-0003)
 */

export const namePattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/**
 * Convert any reasonable name (with underscores, dots, mixed case) into
 * the vcm canonical slug. Throws if no legal slug can be produced.
 */
export function normaliseNameBase(n) {
  if (typeof n !== 'string') {
    throw new TypeError(`name must be string, got ${typeof n}`);
  }
  const k = n.toLowerCase().replace(/_/g, '-').replace(/\./g, '-').replace(/[^a-z0-9-]/g, '');
  if (!namePattern.test(k)) {
    throw new RangeError(`name ${JSON.stringify(n)} -> ${JSON.stringify(k)} fails vcm pattern`);
  }
  return k;
}
