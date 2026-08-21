// lib/cli/skill.js
// Skill registry: add / list / validate
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import chalk from 'chalk';
import { validateSkillManifest } from '../schemas/validate.js';

const SKILLS_DIRS = ['.pi/skills', 'docs/skills']; // search order

function findSkillsDir(cwd) {
  for (const rel of SKILLS_DIRS) {
    const abs = resolve(cwd, rel);
    if (existsSync(abs)) return abs;
  }
  // Default to .pi/skills (pi convention)
  const defaultDir = resolve(cwd, '.pi/skills');
  mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

function listSkills(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir).filter(name => {
    const skillMd = resolve(skillsDir, name, 'SKILL.md');
    return existsSync(skillMd);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = match[1];
  const obj = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) {
      const key = m[1];
      let value = m[2].trim();
      // Handle arrays like tags: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        obj[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else {
        // Strip surrounding quotes
        obj[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  return obj;
}

export async function skillCommand(action, name, options) {
  const cwd = process.cwd();
  const skillsDir = findSkillsDir(cwd);

  if (action === 'list') {
    const skills = listSkills(skillsDir);
    console.log(chalk.bold(`\n  Skills (${skills.length}):\n`));
    for (const s of skills) {
      const skillMd = resolve(skillsDir, s, 'SKILL.md');
      const fm = parseFrontmatter(readFileSync(skillMd, 'utf8'));
      const desc = fm?.description?.slice(0, 80) || '(no description)';
      console.log(`  ${chalk.cyan(s.padEnd(40))} ${desc}${fm?.description?.length > 80 ? '...' : ''}`);
    }
    console.log('');
    return;
  }

  if (action === 'add') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill add <name> --desc "..." --tags "a,b,c"'));
      process.exit(1);
    }
    if (!options.desc) {
      console.error(chalk.red('  ✗ --desc required'));
      process.exit(1);
    }
    const tags = (options.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    const manifest = {
      name,
      description: options.desc,
      tags,
      authority: 'execution-index',
      canonical_ref: 'pending',
    };

    const validation = validateSkillManifest(manifest);
    if (!validation.valid) {
      console.error(chalk.red(`  ✗ Validation failed:`));
      for (const e of validation.errors) {
        console.error(chalk.red(`      - ${e}`));
      }
      process.exit(1);
    }

    // Create skill directory
    const skillDir = resolve(skillsDir, name);
    mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md with frontmatter
    const skillMd = resolve(skillDir, 'SKILL.md');
    const content = `---
name: ${name}
description: "${options.desc}"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
authority: execution-index
canonical_ref: pending
---

# ${name}

<!-- Fill in skill body. Run \`vcm skill validate ${name}\` to verify. -->
`;
    writeFileSync(skillMd, content);

    console.log(chalk.green(`\n  ✓ Created skill: ${name}`));
    console.log(chalk.gray(`    ${skillMd}`));
    console.log(chalk.cyan(`\n  Next: edit SKILL.md, then \`vcm skill validate ${name}\`\n`));
    return;
  }

  if (action === 'validate') {
    let targets = name ? [name] : listSkills(skillsDir);
    if (targets.length === 0) {
      console.log(chalk.yellow('  ⚠ No skills found to validate'));
      return;
    }
    let allValid = true;
    for (const s of targets) {
      const skillMd = resolve(skillsDir, s, 'SKILL.md');
      if (!existsSync(skillMd)) {
        console.log(chalk.red(`  ✗ ${s}: SKILL.md not found`));
        allValid = false;
        continue;
      }
      const fm = parseFrontmatter(readFileSync(skillMd, 'utf8'));
      if (!fm) {
        console.log(chalk.red(`  ✗ ${s}: no frontmatter`));
        allValid = false;
        continue;
      }
      const result = validateSkillManifest(fm);
      if (result.valid) {
        console.log(chalk.green(`  ✓ ${s}`));
      } else {
        console.log(chalk.red(`  ✗ ${s}`));
        for (const e of result.errors) console.log(chalk.red(`      - ${e}`));
        allValid = false;
      }
    }
    if (!allValid) process.exit(1);
    console.log('');
    return;
  }

  if (action === 'convert') {
    // vcm skill convert --from <fmt> --to <fmt> [--input <path>] [--output <path>]
    // default: stdin -> stdout. Multiple files if --input is a directory.
    return await skillConvert(options);
  }

  // Marketplace sub-commands (ADR-0008)
  const marketplace = await import('./marketplace.js');
  if (action === 'publish') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill publish <name> [--force]'));
      process.exit(1);
    }
    return marketplace.publishSkill(cwd, name, { force: !!options.force });
  }
  if (action === 'unpublish') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill unpublish <name>'));
      process.exit(1);
    }
    return marketplace.unpublishSkill(name);
  }
  if (action === 'discover') {
    const found = marketplace.discoverSkills(options.tag);
    console.log(chalk.bold(`\n  ${found.length} skill(s) in registry:\n`));
    if (!found.length) {
      console.log(chalk.gray('  (empty — publish something with `vcm skill publish`)\n'));
      return;
    }
    for (const s of found) {
      const tags = (s.tags || []).map(t => chalk.cyan('#' + t)).join(' ');
      console.log(`  ${chalk.bold(String(s.name || '').padEnd(28))} ${chalk.gray(String(s.authority || '?').padEnd(8))} ${String(s.phase || '?').padEnd(10)} ${chalk.gray('×' + (s.validation_count || 0))} ${tags}`);
      console.log(`  ${chalk.gray('  ' + (s.description || '').slice(0, 80))}`);
    }
    console.log('');
    return;
  }
  if (action === 'install') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill install <name> [--to <dir>] [--force]'));
      process.exit(1);
    }
    return marketplace.installSkill(cwd, name, {
      to: options.installTo,
      force: !!options.force,
    });
  }

  // Lifecycle sub-commands (ADR-0006) — delegated to lib/cli/lifecycle.js
  const lifecycle = await import('./lifecycle.js');
  if (action === 'deprecate') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill deprecate <name> [--replaced-by <new>]'));
      process.exit(1);
    }
    return lifecycle.deprecateSkill(cwd, name, options.replacedBy);
  }
  if (action === 'retire') {
    if (!name) {
      console.error(chalk.red('  ✗ Usage: vcm skill retire <name> [--yes]'));
      process.exit(1);
    }
    return lifecycle.retireSkill(cwd, name, { yes: !!options.yes });
  }
  if (action === 'stale') {
    return lifecycle.staleSkills(cwd, parseInt(options.days || '90', 10));
  }
  if (action === 'sweep') {
    return lifecycle.sweepSkills(cwd, {
      dryRun: !options.yes,  // dry-run unless --yes
      yes:    !!options.yes,
      days:   parseInt(options.days || '180', 10),
    });
  }

  console.error(chalk.red(`  ✗ Unknown action: ${action}. Use add | list | validate | convert | publish | unpublish | discover | install | deprecate | retire | stale | sweep`));
  process.exit(1);
}

/**
 * Skill format conversion (ADR-0003).
 *
 * Reads JSON skill objects from --input (or stdin) and emits the target format.
 * Multiple files allowed: --input can be a directory; we walk *.json.
 */
async function skillConvert(options) {
  const { convert, list, sources, resolveKey } = await import('../adapters/index.js');

  const fromKey = resolveKey(options.from);
  const toKey   = resolveKey(options.to);
  if (!fromKey || !toKey) {
    process.stderr.write(`✗ unknown format. supported: ${list().join(', ')}\n`);
    process.exit(2);
  }
  if (fromKey === toKey) {
    process.stderr.write(`✗ --from and --to must differ\n`);
    process.exit(2);
  }

  const inputPath = options.input;
  const skillJson = (filename) => {
    const raw = readFileSync(filename, 'utf8');
    return JSON.parse(raw);
  };

  if (inputPath && statSync(inputPath).isDirectory()) {
    // multiple files: read matching *.json
    const files = readdirSync(inputPath).filter((f) => f.endsWith('.json'));
    if (!files.length) {
      process.stderr.write(`✗ no *.json in ${inputPath}\n`);
      process.exit(2);
    }
    for (const f of files) {
      try {
        const out = convert(skillJson(resolve(inputPath, f)), fromKey, toKey);
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      } catch (e) {
        process.stderr.write(`✗ ${f}: ${e.message}\n`);
      }
    }
    return;
  }

  // single object from --input or stdin
  let skill;
  if (inputPath) {
    skill = skillJson(inputPath);
  } else {
    skill = JSON.parse(readFileSync(0, 'utf8'));
  }
  try {
    const result = convert(skill, fromKey, toKey);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`✗ ${e.message}\n`);
    process.exit(1);
  }
}
