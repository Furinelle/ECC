#!/usr/bin/env node
/**
 * Install the generated Hermes-compatible ECC skill pack into ~/.hermes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./build-hermes-skills');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PACK_DIR = path.join(REPO_ROOT, '.hermes', 'skills', 'ecc');
const DEFAULT_TARGET = path.join(os.homedir(), '.hermes', 'skills', 'ecc');

function parseArgs(argv) {
  const args = { target: DEFAULT_TARGET, allCurated: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') {
      args.target = path.resolve(argv[++i]);
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
  console.log(`Usage: node scripts/hermes/install-hermes-skills.js [--target <dir>] [--all-curated]

Builds the Hermes ECC skill pack and installs it into Hermes local skills.

Defaults:
  target: ~/.hermes/skills/ecc

Options:
  --target <dir>   Install to a custom Hermes local skills directory
  --all-curated    Include every directory under skills/ in addition to .agents/skills
`);
}

function install(args) {
  build({ output: PACK_DIR, allCurated: args.allCurated });

  fs.rmSync(args.target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(args.target), { recursive: true });
  fs.cpSync(PACK_DIR, args.target, { recursive: true });

  console.log(`Installed Hermes ECC skills to ${args.target}`);
  console.log('Verify with: hermes skills list | rg "^ecc-"');
}

if (require.main === module) {
  try {
    install(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { install, parseArgs };
