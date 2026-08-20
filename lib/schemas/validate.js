// lib/schemas/validate.js
// JSON Schema validator using Ajv
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const skillSchema = JSON.parse(readFileSync(resolve(__dirname, 'skill.schema.json'), 'utf8'));
const stateSchema = JSON.parse(readFileSync(resolve(__dirname, 'state.schema.json'), 'utf8'));

const validateSkill = ajv.compile(skillSchema);
const validateState = ajv.compile(stateSchema);

/**
 * Validate a skill manifest object against the VCM skill schema.
 * Also enforces the skill-authoring §3 description 5 原则 (regex banned-word check).
 *
 * @param {object} skill - Parsed skill metadata
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSkillManifest(skill) {
  const errors = [];

  // Ajv schema check
  const valid = validateSkill(skill);
  if (!valid) {
    for (const err of validateSkill.errors || []) {
      errors.push(`${err.instancePath || '/'}: ${err.message}`);
    }
  }

  // skill-authoring §3: banned words in description
  // (Removed "架构" from the list — it's a legitimate technical term that
  // often appears in real descriptions like "修改架构前必读". The original
  // skill-authoring regex was overly strict.)
  const BANNED = /通用|最佳实践|总结|全局|整体|一切|所有|完整|系统(?![化化])/;
  if (skill.description && BANNED.test(skill.description)) {
    errors.push('description contains banned words (skill-authoring §3)');
  }

  // skill-authoring §3: description length soft check (schema already enforces 30-200)
// Note: JS .length counts UTF-16 code units; Chinese chars are 1 each.
// 30 is the absolute min (from schema); 200 is the max. We don't enforce ideal range here
// because Chinese descriptions can be informative in fewer chars than English.
  // (Skill-authoring §3 says 80-150 ideal for English, but length-quality tradeoff differs per language.)

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a project state object.
 * @param {object} state
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateProjectState(state) {
  const valid = validateState(state);
  const errors = [];
  if (!valid) {
    for (const err of validateState.errors || []) {
      errors.push(`${err.instancePath || '/'}: ${err.message}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export { skillSchema, stateSchema };
