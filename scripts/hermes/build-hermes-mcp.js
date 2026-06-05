#!/usr/bin/env node
/**
 * Build Hermes-compatible MCP config snippets from ECC's mcpServers catalog.
 *
 * Output is intentionally disabled by default. MCP servers can expose broad
 * tool surfaces, require credentials, and start networked subprocesses; users
 * should opt in per server after reviewing the generated config.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_INPUT = path.join(REPO_ROOT, 'mcp-configs', 'mcp-servers.json');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, '.hermes', 'mcp');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    enabled: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = path.resolve(argv[++i]);
    } else if (arg === '--output-dir') {
      args.outputDir = path.resolve(argv[++i]);
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
  console.log(`Usage: node scripts/hermes/build-hermes-mcp.js [--input <json>] [--output-dir <dir>] [--enabled]

Builds Hermes-compatible MCP config snippets from mcp-configs/mcp-servers.json.

Outputs:
  .hermes/mcp/ecc-mcp-servers.json
  .hermes/mcp/ecc-mcp-servers.yaml

Options:
  --enabled        Generate entries with enabled: true. Default is false.
`);
}

function readCatalog(inputPath) {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('MCP catalog must be a JSON object');
  }
  if (!raw.mcpServers || typeof raw.mcpServers !== 'object' || Array.isArray(raw.mcpServers)) {
    throw new Error('MCP catalog must include an mcpServers object');
  }
  return raw.mcpServers;
}

function sanitizeServerName(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '-');
}

function envPlaceholder(name) {
  return `\${${name}}`;
}

function normalizeEnvValue(key, value) {
  const text = String(value || '');
  if (/^YOUR_[A-Z0-9_]+_HERE$/.test(text) || /^YOUR_[A-Z0-9_]+$/.test(text)) {
    return envPlaceholder(key);
  }
  return text;
}

function headerEnvName(serverName, headerName) {
  const normalizedServer = serverName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const normalizedHeader = headerName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `MCP_${normalizedServer}_${normalizedHeader}`;
}

function normalizeHeaders(serverName, headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const text = String(value || '');
    if (/^YOUR_[A-Z0-9_]+_HERE$/.test(text) || /^YOUR_[A-Z0-9_]+$/.test(text)) {
      result[key] = envPlaceholder(headerEnvName(serverName, key));
    } else {
      result[key] = text;
    }
  }
  return result;
}

function convertServer(name, source, enabled) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`MCP server ${name} must be an object`);
  }

  const target = {
    enabled,
    source: 'ECC'
  };

  if (source.description) {
    target.description = String(source.description);
  }

  if (source.type === 'http' || source.url) {
    target.url = String(source.url || '');
    if (!target.url) {
      throw new Error(`HTTP MCP server ${name} is missing url`);
    }
  } else {
    target.command = String(source.command || '');
    if (!target.command) {
      throw new Error(`stdio MCP server ${name} is missing command`);
    }
    if (Array.isArray(source.args) && source.args.length > 0) {
      target.args = source.args.map(String);
    }
  }

  if (source.env && typeof source.env === 'object' && !Array.isArray(source.env)) {
    target.env = {};
    for (const [key, value] of Object.entries(source.env)) {
      target.env[key] = normalizeEnvValue(key, value);
    }
  }

  if (source.headers && typeof source.headers === 'object' && !Array.isArray(source.headers)) {
    target.headers = normalizeHeaders(name, source.headers);
  }

  return target;
}

function quoteYamlString(value) {
  return JSON.stringify(String(value));
}

function writeYamlValue(lines, indent, key, value) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}${key}: []`);
      return;
    }
    lines.push(`${pad}${key}:`);
    for (const item of value) {
      lines.push(`${pad}  - ${quoteYamlString(item)}`);
    }
    return;
  }

  if (value && typeof value === 'object') {
    lines.push(`${pad}${key}:`);
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      writeYamlValue(lines, indent + 2, nestedKey, nestedValue);
    }
    return;
  }

  if (typeof value === 'boolean') {
    lines.push(`${pad}${key}: ${value ? 'true' : 'false'}`);
    return;
  }

  lines.push(`${pad}${key}: ${quoteYamlString(value)}`);
}

function toYaml(config) {
  const lines = [
    '# Generated by scripts/hermes/build-hermes-mcp.js',
    '# Merge selected entries under ~/.hermes/config.yaml:mcp_servers.',
    'mcp_servers:'
  ];

  for (const [name, server] of Object.entries(config.mcp_servers)) {
    lines.push(`  ${name}:`);
    for (const [key, value] of Object.entries(server)) {
      writeYamlValue(lines, 4, key, value);
    }
  }

  return `${lines.join('\n')}\n`;
}

function build(args) {
  const sourceServers = readCatalog(args.input);
  const converted = {};

  for (const [rawName, source] of Object.entries(sourceServers)) {
    const name = sanitizeServerName(rawName);
    converted[name] = convertServer(name, source, args.enabled);
  }

  const output = {
    mcp_servers: converted,
    _metadata: {
      name: 'ecc-hermes-mcp',
      source: path.relative(REPO_ROOT, args.input).split(path.sep).join('/'),
      count: Object.keys(converted).length,
      default_enabled: args.enabled
    }
  };

  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(args.outputDir, 'ecc-mcp-servers.json'),
    `${JSON.stringify(output, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(args.outputDir, 'ecc-mcp-servers.yaml'),
    toYaml(output)
  );

  if (!args.quiet) {
    console.log(`Built ${output._metadata.count} Hermes MCP entries at ${path.relative(REPO_ROOT, args.outputDir)}`);
  }
}

if (require.main === module) {
  try {
    build(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`[hermes-mcp] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { build, parseArgs };
