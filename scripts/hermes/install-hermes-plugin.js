#!/usr/bin/env node
/**
 * Install the ECC Hermes audit hooks plugin into ~/.hermes/plugins.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGIN_NAME = 'ecc-audit-hooks';
const SOURCE = path.join(REPO_ROOT, '.hermes', 'plugins', PLUGIN_NAME);
const DEFAULT_TARGET = path.join(os.homedir(), '.hermes', 'plugins', PLUGIN_NAME);

function parseArgs(argv) {
  const args = { target: DEFAULT_TARGET, enable: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') {
      args.target = path.resolve(argv[++i]);
    } else if (arg === '--no-enable') {
      args.enable = false;
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
  console.log(`Usage: node scripts/hermes/install-hermes-plugin.js [--target <dir>] [--no-enable]

Installs the ECC audit hooks plugin into Hermes user plugins.

Defaults:
  target: ~/.hermes/plugins/ecc-audit-hooks
  action: enable with 'hermes plugins enable ecc-audit-hooks'
`);
}

function install(args) {
  if (!fs.existsSync(path.join(SOURCE, 'plugin.yaml'))) {
    throw new Error(`Plugin source not found: ${SOURCE}`);
  }

  fs.rmSync(args.target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(args.target), { recursive: true });
  fs.cpSync(SOURCE, args.target, { recursive: true });

  if (args.enable && args.target === DEFAULT_TARGET) {
    execFileSync('hermes', ['plugins', 'enable', PLUGIN_NAME], { stdio: 'inherit' });
  }

  console.log(`Installed Hermes plugin to ${args.target}`);
  if (!args.enable || args.target !== DEFAULT_TARGET) {
    console.log(`Enable with: hermes plugins enable ${PLUGIN_NAME}`);
  }
}

if (require.main === module) {
  try {
    install(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes-plugin] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { install, parseArgs };
