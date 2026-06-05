'use strict';

const assert = require('assert');

const { mergeConfig } = require('../scripts/hermes/install-hermes-mcp');

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing Hermes MCP adapter ===\n');

  let passed = 0;
  let failed = 0;

  if (test('adds generated servers inside the mcp_servers block', () => {
    const existing = [
      'model:',
      '  default: test',
      'mcp_servers:',
      '  existing:',
      '    command: "echo"',
      'skills:',
      '  disabled: []',
      ''
    ].join('\n');

    const result = mergeConfig(existing, {
      context7: {
        enabled: false,
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp@latest']
      }
    }, false);

    assert.deepStrictEqual(result.inserted, ['context7']);
    assert(result.text.indexOf('  context7:') > result.text.indexOf('mcp_servers:'));
    assert(result.text.indexOf('  context7:') < result.text.indexOf('skills:'));
    assert(result.text.includes('  existing:\n    command: "echo"'));
  })) passed++; else failed++;

  if (test('skips existing server names in add-only mode', () => {
    const existing = [
      'mcp_servers:',
      '  context7:',
      '    command: "custom"',
      ''
    ].join('\n');

    const result = mergeConfig(existing, {
      context7: { enabled: false, command: 'npx' }
    }, false);

    assert.deepStrictEqual(result.inserted, []);
    assert.deepStrictEqual(result.skipped, ['context7']);
    assert(result.text.includes('command: "custom"'));
  })) passed++; else failed++;

  if (test('creates an mcp_servers block when config is empty', () => {
    const result = mergeConfig('', {
      memory: { enabled: false, command: 'npx' }
    }, false);

    assert(result.text.includes('mcp_servers:\n  memory:'));
    assert(result.text.includes('    enabled: false'));
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
