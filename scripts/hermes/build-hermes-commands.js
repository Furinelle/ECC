#!/usr/bin/env node
/**
 * Adapt ECC markdown commands into Hermes skill slash commands.
 *
 * Hermes exposes installed skills as slash commands, so an ECC command such
 * as commands/plan.md becomes the Hermes skill command /ecc-cmd-plan.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'commands');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, '.hermes', 'skills', 'ecc-commands');
const CORE_COMMANDS = new Set([
  'build-fix',
  'checkpoint',
  'code-review',
  'plan',
  'pr',
  'project-init',
  'quality-gate',
  'refactor-clean',
  'resume-session',
  'review-pr',
  'save-session',
  'security-scan',
  'test-coverage',
  'update-docs'
]);

const HERMES_NOTE = `> Hermes command adapter: Invoke this workflow as the installed skill slash command. Text following the slash command is the command input and replaces \`$ARGUMENTS\`. Use the equivalent Hermes terminal, file, search, patch, browser, approval, and delegation tools when the original text names another harness.`;

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output') {
      args.output = path.resolve(argv[++i]);
    } else if (arg === '--all') {
      args.all = true;
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
  console.log(`Usage: node scripts/hermes/build-hermes-commands.js [--output <dir>] [--all]

Adapts ECC markdown commands into Hermes skill slash commands.

Defaults:
  input:  commands/*.md (core command subset)
  output: .hermes/skills/ecc-commands

Options:
  --all            Build all ECC commands instead of the core subset
  --output <dir>   Write generated command skills to a custom directory
`);
}

function extractFrontmatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { attrs: {}, body: clean };

  const attrs = {};
  for (const line of match[1].split(/\r?\n/)) {
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValue) continue;
    attrs[keyValue[1]] = keyValue[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { attrs, body: clean.slice(match[0].length) };
}

function commandFiles(all) {
  return fs.readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => ({
      file: path.join(COMMANDS_DIR, entry.name),
      slug: entry.name.slice(0, -3)
    }))
    .filter(entry => all || CORE_COMMANDS.has(entry.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function adaptCommand(entry) {
  const original = fs.readFileSync(entry.file, 'utf8');
  const { attrs, body } = extractFrontmatter(original);
  const name = `ecc-cmd-${entry.slug}`;
  const description = attrs.description || `Run the ECC /${entry.slug} workflow in Hermes Agent.`;

  const frontmatter = [
    '---',
    `name: ${JSON.stringify(name)}`,
    `description: ${JSON.stringify(description)}`,
    'origin: ECC',
    'hermes_adapter: true',
    `source: ${JSON.stringify(`commands/${entry.slug}.md`)}`,
    `original_command: ${JSON.stringify(`/${entry.slug}`)}`
  ];
  if (attrs['argument-hint']) {
    frontmatter.push(`argument_hint: ${JSON.stringify(attrs['argument-hint'])}`);
  }
  frontmatter.push('---', '');

  return `${frontmatter.join('\n')}${HERMES_NOTE}\n\n${body.trimStart()}`;
}

function build(args) {
  fs.rmSync(args.output, { recursive: true, force: true });
  fs.mkdirSync(args.output, { recursive: true });

  const entries = commandFiles(args.all);
  for (const entry of entries) {
    const targetDir = path.join(args.output, `ecc-cmd-${entry.slug}`);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), adaptCommand(entry));
  }

  const manifest = {
    name: 'ecc-hermes-commands',
    description: 'ECC markdown commands adapted as Hermes skill slash commands.',
    mode: args.all ? 'all' : 'core',
    count: entries.length,
    commands: entries.map(entry => ({
      name: `ecc-cmd-${entry.slug}`,
      slash_command: `/ecc-cmd-${entry.slug}`,
      source: `commands/${entry.slug}.md`
    }))
  };
  fs.writeFileSync(
    path.join(args.output, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  if (!args.quiet) {
    console.log(`Built ${entries.length} Hermes command skills at ${path.relative(REPO_ROOT, args.output)}`);
  }
}

if (require.main === module) {
  try {
    build(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes-commands] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { build, parseArgs };
