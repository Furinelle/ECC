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
