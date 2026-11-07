#!/usr/bin/env node
/*
  The twice sweep: every site in the e2e suite that reads the same measurement twice with an action
  between, listed from Playwright's own steps as the suite runs, then read by site.

  **This asserts nothing and is part of no gate.** Nothing calls it. It is an instrument (the
  coordinator, 6 Nov 2026) that bounds Q45's list: the family member is "a test that measures a shared
  quantity across an action" (wall-route:213 read the wall's width, widened the window, read it again;
  lineup-146 read a box three times around a walk; the wait's equality read the view at the write and
  at the test's read), and seven sites were listed by inspection. A reporter sees every API step with
  its title and source location, so per test the sequence of (location, kind) is known with no
  transformed copy of the suite, and a hit is a read location that recurs with an action step between
  its occurrences. What a reporter cannot tell is whether the quantity read is the collection's or the
  test's own, so each hit is a site to read, and the first output is the count with a sample.

      node scripts/sweep-twice.mjs run [playwright args...]     # e.g. run --project=chromium
      node scripts/sweep-twice.mjs read <log.jsonl> [more...]   # the sites, most reads first

  `run` writes `docs/measurements/twice/<stamp>-<project>.jsonl` (or TWICE_LOG) through a temporary
  config that adds this file as a reporter beside the list reporter; the config is removed afterwards.
  Never beside a gate (CLAUDE.md §10), and never beside the unit suite: it is a Playwright run.
*/
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {{ title: string, file: string, line: number }} Step */
/** @typedef {{ site: string, title: string, reads: number, actions: string[] }} Hit */

/*
  Two vocabularies: the call form (`page.evaluate`, `locator.click`), and the words Playwright 1.62 titles its
  steps with ("Evaluate locator", "Click getByRole", "Navigate to "/login"", "POST "/api/artists""), which the
  first run of this instrument found by classifying 26 of 26 steps as other. A run's `kinds` line is its own
  calibration: reads at 0 says the classifier, not the suite.
*/
const READ = /^(?:page|frame)\.(?:evaluate|evaluateHandle|screenshot|title|url|content)\b|^locator\.(?:evaluate|evaluateAll|boundingBox|textContent|innerText|innerHTML|getAttribute|count|allTextContents|allInnerTexts|inputValue|isVisible|isChecked|isEnabled|screenshot)\b|^(?:Evaluate|Bounding box|Text content|Inner text|Inner HTML|Get attribute|Count|All text contents|All inner texts|Input value|Is visible|Is checked|Is enabled|Screenshot|Title|Content|Query count)(?:\s|$)/;
const ACTION = /^(?:page|frame|locator)\.(?:click|dblclick|goto|reload|goBack|goForward|setViewportSize|press|fill|type|hover|tap|check|uncheck|selectOption|dragTo|focus|blur|scrollIntoViewIfNeeded|setInputFiles|insertText|dispatchEvent|setContent)\b|^(?:mouse|keyboard|touchscreen)\.|^apiRequestContext\.(?:post|put|patch|delete|fetch)\b|^(?:Click|Double click|Navigate to|Reload|Go back|Go forward|Set viewport size|Press|Fill|Type|Hover|Tap|Check|Uncheck|Select option|Drag to|Focus|Blur|Scroll into view|Set input files|Insert text|Dispatch event|Set content|Clear|Mouse|Keyboard|Touchscreen|POST|PUT|PATCH|DELETE|Fetch)(?:\s|$)/;

/** What an API step is to the sweep: a read of the page, an action on it or the collection, or neither (an assertion, a wait, a GET, the context's own steps). */
export function kindOf(title) {
  if (READ.test(title)) return 'read';
  if (ACTION.test(title)) return 'action';
  return null;
}

/* A step's name: the call form up to its parenthesis, or the words up to the first quoted or locator argument. */
const name = (title) => title.replace(/\(.*$/s, '').replace(/\s+(?:"|getBy\w|locator\b|page\b|frame\b).*$/s, '').trim();

/*
  An evaluate that WRITES is an action (the coordinator, 6 Nov). A page.evaluate that scrolls the region, resets a
  probe or sets a style changes what the next read reads, and the reporter took every evaluate as a read, so
  wall-settle's own test, the family's founding case, showed no hit. Counted over the suite: 72 of 837 evaluate
  calls write by their body's tokens, too many to enumerate by hand, so each call site's body is read from the
  source before the run and an evaluate step at a write site is an action. Token-based: a write by a helper the
  body calls is missed, and the run prints the write-site count beside its hits so the bound is on the page.
*/
const WRITE = /\b(?:scrollTop|scrollLeft)\s*[+\-]?=(?!=)|\.scroll(?:To|By|IntoView)\(|\.(?:click|focus|blur|remove|submit)\(\)|dispatchEvent\(|\.value\s*=(?!=)|\.style\.\w+\s*=(?!=)|(?:set|remove)Attribute\(|innerHTML\s*=(?!=)|\b__\w+\s*=(?!=)|(?:local|session)Storage\.(?:set|remove|clear)|document\.cookie\s*=(?!=)|history\.(?:push|replace|back|go)|classList\.(?:add|remove|toggle)|\.checked\s*=(?!=)|\.textContent\s*=(?!=)|appendChild\(|insertBefore\(|\.replaceWith\(|\.dataset\.\w+\s*=(?!=)/;

function walkTs(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) walkTs(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The `file:line` of every evaluate call under `<root>/e2e` whose body, bracket-matched, carries a write token. */
export function evaluateWriteSites(root = process.cwd()) {
  const sites = new Set();
  for (const file of walkTs(join(root, 'e2e'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.evaluate(?:All|Handle)?\s*\(/g)) {
      let depth = 1;
      let j = m.index + m[0].length;
      while (j < src.length && depth > 0) { if (src[j] === '(') depth += 1; else if (src[j] === ')') depth -= 1; j += 1; }
      if (WRITE.test(src.slice(m.index + m[0].length, j - 1))) sites.add(`${relative(root, file)}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  return sites;
}

const kindAt = (step, writes) => (/^(?:Evaluate|page\.evaluate|locator\.evaluate)/.test(step.title) && writes.has(`${step.file}:${step.line}`) ? 'write' : kindOf(step.title));

/**
 * The hits in one test's steps, in order: for each read site (file:line) that
 * occurs more than once, the kinds of action between its first and last
 * occurrence, each once in order of first appearance; a site with none is not
 * a hit. An evaluate at a write site is an action, named "(a write)".
 * @param {Step[]} steps
 * @param {Set<string>} [writes]
 * @returns {Hit[]}
 */
export function hitsOf(steps, writes = new Set()) {
  const sites = new Map();
  steps.forEach((s, i) => {
    if (kindAt(s, writes) !== 'read') return;
    const key = `${s.file}:${s.line}`;
    const site = sites.get(key) ?? { site: key, title: name(s.title), at: [] };
    site.at.push(i);
    sites.set(key, site);
  });
  const hits = [];
  for (const site of sites.values()) {
    if (site.at.length < 2) continue;
    const actions = [];
    for (let i = site.at[0] + 1; i < site.at[site.at.length - 1]; i += 1) {
      const k = kindAt(steps[i], writes);
      const label = k === 'write' ? `${name(steps[i].title)} (a write)` : name(steps[i].title);
      if ((k === 'action' || k === 'write') && !actions.includes(label)) actions.push(label);
    }
    if (actions.length > 0) hits.push({ site: site.site, title: site.title, reads: site.at.length, actions });
  }
  return hits;
}

const ROOT = process.cwd();

/** The reporter: steps collected per test in order, and one JSON line per test when it ends. */
export default class SweepTwice {
  constructor(options = {}) {
    this.log = options.log ?? process.env.TWICE_LOG ?? '/tmp/twice.jsonl';
    this.steps = new Map();
    this.writes = options.writes ?? evaluateWriteSites(ROOT);
    mkdirSync(dirname(this.log), { recursive: true });
    writeFileSync(this.log, '');
  }
  /* Keyed by the test's own id and retry, not its location: two tests of one parametrised loop share a line (lineup-146:38, twice), and keyed by line the first to end took both tests' steps. */
  key(test, result) { return `${test.id ?? `${test.location.file}:${test.location.line}`}:${result.retry}`; }
  onStepBegin(test, result, step) {
    if (step.category !== 'pw:api' || !step.location) return;
    const list = this.steps.get(this.key(test, result)) ?? [];
    list.push({ title: step.title, file: relative(ROOT, step.location.file), line: step.location.line });
    this.steps.set(this.key(test, result), list);
  }
  onTestEnd(test, result) {
    const steps = this.steps.get(this.key(test, result)) ?? [];
    this.steps.delete(this.key(test, result));
    const path = test.titlePath();
    /* The kinds and the distinct titles are the instrument's own calibration: a run with reads at 0 says the classifier, not the suite. */
    const kinds = { read: 0, action: 0, other: 0 };
    const titles = {};
    for (const s of steps) { const k = kindAt(s, this.writes); kinds[k === 'write' ? 'action' : (k ?? 'other')] += 1; titles[name(s.title)] = (titles[name(s.title)] ?? 0) + 1; }
    /* The steps themselves, so a later reader with a better classifier re-reads the run instead of repeating it: the 6 Nov whole-suite run kept only counts, and its hits could not be recomputed. */
    const line = { test: `${relative(ROOT, test.location.file)}:${test.location.line} ${path[path.length - 1]}`, project: path[1] ?? '', status: result.status, retry: result.retry, steps, kinds, titles, hits: hitsOf(steps, this.writes) };
    appendFileSync(this.log, `${JSON.stringify(line)}\n`);
  }
  printsToStdio() { return false; }
}

const CONFIG = join(ROOT, 'playwright.twice.config.ts');

function run(args) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const project = (args.find((a) => a.startsWith('--project=')) ?? '--project=all').slice('--project='.length);
  const log = process.env.TWICE_LOG ?? join(ROOT, 'docs', 'measurements', 'twice', `${stamp}-${project}.jsonl`);
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(CONFIG, `/* Generated by scripts/sweep-twice.mjs; untracked; removed after the run. */\nimport base from './playwright.config';\nexport default { ...base, reporter: [['list'], ['./scripts/sweep-twice.mjs', { log: ${JSON.stringify(log)} }]] };\n`);
  process.stdout.write(`twice: logging to ${relative(ROOT, log)}\n`);
  let status = 1;
  try {
    const result = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.twice.config.ts', ...args], { stdio: 'inherit', env: { ...process.env, TWICE_LOG: log } });
    status = result.status ?? 1;
  } finally {
    rmSync(CONFIG, { force: true });
  }
  const tests = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0;
  process.stdout.write(`twice: playwright exited ${status}; the log is ${relative(ROOT, log)} (${tests} tests)\n`);
  process.exit(status);
}

/*
  A sweep prints its classification distribution beside its hits, always, and a run where one bucket holds
  everything, or where nothing acts, is a BROKEN READER and not a clean result (the coordinator, 6 Nov): this
  instrument's first run read 26 of 26 steps as other and would have reported a confident zero, and was caught
  only because it printed its kinds line. The absent-versus-broken member, made a line every sweep prints.
*/
export function reportOf(rows) {
  const sites = new Map();
  for (const r of rows) for (const h of r.hits ?? []) {
    const s = sites.get(h.site) ?? { site: h.site, title: h.title, reads: 0, tests: new Set(), actions: new Set() };
    s.reads = Math.max(s.reads, h.reads);
    s.tests.add(r.test);
    for (const a of h.actions) s.actions.add(a);
    sites.set(h.site, s);
  }
  const byAction = {};
  for (const s of sites.values()) for (const a of s.actions) byAction[a] = (byAction[a] ?? 0) + 1;
  const kinds = { read: 0, action: 0, other: 0 };
  const others = {};
  for (const r of rows) {
    for (const k of Object.keys(kinds)) kinds[k] += r.kinds?.[k] ?? 0;
    for (const [t, n] of Object.entries(r.titles ?? {})) if (kindOf(t) === null) others[t] = (others[t] ?? 0) + n;
  }
  const total = kinds.read + kinds.action + kinds.other;
  const broken = total === 0 || kinds.other === total || kinds.read === total || kinds.action === 0;
  const lines = [];
  if (broken) lines.push(`BROKEN READER: ${kinds.other} of ${total} steps read as other, ${kinds.read} as reads, ${kinds.action} as actions; no hit count from this run means anything`);
  lines.push(`hits: ${sites.size} site${sites.size === 1 ? '' : 's'} in ${new Set(rows.flatMap((r) => ((r.hits?.length ?? 0) > 0 ? [r.test] : []))).size} tests, of ${rows.length} tests read`);
  lines.push(`steps by kind: ${JSON.stringify(kinds)}; titles read as neither, so a kind the classifier lacks is on this line: ${JSON.stringify(others)}`);
  lines.push(`by the action between (a site with actions of several kinds counts under each, so these do not sum to the site total): ${JSON.stringify(byAction)}`);
  lines.push('', 'sites, most reads first (the quantity read is a reading per site: the reporter cannot tell the collection’s from the test’s own):');
  for (const s of [...sites.values()].sort((a, b) => b.reads - a.reads || a.site.localeCompare(b.site))) lines.push(`  ${s.site.padEnd(40)} ${s.title.padEnd(20)} reads ${String(s.reads).padStart(2)}  across ${[...s.actions].join(', ')}  in ${s.tests.size} test${s.tests.size === 1 ? '' : 's'}`);
  return { broken, lines };
}

function read(paths) {
  const rows = [];
  for (const p of paths) for (const line of readFileSync(p, 'utf8').split('\n')) { if (line) try { rows.push(JSON.parse(line)); } catch { /* a torn line */ } }
  const writes = evaluateWriteSites(ROOT);
  /* A log that kept its steps is re-read with this classifier; one that kept only counts is read as it stands. */
  for (const r of rows) if (Array.isArray(r.steps)) r.hits = hitsOf(r.steps, writes);
  const { broken, lines } = reportOf(rows);
  process.stdout.write(`${lines.join('\n')}\nevaluate write sites in e2e/: ${writes.size}\n`);
  if (broken) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'run') run(rest);
  else if (command === 'read' && rest.length > 0) read(rest);
  else { process.stderr.write('usage: scripts/sweep-twice.mjs run [playwright args...] | read <log.jsonl> [more...]\n'); process.exit(2); }
}
