---
name: "ecc-cmd-review-pr"
description: "Comprehensive PR review using specialized agents"
origin: ECC
hermes_adapter: true
source: "commands/review-pr.md"
original_command: "/review-pr"
---
> Hermes command adapter: Invoke this workflow as the installed skill slash command. Text following the slash command is the command input and replaces `$ARGUMENTS`. Use the equivalent Hermes terminal, file, search, patch, browser, approval, and delegation tools when the original text names another harness.

Run a comprehensive multi-perspective review of a pull request.

## Usage

`/review-pr [PR-number-or-URL] [--focus=comments|tests|errors|types|code|simplify]`

If no PR is specified, review the current branch's PR. If no focus is specified, run the full review stack.

## Steps

1. Identify the PR:
   - use `gh pr view` to get PR details, changed files, and diff
2. Find project guidance:
   - look for `CLAUDE.md`, lint config, TypeScript config, repo conventions
3. Run specialized review agents:
   - `code-reviewer`
   - `comment-analyzer`
   - `pr-test-analyzer`
   - `silent-failure-hunter`
   - `type-design-analyzer`
   - `code-simplifier`
4. Aggregate results:
   - dedupe overlapping findings
   - rank by severity
5. Report findings grouped by severity

## Confidence Rule

Only report issues with confidence >= 80:

- Critical: bugs, security, data loss
- Important: missing tests, quality problems, style violations
- Advisory: suggestions only when explicitly requested
