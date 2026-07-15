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
| **astro-release-images** | Create the versioned release graphics (blog cover + OG image) for an Astro release blog post and convert them to the webp/jpg formats astro.build uses. |
| **security-advisory-review** | Review and assess security advisories filed against Astro. Evaluates whether a report describes a real exploitable vulnerability or just a bug/theoretical concern. |

## Usage

Once installed, your agent will automatically detect and use these skills when relevant. You can also ask directly:

- *"Run the test perf analysis"*
- *"Create a preview release for this PR"*
- *"Create the release images for Astro 7.2"*
- *"Review this security advisory"*
