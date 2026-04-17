#!/usr/bin/env node
/**
 * parse-test-durations.js
 *
 * Parses Astro CI log files to extract per-test-suite durations across platforms
 * and produces a JSON report suitable for generating performance tables.
 *
 * Usage:
 *   node parse-test-durations.js <log-file> [--suite astro|integrations|e2e] [--top N]
 *
 * The log file should be the raw output from:
 *   gh run view <run_id> -R withastro/astro --log > <log-file>
 *
 * Output: JSON to stdout with the structure:
 *   {
 *     astro: { platforms, platformStats, tests: [...] },
 *     integrations: { platforms, platformStats, tests: [...] },
 *     e2e: { platforms, summaries }
 *   }
 */

const fs = require('fs');
const path = require('path');

// --- CLI args ---
const args = process.argv.slice(2);
const logFile = args.find((a) => !a.startsWith('--'));
const suiteFilter = (() => {
	const idx = args.indexOf('--suite');
	return idx !== -1 ? args[idx + 1] : null;
})();
const topN = (() => {
	const idx = args.indexOf('--top');
	return idx !== -1 ? parseInt(args[idx + 1], 10) : 50;
})();

if (!logFile) {
	console.error('Usage: node parse-test-durations.js <log-file> [--suite astro|integrations|e2e] [--top N]');
	process.exit(1);
}

const log = fs.readFileSync(logFile, 'utf8');

// --- Helpers ---

/** Strip ANSI escape codes from a string */
function stripAnsi(str) {
	return str.replace(/\x1b\[[0-9;]*m|\[(?:\d+;)*\d*m/g, '');
}

/**
 * Parse top-level test suite results from Node.js test runner output.
 *
 * The CI log format is:
 *   <job-name>\t<step-name>\t<timestamp> <turbo-prefix> <test-output>
 *
 * Top-level test results appear with no leading whitespace before the checkmark:
 *   astro:test: ✔ Suite Name (123.456ms)
 *
 * Indented results (child tests) have spaces before the checkmark:
 *   astro:test:   ✔ child test (0.5ms)
 */
function parseNodeTestRunner(logContent, suiteName) {
	const jobPrefix = suiteName === 'e2e' ? 'E2E' : suiteName;
	const stepName = suiteName === 'e2e' ? 'Test' : `Test ${suiteName}`;

	// Find all platforms for this suite
	const platformRegex = new RegExp(`^Test \\(${jobPrefix}\\): ([^\\t]+)\\t`, 'gm');
	const platformSet = new Set();
	let m;
	while ((m = platformRegex.exec(logContent)) !== null) {
		platformSet.add(m[1]);
	}
	const platforms = [...platformSet];

	const results = {};

	for (const platform of platforms) {
		const prefix = `Test (${jobPrefix}): ${platform}\t${stepName}`;
		const lines = logContent.split('\n').filter((l) => l.startsWith(prefix));

		const topTests = [];
		for (const line of lines) {
			const clean = stripAnsi(line);
			const testOutputMatch = clean.match(/:test:\s*(.*)/);
			if (!testOutputMatch) continue;
			const afterTest = testOutputMatch[1];

			// Top-level: starts immediately with checkmark (no leading spaces)
			const resultMatch = afterTest.match(/^[✔✗]\s+(.+?)\s+\(([0-9.]+)(ms|s)\)/);
			if (resultMatch) {
				let durationMs = parseFloat(resultMatch[2]);
				if (resultMatch[3] === 's') durationMs *= 1000;
				topTests.push({
					name: resultMatch[1],
					durationMs,
					passed: afterTest.startsWith('✔'),
				});
			}
		}

		results[platform] = topTests;
	}

	return { platforms, results };
}

/**
 * Parse Playwright E2E test summaries.
 * Playwright doesn't output per-test durations in standard mode,
 * but it does output summary lines like "417 passed (6.3m)".
 */
function parsePlaywright(logContent) {
	const platforms = [];
	const platformRegex = /^Test \(E2E\): ([^\t]+)\t/gm;
	const platformSet = new Set();
	let m;
	while ((m = platformRegex.exec(logContent)) !== null) {
		platformSet.add(m[1]);
	}

	const results = {};

	for (const platform of platformSet) {
		const prefix = `Test (E2E): ${platform}\tTest`;
		const lines = logContent.split('\n').filter((l) => l.startsWith(prefix));

		const summaries = [];
		const configs = [];

		for (const line of lines) {
			const clean = stripAnsi(line);

			// "N passed (Xm)" or "N passed (X.Ys)"
			const passedMatch = clean.match(/(\d+) passed\s*\(([0-9.]+)(m|s)\)/);
			if (passedMatch) {
				let durationSec = parseFloat(passedMatch[2]);
				if (passedMatch[3] === 'm') durationSec *= 60;
				summaries.push({ passed: parseInt(passedMatch[1], 10), durationSec });
			}

			const flakyMatch = clean.match(/(\d+) flaky/);
			if (flakyMatch) {
				const last = summaries[summaries.length - 1] || {};
				last.flaky = parseInt(flakyMatch[1], 10);
			}

			const skippedMatch = clean.match(/(\d+) skipped/);
			if (skippedMatch) {
				const last = summaries[summaries.length - 1] || {};
				last.skipped = parseInt(skippedMatch[1], 10);
			}

			const runMatch = clean.match(/Running (\d+) tests? using (\d+) worker/);
			if (runMatch) {
				configs.push({ tests: parseInt(runMatch[1], 10), workers: parseInt(runMatch[2], 10) });
			}

			const configMatch = clean.match(/playwright\.([\w.]+)\.config/);
			if (configMatch) {
				configs.push({ browser: configMatch[1] });
			}
		}

		// Wall time from timestamps
		let wallTimeSec = 0;
		if (lines.length > 0) {
			const firstTs = lines[0].match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
			const lastTs = lines[lines.length - 1].match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
			if (firstTs && lastTs) {
				wallTimeSec = (new Date(lastTs[1]) - new Date(firstTs[1])) / 1000;
			}
		}

		results[platform] = { summaries, configs, wallTimeSec };
	}

	return { platforms: [...platformSet], results };
}

/**
 * Compute cross-platform averages for Node test runner results.
 * Returns an array sorted by average duration (descending).
 */
function computeAverages(results) {
	const allTests = new Map();

	for (const [platform, tests] of Object.entries(results)) {
		for (const t of tests) {
			if (!allTests.has(t.name)) {
				allTests.set(t.name, { durations: [], platformDurations: {} });
			}
			allTests.get(t.name).durations.push(t.durationMs);
			allTests.get(t.name).platformDurations[platform] = t.durationMs;
		}
	}

	const averaged = [];
	for (const [name, data] of allTests) {
		const avg = data.durations.reduce((s, d) => s + d, 0) / data.durations.length;
		const max = Math.max(...data.durations);
		const min = Math.min(...data.durations);
		averaged.push({
			name,
			avgMs: avg,
			maxMs: max,
			minMs: min,
			count: data.durations.length,
			platformDurations: data.platformDurations,
		});
	}

	averaged.sort((a, b) => b.avgMs - a.avgMs);
	return averaged;
}

/** Compute per-platform aggregate stats */
function platformStats(results) {
	const stats = {};
	for (const [platform, tests] of Object.entries(results)) {
		const total = tests.reduce((s, t) => s + t.durationMs, 0);
		stats[platform] = { count: tests.length, totalMs: total };
	}
	return stats;
}

/** Compute distribution buckets */
function distribution(tests) {
	const buckets = { '>10s': 0, '5-10s': 0, '2-5s': 0, '1-2s': 0, '<1s': 0 };
	for (const t of tests) {
		const s = t.avgMs / 1000;
		if (s > 10) buckets['>10s']++;
		else if (s > 5) buckets['5-10s']++;
		else if (s > 2) buckets['2-5s']++;
		else if (s > 1) buckets['1-2s']++;
		else buckets['<1s']++;
	}

	const total = tests.reduce((s, t) => s + t.avgMs, 0);
	let cumulative = 0;
	const concentration = {};
	for (let i = 0; i < tests.length; i++) {
		cumulative += tests[i].avgMs;
		if (i === 4) concentration.top5 = ((cumulative / total) * 100).toFixed(1) + '%';
		if (i === 9) concentration.top10 = ((cumulative / total) * 100).toFixed(1) + '%';
		if (i === 19) concentration.top20 = ((cumulative / total) * 100).toFixed(1) + '%';
		if (i === 29) concentration.top30 = ((cumulative / total) * 100).toFixed(1) + '%';
	}

	return { buckets, concentration, totalAvgSec: total / 1000 };
}

// --- Main ---

const output = {};

// Parse Astro suite
if (!suiteFilter || suiteFilter === 'astro') {
	const { platforms, results } = parseNodeTestRunner(log, 'astro');
	if (platforms.length > 0) {
		const averaged = computeAverages(results);
		output.astro = {
			platforms,
			platformStats: platformStats(results),
			distribution: distribution(averaged),
			tests: averaged.slice(0, topN),
		};
	}
}

// Parse Integrations suite
if (!suiteFilter || suiteFilter === 'integrations') {
	const { platforms, results } = parseNodeTestRunner(log, 'integrations');
	if (platforms.length > 0) {
		const averaged = computeAverages(results);
		output.integrations = {
			platforms,
			platformStats: platformStats(results),
			distribution: distribution(averaged),
			tests: averaged.slice(0, topN),
		};
	}
}

// Parse E2E suite
if (!suiteFilter || suiteFilter === 'e2e') {
	const e2e = parsePlaywright(log);
	if (e2e.platforms.length > 0) {
		output.e2e = e2e;
	}
}

console.log(JSON.stringify(output, null, 2));
