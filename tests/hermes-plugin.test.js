'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

function runTests() {
  const pluginPath = path.resolve(
    __dirname,
    '../.hermes/plugins/ecc-audit-hooks/__init__.py'
  );
  const script = `
import importlib.util
import json
import os
import tempfile

os.environ["HERMES_HOME"] = tempfile.mkdtemp()
spec = importlib.util.spec_from_file_location("ecc_audit_hooks", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Ctx:
    def __init__(self):
        self.hooks = []
        self.commands = []
    def register_hook(self, name, callback):
        self.hooks.append(name)
    def register_command(self, name, handler, description="", args_hint=""):
        self.commands.append(name)

ctx = Ctx()
module.register(ctx)
assert len(ctx.hooks) == 5
assert ctx.commands == ["ecc-audit"]

module._on_post_tool_call(
    tool_name="terminal",
    args={"command": "echo SECRET", "token": "private"},
    result={"output": "SECRET", "exit_code": 0},
    session_id="test-session",
)
path = module._log_path()
record = json.loads(path.read_text().splitlines()[-1])
serialized = json.dumps(record)
assert "echo SECRET" not in serialized
assert "private" not in serialized
assert '"command"' in serialized
assert '"token"' in serialized
assert record["tool_name"] == "terminal"
print("plugin-ok", len(ctx.hooks), len(ctx.commands))
`;

  const result = spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  console.log('\n=== Testing Hermes plugin adapter ===\n');
  console.log(`  \u2713 ${result.stdout.trim()}`);
  console.log('\nResults: Passed: 1, Failed: 0');
}

try {
  runTests();
} catch (error) {
  console.log('\n=== Testing Hermes plugin adapter ===\n');
  console.log(`  \u2717 ${error.message}`);
  console.log('\nResults: Passed: 0, Failed: 1');
  process.exit(1);
}
