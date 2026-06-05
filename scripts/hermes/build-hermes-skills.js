#!/usr/bin/env node
/**
 * Build a Hermes-compatible ECC skill pack.
 *
 * Hermes local skills are plain directories containing SKILL.md. This script
 * adapts ECC's harness-neutral `.agents/skills` set into `.hermes/skills/ecc`
 * and prefixes skill names with `ecc-` so they do not collide with bundled
 * Hermes or other local skills.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, '.hermes', 'skills', 'ecc');
const SOURCE_ROOTS = [
  path.join(REPO_ROOT, '.agents', 'skills'),
  path.join(REPO_ROOT, 'skills')
];
const EXTRA_SKILLS = new Set(['hermes-imports']);
const HERMES_NOTE = `> Hermes adapter: This ECC skill is packaged for Hermes Agent. When the original text names Claude Code, Codex, OpenCode, or another harness-specific tool, use the equivalent Hermes terminal, file, search, patch, browser, approval, and delegation tools available in the current session.`;

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, allCurated: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output') {
      args.output = path.resolve(argv[++i]);
    } else if (arg === '--all-curated') {
      args.allCurated = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/hermes/build-hermes-skills.js [--output <dir>] [--all-curated]

Builds Hermes-compatible ECC skills.

Defaults:
  input:  .agents/skills plus skills/hermes-imports
  output: .hermes/skills/ecc

Options:
  --output <dir>   Write generated skills to a custom directory
  --all-curated    Include every directory under skills/ in addition to .agents/skills
`);
}

function listSkillDirs(args) {
  const entries = [];

  for (const sourceRoot of SOURCE_ROOTS) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const skillDir = path.join(sourceRoot, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      const isAgentsSkill = sourceRoot.endsWith(path.join('.agents', 'skills'));
      if (!isAgentsSkill && !args.allCurated && !EXTRA_SKILLS.has(entry.name)) {
        continue;
      }

      entries.push({
        sourceRoot,
        sourceDir: skillDir,
        slug: entry.name,
        sourceRel: path.relative(REPO_ROOT, skillDir).split(path.sep).join('/')
      });
    }
  }

  const bySlug = new Map();
  for (const entry of entries) {
    if (!bySlug.has(entry.slug) || entry.sourceRel.startsWith('.agents/')) {
      bySlug.set(entry.slug, entry);
    }
  }
  return Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

function extractFrontmatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { attrs: {}, body: clean };
  }

  const attrs = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    attrs[kv[1]] = stripYamlScalar(kv[2]);
  }

  return { attrs, body: clean.slice(match[0].length) };
}

function stripYamlScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, '');
}

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function adaptSkillMarkdown(original, entry) {
  const { attrs, body } = extractFrontmatter(original);
  const originalName = attrs.name || entry.slug;
  const hermesName = originalName.startsWith('ecc-') ? originalName : `ecc-${originalName}`;
  const description = attrs.description ||
    `ECC skill adapted for Hermes Agent from ${entry.sourceRel}.`;

  const frontmatter = [
    '---',
    `name: ${yamlString(hermesName)}`,
    `description: ${yamlString(description)}`,
    'origin: ECC',
    'hermes_adapter: true',
    `source: ${yamlString(entry.sourceRel)}`,
    `original_name: ${yamlString(originalName)}`,
    '---',
    ''
  ].join('\n');

  const normalizedBody = body.trimStart();
  return `${frontmatter}${HERMES_NOTE}\n\n${normalizedBody}`;
}

function copySkill(entry, outputDir) {
  const targetDir = path.join(outputDir, `ecc-${entry.slug}`);
  fs.cpSync(entry.sourceDir, targetDir, { recursive: true });

  const skillFile = path.join(targetDir, 'SKILL.md');
  const original = fs.readFileSync(skillFile, 'utf8');
  fs.writeFileSync(skillFile, adaptSkillMarkdown(original, entry));
}

function build(args) {
  const outputDir = args.output;
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = listSkillDirs(args);
  for (const entry of entries) {
    copySkill(entry, outputDir);
  }

  const manifest = {
    name: 'ecc-hermes-skills',
    description: 'Hermes-compatible ECC skill pack generated from this repository.',
    generated_at: new Date().toISOString(),
    count: entries.length,
    skills: entries.map(entry => ({
      name: `ecc-${entry.slug}`,
      source: entry.sourceRel
    }))
  };
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log(`Built ${entries.length} Hermes skills at ${path.relative(REPO_ROOT, outputDir) || outputDir}`);
}

if (require.main === module) {
  try {
    build(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { build, parseArgs };
