// lib/cli/lifecycle.js — skill lifecycle automation (ADR-0006)
//
// CLI sub-commands under `vcm skill <action>`:
//   deprecate <name> [--replaced-by <new>]
//   retire    <name> [--yes]
//   stale     [--days N]
//   sweep     [--dry-run]
//
// All commands operate on .pi/skills (or docs/skills) directories and
// mutate the SKILL.md frontmatter in place. retire actually deletes;
// the rest are metadata changes.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';

const SKILLS_DIRS = ['.pi/skills', 'docs/skills'];

export function findSkillsDir(cwd) {
  for (const rel of SKILLS_DIRS) {
    const abs = resolve(cwd, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Read SKILL.md → {fm, body}. fm is a plain object, body is the markdown
 * content after the closing front-matter fence (or null if no fm).
 */
export function readSkillMd(skillMd) {
  const raw = readFileSync(skillMd, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { fm: {}, body: raw, raw };
  return {
    fm: parseFrontmatter(match[1]),
    body: raw.slice(match[0].length),
    raw,
  };
}

export function writeSkillMd(skillMd, fm, body) {
  const fmText = renderFrontmatter(fm);
  const next = `${fmText}\n---\n\n${body || ''}\n`;
  writeFileSync(skillMd, next);
}

function parseFrontmatter(yamlText) {
  try {
    return yaml.load(yamlText) || {};
  } catch (e) {
    return {};
  }
}

function renderFrontmatter(fm) {
  return '---\n' + yaml.dump(fm, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    skipInvalid: true,
  });
}

/**
 * Mark a skill deprecated: lifecycle.phase = 'deprecated',
 * lifecycle.deprecated_at = now(), lifecycle.replaced_by = ?.
 */
export function deprecateSkill(cwd, name, replacedBy) {
  const skillsDir = findSkillsDir(cwd);
  if (!skillsDir) {
    console.error(chalk.red('  ✗ no skills dir found (.pi/skills or docs/skills)'));
    process.exit(2);
  }
  const skillMd = resolve(skillsDir, name, 'SKILL.md');
  if (!existsSync(skillMd)) {
    console.error(chalk.red(`  ✗ skill not found: ${name}`));
    process.exit(2);
  }
  const { fm, body } = readSkillMd(skillMd);
  if (fm.lifecycle?.phase === 'deprecated') {
    console.log(chalk.yellow(`  ⚠ ${name}: already deprecated, updating metadata only`));
  }
  fm.lifecycle = {
    ...(fm.lifecycle || {}),
    phase: 'deprecated',
    deprecated_at: new Date().toISOString(),
    ...(replacedBy ? { replaced_by: replacedBy } : {}),
  };
  writeSkillMd(skillMd, fm, body);
  console.log(chalk.green(`\n  ✓ deprecated: ${name}`));
  if (replacedBy) console.log(chalk.gray(`    replaced by ${replacedBy}`));
  console.log(chalk.cyan(`\n  Use \`vcm skill list\` to confirm.\n`));
}

/**
 * Delete the skill directory entirely. Requires --yes for safety.
 */
export function retireSkill(cwd, name, opts = {}) {
  const skillsDir = findSkillsDir(cwd);
  if (!skillsDir) {
    console.error(chalk.red('  ✗ no skills dir found'));
    process.exit(2);
  }
  const skillDir = resolve(skillsDir, name);
  if (!existsSync(skillDir)) {
    console.error(chalk.red(`  ✗ skill not found: ${name}`));
    process.exit(2);
  }
  if (!opts.yes) {
    console.error(chalk.red(`  ✗ refusing to retire without --yes flag`));
    console.error(chalk.gray(`    Use: vcm skill retire ${name} --yes`));
    process.exit(2);
  }
  // Move body SKILL.md content to .vcm/retired/ before deletion? Defer to v0.5.0.
  rmSync(skillDir, { recursive: true, force: true });
  console.log(chalk.green(`\n  ✓ retired: ${name}`));
  console.log(chalk.gray(`    (history not archived — pass an archive path in v0.5.0)\n`));
}

/**
 * List skills not validated within the last N days.
 */
export function staleSkills(cwd, days = 90) {
  const skillsDir = findSkillsDir(cwd);
  if (!skillsDir) {
    console.log(chalk.yellow('  ⚠ no skills dir'));
    return;
  }
  const now = Date.now();
  const cutoff = now - days * 86400 * 1000;
  const stale = [];

  for (const name of readdirSync(skillsDir)) {
    const skillMd = resolve(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const stat = statSync(skillMd);
    if (stat.mtimeMs < cutoff) {
      const { fm } = readSkillMd(skillMd);
      const last = fm.stewardship?.last_validated || null;
      stale.push({ name, mtime: stat.mtimeMs, last_validated: last });
    }
  }

  stale.sort((a, b) => a.mtime - b.mtime);
  if (!stale.length) {
    console.log(chalk.green(`\n  ✓ no skills stale (>${days}d)\n`));
    return;
  }
  console.log(chalk.bold(`\n  ${stale.length} skill(s) stale (>${days}d):\n`));
  for (const s of stale) {
    const daysAgo = Math.round((now - s.mtime) / 86400 / 1000);
    console.log(`  ${chalk.cyan(s.name.padEnd(28))} ${chalk.gray(daysAgo + 'd old')}`);
  }
  console.log(chalk.cyan(`\n  Use \`vcm skill deprecate <name> [--replaced-by <new>]\` to retire.\n`));
}

/**
 * Sweep = bulk deprecate (does NOT retire). Dry-run by default.
 */
export function sweepSkills(cwd, opts = {}) {
  const skillsDir = findSkillsDir(cwd);
  if (!skillsDir) return [];
  const stale = [];
  const cutoff = Date.now() - (opts.days || 180) * 86400 * 1000;
  for (const name of readdirSync(skillsDir)) {
    const skillMd = resolve(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const stat = statSync(skillMd);
    if (stat.mtimeMs < cutoff) {
      const { fm } = readSkillMd(skillMd);
      if (fm.lifecycle?.phase === 'deprecated') continue;
      stale.push({ name, fm, body: readSkillMd(skillMd).body });
    }
  }
  if (opts.dryRun) {
    console.log(chalk.yellow(`\n  Dry run — would deprecate ${stale.length} skill(s):\n`));
    for (const s of stale) {
      console.log(`  ${chalk.cyan(s.name)}  (last_modified=${new Date(s.fm?.__st_mtime || 0).toISOString().slice(0, 10)})`);
    }
    return stale;
  }
  if (!opts.yes) {
    console.error(chalk.red(`  ✗ refusing to sweep without --yes flag`));
    process.exit(2);
  }
  for (const s of stale) {
    s.fm.lifecycle = {
      ...(s.fm.lifecycle || {}),
      phase: 'deprecated',
      deprecated_at: new Date().toISOString(),
    };
    const skillMd = resolve(skillsDir, s.name, 'SKILL.md');
    writeSkillMd(skillMd, s.fm, s.body);
  }
  console.log(chalk.green(`\n  ✓ sweep done — deprecated ${stale.length} skill(s)\n`));
  return stale;
}
