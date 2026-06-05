#!/usr/bin/env node
/**
 * Merge generated ECC MCP entries into ~/.hermes/config.yaml.
 *
 * The merge is add-only by default. Existing Hermes MCP entries are preserved
 * unless --update is passed. Generated entries are disabled unless --enabled is
 * passed through to the builder.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./build-hermes-mcp');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PACK_DIR = path.join(REPO_ROOT, '.hermes', 'mcp');
const PACK_JSON = path.join(PACK_DIR, 'ecc-mcp-servers.json');
const DEFAULT_CONFIG = path.join(os.homedir(), '.hermes', 'config.yaml');

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    update: false,
    dryRun: false,
    enabled: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') {
      args.config = path.resolve(argv[++i]);
    } else if (arg === '--update') {
      args.update = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--enabled') {
      args.enabled = true;
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
  console.log(`Usage: node scripts/hermes/install-hermes-mcp.js [--config <path>] [--dry-run] [--update] [--enabled]

Builds the ECC Hermes MCP snippet and merges missing servers into Hermes config.

Defaults:
  config: ~/.hermes/config.yaml
  mode:   add-only, generated servers disabled

Options:
  --dry-run   Print the merged YAML without writing
  --update    Replace existing ECC server entries too
  --enabled   Generate inserted entries with enabled: true
`);
}

function indentBlock(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `${pad}${line}`)
    .join('\n');
}

function yamlScalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}

function yamlEntry(name, server) {
  const lines = [`${name}:`];
  for (const [key, value] of Object.entries(server)) {
    if (Array.isArray(value)) {
      lines.push(`  ${key}:`);
      for (const item of value) {
        lines.push(`    - ${JSON.stringify(String(item))}`);
      }
    } else if (value && typeof value === 'object') {
      lines.push(`  ${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`    ${nestedKey}: ${yamlScalar(nestedValue)}`);
      }
    } else {
      lines.push(`  ${key}: ${yamlScalar(value)}`);
    }
  }
  return lines.join('\n');
}

function existingServerNames(configText) {
  const names = new Set();
  const lines = configText.split(/\r?\n/);
  let inMcpServers = false;

  for (const line of lines) {
    if (/^\S/.test(line)) {
      inMcpServers = /^mcp_servers:\s*(#.*)?$/.test(line);
      continue;
    }
    if (!inMcpServers) continue;
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*(#.*)?$/);
    if (match) names.add(match[1]);
  }

  return names;
}

function removeExistingEntry(configText, name) {
  const lines = configText.split('\n');
  const result = [];
  let inMcpServers = false;
  let skipping = false;

  for (const line of lines) {
    if (/^\S/.test(line)) {
      inMcpServers = /^mcp_servers:\s*(#.*)?$/.test(line);
      skipping = false;
      result.push(line);
      continue;
    }

    if (inMcpServers) {
      const entryMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*(#.*)?$/);
      if (entryMatch) {
        skipping = entryMatch[1] === name;
        if (skipping) continue;
      } else if (skipping && /^  [A-Za-z0-9_-]+:\s*/.test(line)) {
        skipping = false;
      }
    }

    if (!skipping) result.push(line);
  }

  return result.join('\n');
}

function mergeConfig(configText, generatedServers, update) {
  let text = configText.replace(/\s*$/, '\n');
  const existing = existingServerNames(text);
  const inserted = [];
  const skipped = [];

  if (!/^mcp_servers:\s*(#.*)?$/m.test(text)) {
    text = text.trim() ? `${text}\nmcp_servers:\n` : 'mcp_servers:\n';
  }

  for (const [name, server] of Object.entries(generatedServers)) {
    if (existing.has(name)) {
      if (!update) {
        skipped.push(name);
        continue;
      }
      text = removeExistingEntry(text, name);
    }
    text = insertIntoMcpServersBlock(text, indentBlock(yamlEntry(name, server), 2));
    inserted.push(name);
  }

  return { text, inserted, skipped };
}

function insertIntoMcpServersBlock(configText, indentedEntry) {
  const lines = configText.split('\n');
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^mcp_servers:\s*(#.*)?$/.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    return `${configText.replace(/\s*$/, '\n')}\nmcp_servers:\n${indentedEntry}\n`;
  }

  let insertIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.startsWith(' ') || line.startsWith('#')) {
      continue;
    }
    insertIndex = i;
    break;
  }

  while (insertIndex > headerIndex + 1 && lines[insertIndex - 1].trim() === '') {
    insertIndex--;
  }

  lines.splice(insertIndex, 0, ...indentedEntry.split('\n'));
  return lines.join('\n').replace(/\s*$/, '\n');
}

function install(args) {
  build({
    outputDir: PACK_DIR,
    input: path.join(REPO_ROOT, 'mcp-configs', 'mcp-servers.json'),
    enabled: args.enabled,
    quiet: true
  });
  const generated = JSON.parse(fs.readFileSync(PACK_JSON, 'utf8')).mcp_servers;

  const existingText = fs.existsSync(args.config)
    ? fs.readFileSync(args.config, 'utf8')
    : '';
  const merged = mergeConfig(existingText, generated, args.update);

  if (args.dryRun) {
    process.stdout.write(merged.text);
  } else {
    fs.mkdirSync(path.dirname(args.config), { recursive: true });
    fs.writeFileSync(args.config, merged.text);
  }

  const action = args.dryRun ? 'Would add' : 'Added';
  console.error(`${action} ${merged.inserted.length} ECC MCP server(s) to ${args.config}`);
  if (merged.skipped.length > 0) {
    console.error(`Skipped ${merged.skipped.length} existing server(s); pass --update to replace ECC entries.`);
  }
}

if (require.main === module) {
  try {
    install(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes-mcp] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { install, parseArgs, mergeConfig };
