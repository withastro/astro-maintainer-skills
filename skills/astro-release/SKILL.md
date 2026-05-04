---
name: astro-release
description: Manage Astro minor releases end-to-end — from creating GitHub milestones and Linear tickets to executing release-day tasks like Algolia indexing and merging articles. Use this skill whenever the user mentions setting up an Astro release, creating release tickets, preparing a minor release, "release day", running the Astro release checklist, indexing Algolia after a release, or anything related to the Astro release process. Also trigger for phrases like "set up 6.4 release", "create the release milestone", "release day for Astro", or "time to ship".
license: BSD-3-Clause
metadata:
  author: matthewp
  version: "1.0"
---

# Astro Release

Astro ships minor releases on a regular cadence. Each release follows the same pattern: a GitHub milestone, a set of Linear tickets tracking every step, and a two-day execution window (merge day + release day).

This skill covers both **setup** (creating the milestone and tickets) and **release-day execution** (completing the checklist tasks).

## Setup: Create Milestone and Linear Tickets

When the user asks to set up a release, you need two pieces of information. Ask for anything not provided:

- **Release version** (e.g., `6.4`)
- **Release date** (e.g., `2026-05-21`) — this is the day the npm package ships

The **merge day** is always the day before the release date.

### Before creating anything, check for existing work

Someone else may have already started setup. Always check first:

1. **GitHub milestone** — check if a milestone for this version already exists:
   ```bash
   gh api repos/withastro/astro/milestones --jq '.[] | select(.title == "VERSION")' 
   ```

2. **Linear parent ticket** — search for an existing release ticket:
   ```
   linear_list_issues(query: "Astro VERSION Release", team: "Astro")
   ```

If either already exists, tell the user what you found and ask how to proceed rather than creating duplicates.

### Create the GitHub milestone

```bash
gh api repos/withastro/astro/milestones -f title="VERSION" -f due_on="RELEASE_DATE_ISO"
```

The milestone title is just the version number (e.g., `6.4`), no "Astro" prefix.

### Create the Linear tickets

Create a parent ticket and 9 sub-issues on the **Astro** team. The parent ticket should be added to the current cycle.

**Parent ticket:**
- Title: `Astro VERSION Release`
- Description: `Parent ticket for the Astro VERSION release on RELEASE_DATE. Tracks all release tasks including merging PRs, npm publish, docs, article, and socials.`
- Due date: release date
- Assignee: Matthew Phillips

**Sub-issues** (create in this order):

| # | Title | Description | Assignee | Due |
|---|-------|-------------|----------|-----|
| 1 | Merge PRs for release | Merge outstanding PRs on the day before in preparation for the RELEASE_DATE release. | Erika | merge day |
| 2 | Run scripts to update contributions of blog post | | emanuele@astro.build | merge day |
| 3 | npm release - push the button | Publish the Astro release to npm on RELEASE_DATE. | emanuele@astro.build | release day |
| 4 | Merge docs PRs | Merge outstanding docs PRs for the RELEASE_DATE release. | emanuele@astro.build | release day |
| 5 | Index Algolia | Run Algolia indexing after the docs PRs are merged and the npm release is published on RELEASE_DATE. | Matthew Phillips | release day |
| 6 | Release next major alpha | | emanuele@astro.build | release day |
| 7 | Write release article | Write the blog article for the RELEASE_DATE Astro release. | Matthew Phillips | release day |
| 8 | Post to #announcements | | Matthew Phillips | release day |
| 9 | Socials for release | Post on social media to announce the RELEASE_DATE Astro release. | Matthew Phillips | release day |

Use `linear_save_issue` for each. Set the `parentId` on each sub-issue to the parent ticket's ID. The priority for "Run scripts to update contributions of blog post" is Medium (3); all others are No priority (0).

After creation, summarize what was created with links to the milestone and parent Linear ticket.

## Release Day: Monitoring and Execution

On release day (and merge day), the user will ask for status updates and help completing tasks. The primary job here is to give an accurate picture of where things stand and take action when asked.

### Finding the release tickets

When the user asks about release status, first find the parent ticket and sub-issues:

```
linear_list_issues(query: "Astro VERSION Release", team: "Astro")
```

Then fetch sub-issues using the parent ticket ID. Use the Linear ticket statuses to know what's done and what's outstanding.

### Status report

When asked "how's the release going?" or similar, produce a concise status table showing each task, its assignee, and its current Linear status. For tasks that can be verified externally (PRs merged, npm published), cross-reference with GitHub to give a more accurate picture than the Linear status alone.

### Per-task details

**Merge PRs for release** (merge day)
Check the GitHub milestone for open PRs:
```bash
gh api repos/withastro/astro/milestones --jq '.[] | select(.title == "VERSION") | .number'
```
Then list open PRs on that milestone:
```bash
gh pr list --repo withastro/astro --milestone "VERSION" --state open
```
Report which PRs are still open and need merging.

**Run scripts to update contributions of blog post** (merge day)
This is done by emanuele. Monitor via the Linear ticket status. No automated action needed.

**npm release - push the button** (release day)
This is done by emanuele via a changeset PR. To check if it's been published, look for the "Version Packages" PR:
```bash
gh pr list --repo withastro/astro --search "Version Packages" --state all --limit 5
```
If the Version Packages PR has been merged, the npm release is likely out. You can also verify directly:
```bash
npm view astro version
```

**Merge docs PRs** (release day)
Check for open PRs in the docs repo that are related to this release. Monitor via the Linear ticket status.

**Index Algolia** (release day)
This should happen after docs PRs are merged and the npm release is published. When an Algolia MCP is available, use it to trigger reindexing. Until then, remind the user this is a manual step and mark it done on Linear when the user confirms.

**Release next major alpha** (release day)
After the npm release is published, a GitHub Actions automation creates a "chore: merge main into next" PR. Monitor for this PR to appear and then be merged:
```bash
gh pr list --repo withastro/astro --search "chore: merge main into next" --state all --limit 5
```
If the PR hasn't appeared yet, the npm release may not have been published yet. Once it exists, report whether it's open or merged.

**Write release article** (release day)
The release article is submitted as a PR. Check for it:
```bash
gh pr list --repo withastro/astro --search "release article" --state all --limit 5
```
If the PR is merged, the article is live. Report the PR status.

**Post to #announcements** (release day)
Help the user draft the Discord announcement. The format is:

```
Astro VERSION is now available!

[1-2 sentence summary of the highlights from the release article]

:pencil: https://astro.build/blog/astro-VERSION_SLUG/
:bird: <TWITTER_LINK>
:butterfly: <BLUESKY_LINK>
:elephant: <MASTODON_LINK>

cc @notify-updates
```

Key details:
- The summary should be concise and highlight the most interesting features from the release article. Read the article PR to generate this.
- Social links are wrapped in `<>` to prevent Discord embeds. Only the blog link gets an embed.
- The user will provide social links when they're ready — don't guess at these.
- The VERSION_SLUG is the version with dots removed or replaced as it appears in the blog URL (e.g., `astro-620` for 6.2).
- Iterate on the summary with the user's feedback until they're happy.
- When finalized, the user may ask you to write it to a `.md` file or copy it to the clipboard (`pbcopy` on macOS).

**Socials for release** (release day)
This is manual. Monitor via the Linear ticket status. No automated action needed.

### Completing tasks on Linear

When a task is confirmed done (either by checking GitHub/npm or because the user says so), update the Linear ticket status to done:

```
linear_save_issue(id: "AST-XXX", state: "Done")
```

The user may also ask you to mark tasks as in-progress or done in bulk as the release progresses.
