---
name: astro-test-perf
description: >
  Analyze Astro CI test performance to find the slowest tests and produce a report with
  per-suite tables, platform breakdowns, and actionable recommendations. Use this skill
  whenever the user asks about CI test performance, slow tests, test timing, test duration,
  test speed, making tests faster, CI optimization, or anything related to profiling or
  benchmarking the Astro test suite. Also trigger when the user mentions "test perf",
  "slow CI", "CI takes too long", or "which tests are slowest".
compatibility: Requires gh CLI and access to the withastro/astro GitHub repository.
---

# Astro CI Test Performance Analysis

Fetch a recent CI run from `withastro/astro`, parse test durations from the logs, and
produce a performance report showing the slowest tests across all suites and platforms.

## Background: Astro CI Structure

Astro's CI workflow (`.github/workflows/ci.yml`) runs these test suites:

| Suite | Job name pattern | Test runner | Platforms |
|---|---|---|---|
| **Astro** | `Test (astro): <os> (node@<ver>)` | Node.js test runner | Ubuntu Node 22/24, macOS Node 24, Windows Node 24 |
| **Integrations** | `Test (integrations): <os> (node@<ver>)` | Node.js test runner | Same as Astro |
| **E2E** | `Test (E2E): <os> (node@<ver>)` | Playwright (Chrome + Firefox) | Ubuntu Node 22, Windows Node 22 |

Each suite runs across multiple platform/Node version combinations defined in the CI
matrix. The Astro and Integrations suites use Turbo to run test commands, and the test
output uses the Node.js test runner format with `✔`/`✗` markers and durations in
parentheses. E2E uses Playwright which outputs dot-progress and summary lines.

### Log format

CI logs from `gh run view --log` are tab-delimited:

```
<job-name>\t<step-name>\t<timestamp> <content>
```

Within the test step, Turbo prefixes output with the package name:

```
astro:test: ✔ Suite Name (123.456ms)
astro:test:   ✔ child test (0.5ms)
```

Top-level test results (the ones representing test suites/files) have no leading whitespace
before the checkmark. Child tests are indented. The script in `scripts/` handles all of
this parsing.

## Step 1: Find a CI Run

Find a recent completed CI run. Prefer successful runs on PR branches over `main`, because
`main` runs often hit Turbo cache and show near-zero test durations. The goal is a run
where tests actually executed.

```bash
gh run list -R withastro/astro --workflow=ci.yml --status=completed -L 10 \
  --json workflowName,databaseId,conclusion,createdAt,headBranch,displayTitle
```

Pick a run where conclusion is `success` and the branch is NOT `main` (or if it must be
`main`, verify the test jobs took significant time). Confirm with:

```bash
gh run view <run_id> -R withastro/astro --json jobs \
  --jq '.jobs[] | {name: .name, conclusion: .conclusion, durationMs: (.completedAt | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) - (.startedAt | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) }'
```

If `Test (astro)` jobs show durations under 60 seconds, that run hit Turbo cache —
pick a different run.

## Step 2: Download Logs

```bash
gh run view <run_id> -R withastro/astro --log > /tmp/ci-run-<run_id>.log
```

This produces a single large file (typically 50-100K lines) containing all job logs.

## Step 3: Parse Test Durations

Run the bundled parsing script:

```bash
node <skill-dir>/scripts/parse-test-durations.js /tmp/ci-run-<run_id>.log --top 50
```

This outputs JSON with three sections:
- `astro` — Top-level test suite durations for the Astro package
- `integrations` — Top-level test suite durations for integration packages
- `e2e` — Playwright summary (total passed, duration, flaky tests)

Save the output:

```bash
node <skill-dir>/scripts/parse-test-durations.js /tmp/ci-run-<run_id>.log --top 50 > /tmp/ci-perf.json
```

The `--top N` flag controls how many tests to include (default 50). Use `--suite astro`
to parse only one suite.

### What the JSON contains

For Astro and Integrations suites, each test entry has:

- `name` — The top-level test suite name (corresponds to a describe block or test file)
- `avgMs` — Average duration across all platforms
- `maxMs` / `minMs` — Slowest and fastest platform
- `platformDurations` — Per-platform breakdown (e.g., `{"ubuntu-latest (node@22)": 17139}`)

For E2E, the data is at the suite level (Chrome/Firefox totals per platform) since
Playwright doesn't output per-test durations in its standard reporter.

Platform stats include total test count and total duration per platform, which shows
the relative speed of each CI target.

## Step 4: Generate the Report

Read the JSON and produce a markdown report. Structure it as follows:

### Overview Table

Summarize each suite: number of platforms, test count, average wall time, slowest platform.

### Platform Speed Comparison

Show total test time per platform for each suite. Compute relative speed factors
(e.g., "Windows is 1.4x slower than Ubuntu Node 24"). Key patterns to highlight:

- **Node 22 vs Node 24**: Node 22 can be 2-4x slower on SSR-heavy tests due to V8
  performance differences. Look for tests where the Node 22 duration is >2x the Node 24
  duration on the same OS.
- **Windows overhead**: Windows is typically 1.3-2.2x slower than Ubuntu.
- **macOS**: Usually the fastest runner (Apple Silicon).

### Per-Suite Tables (one per suite type)

For Astro and Integrations, create a table of the top 30-50 slowest tests:

```
| # | Test Suite | Ubuntu 22 | Ubuntu 24 | macOS 24 | Windows 24 | Avg |
```

Fill platform columns with the duration in seconds from `platformDurations`. Use "-" if
a test didn't run on that platform.

Include the distribution summary below each table:
- Bucket counts (>10s, 5-10s, 2-5s, 1-2s, <1s)
- Concentration (what % of total time the top 10/20/30 tests represent)

For E2E, show a simpler table with browser, test count, duration, and flaky/skipped counts
per platform.

### Node Version Comparison (if both Node 22 and 24 are present)

Show the tests with the biggest absolute slowdown between Node versions on the same OS
(Ubuntu). Sort by absolute time difference, not ratio, since a 3x slowdown on a 1s test
matters less than a 2x slowdown on a 20s test.

### Recommendations

Based on the data, highlight:

1. **Outlier tests** — Anything >20s on any platform deserves investigation
2. **High Node 22 regression** — Tests that are >2x slower on Node 22 may share a common
   cause (e.g., SSR server startup, Vite dev server)
3. **Platform-specific anomalies** — Tests much slower on one platform than others
4. **Concentration** — If the top 10 tests represent >10% of total time, optimizing those
   few tests has outsized impact on CI wall time
5. **Flaky E2E tests** — Tests that appear in the flaky list across runs are candidates
   for stabilization or isolation

## Tips

- If the user asks to compare two runs, download both logs and run the script on each,
  then diff the results.
- For deeper analysis of a specific slow test, grep the log file for that test name to
  see its full output including child test durations.
- The Astro suite runs in three phases: unit tests (`test/units/**/*.test.ts`), integration
  tests (`test/*.test.js`), and type tests. The unit tests are fast; integration tests
  dominate the runtime.
- Integration package tests run via Turbo with `--concurrency=auto`, so package-level
  parallelism exists but individual test files run sequentially within each package.
