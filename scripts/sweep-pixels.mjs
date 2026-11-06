#!/usr/bin/env node
/*
  The pixel sweep: every numeric assertion in the e2e suite, its received value, its expected value
  and its site, logged as the suite runs, then read by site as how much of each tolerance the worst
  call consumed.

  **This asserts nothing and is part of no gate.** Nothing calls it. It is an instrument (the
  coordinator, 6 Nov 2026): it found identity-band-holds:79, where the product's own helper rounds a
  band to 669 that renders at 668.547 and a half-pixel tolerance hid the difference (Q44), and it
  showed every pixel assertion reading the same value under dev and under a build, which retired the
  hypothesis that the suite was calibrated to dev. An instrument that has to be rebuilt from a
  description is one that will not be re-run, so it lives here.

  How it works, since Playwright gives no other way in: `expect.extend` skips built-in matcher names,
  and a trace records only the expected side of an expect step. So the suite is COPIED to
  `e2e-sweep/`, every file gains a proxy over `expect` that logs the numeric matchers (toBe, toEqual,
  toBeCloseTo, the four bounds) when the received value is a number or an array of numbers and then
  calls the real matcher, and a temporary config runs the copy. Line numbers hold: the import is
  appended at the end of each file, where an ES import is still hoisted. The copy and the config are
  removed afterwards; `next build` type-checks every .ts file under the root, so a copy left behind
  breaks the build.

      node scripts/sweep-pixels.mjs run [playwright args...]     # e.g. run --project=chromium e2e-sweep/lineup-146.spec.ts
      node scripts/sweep-pixels.mjs read <log.jsonl> [more...]   # the sites, worst call first

  `run` writes `docs/measurements/sweep/<stamp>-<project>.jsonl` (or SWEEP_LOG) and prints its path.
  Run it under `E2E_SERVER=build` to read the build, unset to read dev; `read` takes either or both.
  Never beside a gate (CLAUDE.md §10), and never beside the unit suite: it is a Playwright run.
*/
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const COPY = join(ROOT, 'e2e-sweep');
const CONFIG = join(ROOT, 'playwright.sweep.config.ts');
const PROXY = 'zz-sweep-expect.ts';

const PROXY_SOURCE = `/* The sweep's proxy over expect (scripts/sweep-pixels.mjs): logs numeric assertions, then calls the real matcher. Generated; untracked. */
import { appendFileSync } from 'node:fs';
import { expect } from '@playwright/test';

const LOG = process.env.SWEEP_LOG ?? '/tmp/sweep.jsonl';
const NUMERIC = new Set(['toBeCloseTo', 'toBeLessThanOrEqual', 'toBeLessThan', 'toBeGreaterThanOrEqual', 'toBeGreaterThan', 'toBe', 'toEqual']);
const isNum = (v: unknown): v is number => typeof v === 'number';
const numArray = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(isNum);

function where(): string {
  const line = (new Error().stack ?? '').split('\\n').find((l) => /e2e-sweep\\//.test(l) && !/${PROXY.replace('.ts', '')}/.test(l)) ?? '';
  return line.replace(/^.*\\((.*)\\).*$/, '$1').replace(/^\\s*at\\s+/, '').replace(/^.*e2e-sweep\\//, 'e2e/');
}

function proxied<T extends object>(matchers: T, actual: unknown, isNot: boolean): T {
  return new Proxy(matchers, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (name === 'not') return proxied(value as object, actual, !isNot);
      if (typeof name !== 'string' || !NUMERIC.has(name) || typeof value !== 'function') return value;
      if (!(isNum(actual) || numArray(actual))) return value;
      return (...args: unknown[]) => {
        let pass = true;
        try { return (value as (...a: unknown[]) => unknown)(...args); } catch (e) { pass = false; throw e; } finally {
          appendFileSync(LOG, \`\${JSON.stringify({ name, received: actual, args, isNot, pass, at: where() })}\\n\`);
        }
      };
    },
  });
}

type ExpectFn = typeof expect;
function make(base: ExpectFn): ExpectFn {
  const fn = ((actual: unknown, message?: unknown) => proxied(base(actual, message as string), actual, false)) as unknown as ExpectFn;
  return new Proxy(fn, {
    get(_t, name) {
      if (name === 'soft') return make(base.soft);
      if (name === 'poll') return base.poll;
      return Reflect.get(base, name);
    },
  });
}

export const sweepExpect: ExpectFn = make(expect);
`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function makeCopy() {
  rmSync(COPY, { recursive: true, force: true });
  cpSync(join(ROOT, 'e2e'), COPY, { recursive: true });
  writeFileSync(join(COPY, PROXY), PROXY_SOURCE);
  let transformed = 0;
  for (const file of walk(COPY)) {
    if (file.endsWith(PROXY)) continue;
    const text = readFileSync(file, 'utf8');
    if (!/\bexpect\b/.test(text)) continue;
    const swapped = text.replace(/(?<![\w.])expect(?=[.(])/g, 'sweepExpect');
    let rel = relative(dirname(file), join(COPY, PROXY)).replace(/\.ts$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    writeFileSync(file, `${swapped}\nimport { sweepExpect } from '${rel}';\n`);
    transformed += 1;
  }
  writeFileSync(CONFIG, "/* Generated by scripts/sweep-pixels.mjs; untracked; removed after the run. */\nimport base from './playwright.config';\nexport default { ...base, testDir: './e2e-sweep' };\n");
  return transformed;
}

function cleanUp() {
  rmSync(COPY, { recursive: true, force: true });
  rmSync(CONFIG, { force: true });
}

function run(args) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const project = (args.find((a) => a.startsWith('--project=')) ?? '--project=all').slice('--project='.length);
  const log = process.env.SWEEP_LOG ?? join(ROOT, 'docs', 'measurements', 'sweep', `${stamp}-${project}.jsonl`);
  mkdirSync(dirname(log), { recursive: true });
  const transformed = makeCopy();
  process.stdout.write(`sweep: ${transformed} files transformed into e2e-sweep/; logging to ${relative(ROOT, log)}\n`);
  let status = 1;
  try {
    const result = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.sweep.config.ts', ...args], { stdio: 'inherit', env: { ...process.env, SWEEP_LOG: log } });
    status = result.status ?? 1;
  } finally {
    cleanUp();
  }
  process.stdout.write(`sweep: playwright exited ${status}; the log is ${relative(ROOT, log)} (${existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0} calls)\n`);
  process.exit(status);
}

/* `read`: per site, the worst call. toBeCloseTo in share of its tolerance; bounds in distance to the bound; exact on a fraction listed whole. */
function read(paths) {
  const rows = [];
  for (const p of paths) for (const line of readFileSync(p, 'utf8').split('\n')) { if (line) try { rows.push(JSON.parse(line)); } catch { /* a torn line */ } }
  const frac = (x) => typeof x === 'number' && !Number.isInteger(x);
  const site = (at) => at.split(':').slice(0, 2).join(':');
  const close = new Map(); const bounds = new Map(); const exact = new Map();
  for (const r of rows) {
    if (r.isNot || !r.pass) continue;
    const e = r.args[0];
    const pairs = Array.isArray(r.received)
      ? (Array.isArray(e) && e.length === r.received.length && e.every((x) => typeof x === 'number') ? r.received.map((a, i) => [a, e[i]]) : [])
      : (typeof e === 'number' ? [[r.received, e]] : []);
    for (const [a, b] of pairs) {
      const key = site(r.at);
      if (r.name === 'toBeCloseTo') {
        const p = typeof r.args[1] === 'number' ? r.args[1] : 2;
        const tol = 10 ** -p / 2; const consumed = Math.abs(a - b) / tol;
        const s = close.get(key) ?? { p, tol, calls: 0, worst: -1 };
        s.calls += 1; if (consumed > s.worst) Object.assign(s, { worst: consumed, rec: a, exp: b }); close.set(key, s);
      } else if (r.name.startsWith('toBeLess') || r.name.startsWith('toBeGreater')) {
        const margin = r.name.startsWith('toBeLess') ? b - a : a - b;
        const s = bounds.get(key) ?? { name: r.name, calls: 0, worst: Infinity, scale: 0 };
        s.calls += 1; s.scale = Math.max(s.scale, Math.abs(a), Math.abs(b)); if (margin < s.worst) Object.assign(s, { worst: margin, rec: a, exp: b }); bounds.set(key, s);
      } else if (frac(a) || frac(b)) {
        const s = exact.get(key) ?? { calls: 0, rec: a, exp: b }; s.calls += 1; exact.set(key, s);
      }
    }
  }
  const out = [];
  out.push(`sites: toBeCloseTo ${close.size}, bounds ${bounds.size}, exact-on-a-fraction ${exact.size} (${rows.length} calls read)`);
  out.push('', 'toBeCloseTo sites consuming half or more of their tolerance on the worst call:');
  for (const [k, s] of [...close].filter(([, s]) => s.worst >= 0.5).sort((x, y) => y[1].worst - x[1].worst)) out.push(`  ${k.padEnd(44)} p=${String(s.p).padEnd(4)} consumed ${(s.worst * 100).toFixed(1).padStart(5)}%  received ${s.rec}  expected ${s.exp}  calls ${s.calls}`);
  const p0 = [...close.values()].filter((s) => s.p === 0);
  const bin = (w) => (w === 0 ? 'exact' : w < 0.1 ? '<10%' : w < 0.5 ? '<50%' : w < 0.9 ? '<90%' : '>=90%');
  const dist = {}; for (const s of p0) dist[bin(s.worst)] = (dist[bin(s.worst)] ?? 0) + 1;
  out.push('', `toBeCloseTo at precision 0 (the half pixel), ${p0.length} sites, worst call: ${JSON.stringify(dist)}`);
  out.push('', 'bound sites at pixel scale with a fractional value and under half a pixel to the bound:');
  for (const [k, s] of [...bounds].filter(([, s]) => s.scale >= 2 && s.worst < 0.5 && (frac(s.rec) || frac(s.exp))).sort((x, y) => x[1].worst - y[1].worst)) out.push(`  ${k.padEnd(44)} ${s.name.padEnd(22)} margin ${s.worst.toFixed(3)}  received ${s.rec}  bound ${s.exp}  calls ${s.calls}`);
  out.push('', 'exact equality on a fractional number (no tolerance), every site:');
  for (const [k, s] of [...exact].sort()) out.push(`  ${k.padEnd(44)} received ${JSON.stringify(s.rec)} expected ${JSON.stringify(s.exp)}  calls ${s.calls}`);
  process.stdout.write(`${out.join('\n')}\n`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'run') run(rest);
else if (command === 'read' && rest.length > 0) read(rest);
else { process.stderr.write('usage: scripts/sweep-pixels.mjs run [playwright args...] | read <log.jsonl> [more...]\n'); process.exit(2); }
