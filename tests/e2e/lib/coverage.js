#!/usr/bin/env node
// Answers "is everything Poznote does really tested?", from four angles:
//   1. every feature of features/*.json has a test, or says why a person must check it;
//   2. every test tag names a feature of the catalog;
//   3. every route, setting, slash command... found in the code is claimed by a feature;
//   4. with --hits, every route and page was really reached by the run, successfully.
// With --results, also says per feature whether its tests passed. Writes FEATURES.md.
//
//   node lib/coverage.js [--hits <file>] [--results <file>]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('./inventory');

const HERE = path.join(__dirname, '..');
const option = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };

const domains = fs.readdirSync(path.join(HERE, 'features')).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ file: name, ...JSON.parse(fs.readFileSync(path.join(HERE, 'features', name), 'utf8')) }));
const features = domains.flatMap((domain) => domain.features.map((feature) => ({ ...feature, domain: domain.title })));
const problems = [];

const duplicates = features.map((feature) => feature.id).filter((id, index, all) => all.indexOf(id) !== index);
for (const id of new Set(duplicates)) problems.push(`Feature listed twice: ${id}`);

// --- Which test covers which feature -------------------------------------------
function listTests() {
    const output = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json', '--project=chromium'], {
        cwd: HERE, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const tests = [];
    const visit = (suite, trail) => {
        for (const spec of suite.specs || []) tests.push({ title: [...trail, spec.title].join(' › '), file: spec.file, tags: spec.tags || [] });
        for (const child of suite.suites || []) visit(child, suite.file === child.file && child.title !== child.file ? [...trail, child.title] : trail);
    };
    for (const suite of JSON.parse(output).suites) visit(suite, []);
    return tests;
}

const tests = listTests();
const byFeature = new Map();
for (const test of tests) {
    for (const tag of test.tags) {
        if (!tag.startsWith('f:')) continue;
        const id = tag.slice(2);
        if (!byFeature.has(id)) byFeature.set(id, []);
        byFeature.get(id).push(test);
    }
}

const known = new Set(features.map((feature) => feature.id));
for (const id of byFeature.keys()) if (!known.has(id)) problems.push(`A test covers an unknown feature: ${id}`);
for (const feature of features) {
    if (!byFeature.has(feature.id) && !feature.manual) problems.push(`No test for: ${feature.id} (${feature.title})`);
}

// --- Is everything in the code claimed by the catalog? -----------------------------
const toRegex = (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const claims = features.flatMap((feature) => feature.src || []);
for (const domain of domains) {
    for (const entry of domain.notFeatures || []) claims.push(entry.src);
}
const claimRegexes = claims.map(toRegex);
const found = inventory();
const unclaimed = [];
for (const [kind, values] of Object.entries(found)) {
    for (const value of values) {
        const item = `${kind}:${value}`;
        if (!claimRegexes.some((regex) => regex.test(item))) unclaimed.push(item);
    }
}
for (const item of unclaimed) problems.push(`In the code, but in no feature: ${item}`);
const everything = Object.entries(found).flatMap(([kind, values]) => values.map((value) => `${kind}:${value}`));
for (const claim of claims) {
    const regex = toRegex(claim);
    if (!everything.some((item) => regex.test(item))) problems.push(`In the catalog, but not in the code: ${claim}`);
}

// --- Did the run really reach every route and page? -----------------------------
const notReached = [];
const hitsFile = option('--hits');
if (hitsFile && fs.existsSync(hitsFile)) {
    const hits = fs.readFileSync(hitsFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const good = hits.filter(([, , status]) => status < 400);
    const exempt = features.filter((feature) => feature.manual).flatMap((feature) => feature.src || []).map(toRegex);
    const isExempt = (item) => exempt.some((regex) => regex.test(item));
    for (const route of found.route) {
        const [method, pattern] = route.split(' ');
        const regex = new RegExp(`^/api/v1${pattern.replace(/\{[^}]+\}/g, '[^/]+')}/?(\\?.*)?$`);
        if (!isExempt(`route:${route}`) && !good.some(([verb, uri]) => verb === method && regex.test(uri))) notReached.push(`route:${route}`);
    }
    for (const page of found.page) {
        const needle = `/${page}`;
        const reached = good.some(([, uri]) => uri.split('?')[0] === needle);
        const claimedElsewhere = isExempt(`page:${page}`);
        if (!reached && !claimedElsewhere) notReached.push(`page:${page}`);
    }
    for (const item of notReached) problems.push(`Never reached successfully during the run: ${item}`);
}

// --- Did the tests of each feature pass? ---------------------------------------
const failedFeatures = [];
const knownBugs = [];
const resultsFile = option('--results');
if (resultsFile && fs.existsSync(resultsFile)) {
    const failed = new Set();
    const visit = (suite) => {
        for (const spec of suite.specs || []) {
            const annotations = (spec.tests || []).flatMap((test) => test.annotations || []);
            for (const note of annotations) if (note.type === 'fail') knownBugs.push(`${spec.title}: ${note.description || ''}`);
            if (!spec.ok) for (const tag of spec.tags || []) if (tag.startsWith('f:')) failed.add(tag.slice(2));
        }
        for (const child of suite.suites || []) visit(child);
    };
    for (const suite of JSON.parse(fs.readFileSync(resultsFile, 'utf8')).suites || []) visit(suite);
    failedFeatures.push(...features.filter((feature) => failed.has(feature.id)));
}

// --- The list itself --------------------------------------------------------------
const lines = ['# Poznote features', '',
    'Generated by `tests/e2e/lib/coverage.js` from `tests/e2e/features/*.json`, do not edit by hand.', '',
    `${features.length} features, ${features.filter((feature) => byFeature.has(feature.id)).length} with an automated test, ${features.filter((feature) => feature.manual && !byFeature.has(feature.id)).length} to check by hand.`, ''];
for (const domain of domains) {
    lines.push(`## ${domain.title}`, '', '| Feature | Checked by |', '| --- | --- |');
    for (const feature of domain.features) {
        const covering = byFeature.get(feature.id);
        const how = covering ? covering.map((test) => test.title.replace(/\|/g, '\\|')).join('<br>') : `By hand: ${feature.manual}`;
        lines.push(`| ${feature.title.replace(/\|/g, '\\|')} | ${how} |`);
    }
    lines.push('');
}
fs.writeFileSync(path.join(HERE, 'FEATURES.md'), lines.join('\n'));

// --- Verdict ----------------------------------------------------------------------
console.log(`${features.length} features in the catalog, ${tests.length} tests, ${Object.values(found).flat().length} items found in the code`);
for (const domain of domains) {
    const own = domain.features;
    const tested = own.filter((feature) => byFeature.has(feature.id)).length;
    const bad = own.filter((feature) => failedFeatures.some((failed) => failed.id === feature.id)).length;
    console.log(`  ${domain.title.padEnd(34)} ${String(tested).padStart(4)} tested  ${String(own.length - tested).padStart(3)} by hand${bad ? `  ${bad} FAILED` : ''}`);
}
if (failedFeatures.length) {
    console.log(`\nFeatures whose tests failed (${failedFeatures.length}):`);
    for (const feature of failedFeatures) console.log(`  ${feature.id}: ${feature.title}`);
}
if (knownBugs.length) {
    console.log(`\nKnown bugs, tolerated until fixed (${knownBugs.length}):`);
    for (const bug of [...new Set(knownBugs)]) console.log(`  ${bug}`);
}
const byHand = features.filter((feature) => feature.manual && !byFeature.has(feature.id));
if (byHand.length) {
    console.log(`\nNot automated, to check by hand (${byHand.length}):`);
    for (const feature of byHand) console.log(`  ${feature.title}: ${feature.manual}`);
}
if (problems.length) {
    console.log(`\nCoverage problems (${problems.length}):`);
    for (const problem of problems.slice(0, Number(option('--max') || 400))) console.log(`  ${problem}`);
    process.exit(1);
}
console.log('\nEvery feature found in the code is in the catalog and has its check.');
