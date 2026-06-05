# ECC for Hermes

This directory contains the Hermes Agent adaptation layer for ECC.

Hermes local skills are directories that contain `SKILL.md`. ECC's canonical
skills live in multiple harness-specific surfaces, so this adapter generates a
Hermes-safe local skill pack under `.hermes/skills/ecc`.

## Build

```bash
npm run hermes:build-skills
```

The default build uses the harness-neutral `.agents/skills` set plus the
Hermes-specific `skills/hermes-imports` skill. Generated skills are prefixed
with `ecc-` to avoid collisions with bundled Hermes skills.

To generate every curated ECC skill from `skills/` as well:

```bash
npm run hermes:build-skills -- --all-curated
```

## Install Locally

```bash
npm run hermes:install-skills
hermes skills list | rg '^ecc-'
```

The install command writes to `~/.hermes/skills/ecc` by default.

## Adapter Notes

- Skill bodies are preserved, including referenced files beside `SKILL.md`.
- Hermes metadata is added to frontmatter: `origin`, `source`,
  `original_name`, and `hermes_adapter`.
- Skill names are changed from `<name>` to `ecc-<name>`.
- Harness-specific wording is not rewritten globally. When a skill mentions
  Claude Code, Codex, OpenCode, or another harness, use the equivalent Hermes
  terminal, file, search, patch, browser, approval, and delegation tools.
- Hooks, MCP servers, slash commands, and agent definitions are not copied by
  this skill adapter. Those need separate Hermes-native integration work.

## MCP Config

Build a Hermes-compatible MCP config snippet from `mcp-configs/mcp-servers.json`:

```bash
npm run hermes:build-mcp
```

This writes:

- `.hermes/mcp/ecc-mcp-servers.json`
- `.hermes/mcp/ecc-mcp-servers.yaml`

Generated MCP servers are disabled by default. Review credentials, package
launchers, and tool count before enabling any server.

To merge missing ECC MCP entries into your local Hermes config:

```bash
npm run hermes:install-mcp
hermes mcp list
```

Use `-- --dry-run` to preview the merged YAML without writing:

```bash
npm run hermes:install-mcp -- --dry-run
```

Use `-- --enabled` only when you explicitly want the generated entries enabled
immediately.

## ECC Commands as Hermes Slash Commands

Hermes automatically exposes installed skills as slash commands. The command
adapter converts ECC's `commands/*.md` files into `ecc-cmd-*` skills:

```bash
npm run hermes:build-commands
npm run hermes:install-commands
```

Example:

```text
/ecc-cmd-plan add authentication to this project
/ecc-cmd-code-review
/ecc-cmd-security-scan .
```

The default build installs a focused core subset. Generate all ECC commands
only when you need them:

```bash
npm run hermes:build-commands -- --all
npm run hermes:install-commands -- --all
```

The adapter deliberately uses the `ecc-cmd-` prefix so ECC workflows cannot
shadow built-in Hermes slash commands such as `/plan`, `/new`, or `/model`.

## Audit Hooks Plugin

ECC's Claude hooks cannot be copied directly into Hermes. The native
`ecc-audit-hooks` plugin ports a small, privacy-preserving subset:

- session start/end metadata
- tool name, argument key names, result type/size, and error flag
- approval pattern metadata and user choice
- `/ecc-audit status`
- `/ecc-audit tail [N]`

It intentionally excludes command text, argument values, prompts, model
responses, file contents, and environment values.

Install and enable it:

```bash
npm run hermes:install-plugin
hermes plugins list
```

Audit records are written to:

```text
~/.hermes/logs/ecc-audit.jsonl
```
