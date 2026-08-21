// lib/cli/marketplace.js — Skill marketplace / publish / discover / install (ADR-0008)
//
// Local registry at ~/.vcm/registry/ that shares the vcm skill format
// across projects. No network, no sign-in, no GitHub dependency.
//
// Layout:
//   ~/.vcm/registry/
//     index.json                          // [ {name, tags, authority, ...} ]
//     skills/<skill-name>.json            // full vcm skill
//
// The index is rebuilt from filesystem on every `discover` so external
// edits work too.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { validateSkillManifest } from '../schemas/validate.js';

export function registryDir() {
  const custom = process.env.VCM_REGISTRY_DIR;
  if (custom) return resolve(custom);
  return resolve(process.env.HOME || '/tmp', '.vcm', 'registry');
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function skillsDir() { return join(registryDir(), 'skills'); }
function indexPath()  { return join(registryDir(), 'index.json'); }


/**
 * Read a registry skill by name from a project's local SKILL.md.
 * Validates against vcm schema before publishing — fail-fast.
 */
export function readLocalSkill(cwd, name) {
  const dirs = ['.pi/skills', 'docs/skills'];
  for (const rel of dirs) {
    const md = resolve(cwd, rel, name, 'SKILL.md');
    if (existsSync(md)) {
      const raw = readFileSync(md, 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      if (!m) throw new Error(`${md}: no frontmatter`);
      const fm = yaml?.load(m[1]) || {};
      return { path: md, fm, body: raw.slice(m[0].length) };
    }
  }
  return null;
}


/**
 * Publish a skill from the current project to the local registry.
 *
 * Refuses if:
 *   - skill not found locally
 *   - lifecycle.phase === 'retired' (per ADR-0008)
 *   - schema invalid
 *   - name already in registry unless --force
 */
export function publishSkill(cwd, name, opts = {}) {
  const local = readLocalSkill(cwd, name);
  if (!local) {
    console.error(chalk.red(`  ✗ skill not found locally: ${name}`));
    console.error(chalk.gray(`    look in .pi/skills/<name>/SKILL.md or docs/skills/<name>/SKILL.md`));
    process.exit(2);
  }
  const fm = local.fm;
  const phase = fm.lifecycle?.phase || 'active';
  if (phase === 'retired') {
    console.error(chalk.red(`  ✗ refusing to publish retired skill: ${name}`));
    process.exit(2);
  }
  const validation = validateSkillManifest(fm);
  if (!validation.valid) {
    console.error(chalk.red(`  ✗ schema invalid:`));
    for (const e of validation.errors) console.error(chalk.red(`      - ${e}`));
    process.exit(2);
  }

  // Write skill file
  ensureDir(skillsDir());
  const target = join(skillsDir(), name + '.json');
  const exists = existsSync(target);
  if (exists && !opts.force) {
    console.error(chalk.red(`  ✗ already in registry. Use --force to overwrite.`));
    process.exit(2);
  }
  // Strip _origin if any (registry persists clean vcm format)
  const { _origin, ...cleanFm } = fm;
  if (!cleanFm.authority) cleanFm.authority = 'execution-index';
  writeFileSync(target, JSON.stringify(cleanFm, null, 2) + '\n');

  // Update index
  let index = [];
  if (existsSync(indexPath())) {
    try { index = JSON.parse(readFileSync(indexPath(), 'utf8')); } catch {}
  }
  index = index.filter((s) => s.name !== name);
  index.unshift({
    name,
    description: cleanFm.description?.slice(0, 80) || '',
    tags: cleanFm.tags || [],
    authority: cleanFm.authority,
    phase,
    published_at: new Date().toISOString(),
  });
  writeFileSync(indexPath(), JSON.stringify(index, null, 2) + '\n');

  console.log(chalk.green(`\n  ✓ published: ${name}`));
  console.log(chalk.gray(`    ${target}`));
  console.log(chalk.cyan(`\n  Use \`vcm skill discover\` to see the catalogue.\n`));
}

/**
 * List skills in the registry, optionally filtered by tag.
 * Sorted by validation_count (most-validated first); desc by published_at if no count.
 */
export function discoverSkills(tag) {
  ensureDir(skillsDir());
  const results = [];
  for (const f of readdirSync(skillsDir())) {
    if (!f.endsWith('.json')) continue;
    try {
      const fm = JSON.parse(readFileSync(join(skillsDir(), f), 'utf8'));
      if (!fm.name) continue;
      if (tag && !(fm.tags || []).includes(tag)) continue;
      results.push({
        name: fm.name,
        description: fm.description?.slice(0, 80) || '',
        tags: fm.tags || [],
        authority: fm.authority,
        phase: fm.lifecycle?.phase || 'active',
        validation_count: fm.stewardship?.validation_count || 0,
      });
    } catch {}
  }
  results.sort((a, b) =>
    (b.validation_count - a.validation_count) || (a.name > b.name ? 1 : -1));
  return results;
}

/**
 * Unpublish — remove from registry (does NOT touch local skill dirs).
 */
export function unpublishSkill(name) {
  const target = join(skillsDir(), name + '.json');
  if (!existsSync(target)) {
    console.error(chalk.red(`  ✗ not in registry: ${name}`));
    process.exit(2);
  }
  rmSync(target, { force: true });
  if (existsSync(indexPath())) {
    try {
      let index = JSON.parse(readFileSync(indexPath(), 'utf8'));
      index = index.filter((s) => s.name !== name);
      writeFileSync(indexPath(), JSON.stringify(index, null, 2) + '\n');
    } catch {}
  }
  console.log(chalk.green(`\n  ✓ unpublished: ${name}\n`));
}

/**
 * Install = copy registry skill into a local project's skills dir.
 * Generates SKILL.md with frontmatter from the registry JSON.
 */
export function installSkill(cwd, name, opts = {}) {
  const src = join(skillsDir(), name + '.json');
  if (!existsSync(src)) {
    console.error(chalk.red(`  ✗ not in registry: ${name}`));
    process.exit(2);
  }
  const fm = JSON.parse(readFileSync(src, 'utf8'));
  // Determine target dir
  const targetDir = opts.to
    ? resolve(opts.to)
    : resolve(cwd, '.pi/skills');
  ensureDir(targetDir);
  const skillDir = join(targetDir, name);
  if (existsSync(skillDir) && !opts.force) {
    console.error(chalk.red(`  ✗ already installed. Use --force to overwrite.`));
    process.exit(2);
  }
  ensureDir(skillDir);
  // Strip validation_count and other things not in schema if needed.
  const valid = validateSkillManifest(fm);
  if (!valid.valid) {
    console.error(chalk.red(`  ✗ registry skill ${name} is invalid; skipping`));
    process.exit(2);
  }
  const fmText = yaml.dump(fm);
  const md = `---\n${fmText}---\n\n# ${name}\n\n<!-- Pulled from local registry. Validate with \`vcm skill validate ${name}\`. -->\n`;
  writeFileSync(join(skillDir, 'SKILL.md'), md);
  console.log(chalk.green(`\n  ✓ installed: ${name}`));
  console.log(chalk.gray(`    ${skillDir}/SKILL.md`));
  console.log(chalk.cyan(`\n  Next: edit SKILL.md, then \`vcm skill validate ${name}\`.\n`));
}
