---
name: astro-preview-release
description: Trigger and monitor a preview release for an Astro pull request. Use this skill whenever the user wants to publish a preview/canary build of an Astro PR so that reporters or users can test a fix before it merges — including phrases like "create a preview release", "add the preview label", "let someone test this PR", "publish a canary for this fix", or "how do I get a preview package for this PR". Specific to the withastro/astro monorepo and pkg.pr.new.
license: BSD-3-Clause
metadata:
  author: matthewp
  version: "1.0"
---

# Astro PR Preview Release

Preview releases let users install and test a PR's changes before it merges, using [pkg.pr.new](https://pkg.pr.new).

## How to trigger

Add the `pr preview` label to the PR:

```bash
gh pr edit <PR_NUMBER> --repo withastro/astro --add-label "pr preview"
```

This kicks off a **"Publish preview release"** GitHub Actions job.

## Monitoring

Poll until the job completes:

```bash
gh pr checks <PR_NUMBER> --repo withastro/astro | grep -i "preview"
```

The job typically completes within a few minutes. Once it shows `pass`, a `pkg-pr-new` bot will post a comment on the PR with install commands.

## Reading the comment

The bot comment contains per-package install commands, for example:

```
npm i https://pkg.pr.new/astro@<PR_NUMBER>
npm i https://pkg.pr.new/@astrojs/cloudflare@<PR_NUMBER>
npm i https://pkg.pr.new/@astrojs/node@<PR_NUMBER>
```

Share the relevant package command(s) with the issue reporter so they can test the fix directly.

## Which package to share

Point the reporter to the package(s) that contain the fix:

- Fix in `packages/astro/` → share `astro@<PR_NUMBER>`
- Fix in `packages/integrations/node/` → share `@astrojs/node@<PR_NUMBER>`
- Fix in `packages/integrations/cloudflare/` → share `@astrojs/cloudflare@<PR_NUMBER>`
- Fix touches multiple packages → share all relevant ones

## Posting to the issue

After getting the install command, post a comment on the original issue so the reporter can try it:

```bash
gh issue comment <ISSUE_NUMBER> --repo withastro/astro --body "A preview build is available for testing:

\`\`\`
npm i https://pkg.pr.new/astro@<PR_NUMBER>
\`\`\`

Please let us know if this resolves the issue."
```
