# Astro Maintainer Skills

Agent skills for maintaining the [Astro](https://github.com/withastro/astro) monorepo. Works with [OpenCode](https://opencode.ai), Claude Code, and other agents that support the skills format.

## Install

```sh
npx skills add withastro/astro-maintainer-skills
```

To install globally (available in all projects):

```sh
npx skills add withastro/astro-maintainer-skills -g
```

## Skills

| Skill | Description |
|---|---|
| **astro-test-perf** | Analyze CI test performance to find the slowest tests and produce a report with per-suite tables, platform breakdowns, and actionable recommendations. |
| **astro-preview-release** | Trigger and monitor a preview release for an Astro pull request using pkg.pr.new. |

## Usage

Once installed, your agent will automatically detect and use these skills when relevant. You can also ask directly:

- *"Run the test perf analysis"*
- *"Create a preview release for this PR"*
