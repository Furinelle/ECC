#!/usr/bin/env node
/**
 * Install ECC command skills into ~/.hermes/skills/ecc-commands.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./build-hermes-commands');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PACK_DIR = path.join(REPO_ROOT, '.hermes', 'skills', 'ecc-commands');
const DEFAULT_TARGET = path.join(os.homedir(), '.hermes', 'skills', 'ecc-commands');

function parseArgs(argv) {
  const args = { target: DEFAULT_TARGET, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') {
      args.target = path.resolve(argv[++i]);
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
  console.log(`Usage: node scripts/hermes/install-hermes-commands.js [--target <dir>] [--all]

Builds and installs ECC command skills into Hermes local skills.

Defaults:
  target: ~/.hermes/skills/ecc-commands
  mode:   core command subset
`);
}

function install(args) {
  build({ output: PACK_DIR, all: args.all, quiet: true });
  fs.rmSync(args.target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(args.target), { recursive: true });
  fs.cpSync(PACK_DIR, args.target, { recursive: true });

  console.log(`Installed Hermes ECC command skills to ${args.target}`);
  console.log('Start a new Hermes session, then run /ecc-cmd-plan <request>.');
}

if (require.main === module) {
  try {
    install(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes-commands] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { install, parseArgs };
