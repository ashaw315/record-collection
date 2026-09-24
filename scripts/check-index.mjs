#!/usr/bin/env node
/**
 * Index assertions — implemented from `docs/design/ASSERTIONS-spec.md`.
 *
 * **The script's exit code is the result.** A report written by whoever
 * edited the index is not. Run it in CI and before any handoff is exported.
 *
 * Built from the spec rather than from the handoff or from the repo's own
 * earlier index test: the spec records, for six of the eight assertions, the
 * defect that motivated it and the weaker version that passed on it. Those
 * notes are the reason each check has the shape it has, and are reproduced
 * at the assertions they belong to.
 */
import { readFileSync, existsSync } from 'node:fs';
import {
  collapse,
  decodeEntities,
  liveText,
  sectionText,
  sections,
  stripTags,
  withoutSvg,
} from './design-target-parser.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'design');
const FILES = {
  H: 'HANDOFF-wall-and-pull.md',
  L: 'Record Detail 8a - build target.dc.html',
  S: 'Record Detail 8a - settled 1-10.dc.html',
  W: 'Wall and Pull - build target.dc.html',
};

/** Spec: decode these two entities before any text comparison. */
const decode = decodeEntities;

const read = (key) => {
  const path = join(DESIGN, FILES[key]);
  if (!existsSync(path)) {
    console.error(`missing input ${key}: ${FILES[key]}`);
    process.exit(2);
  }
  return decode(readFileSync(path, 'utf8'));
};

const src = { H: read('H'), L: read('L'), S: read('S'), W: read('W') };

/**
 * Headings of one target file — delegated to `design-target-parser.mjs`, the
 * ONE implementation of this pattern. A lookalike that matched the eyebrow
 * styling without requiring an id and " · " truncated §26 at a figure
 * caption; see that module's header.
 */
const headings = (key) => sections(src[key], { prefixW: key === 'W' });

const ALL = [...headings('L'), ...headings('S'), ...headings('W')];
const byId = new Map(ALL.map((h) => [h.id, h]));

/*
  Spec: live text is the section text with every `[data-withdrawn-by]`
  element removed. There is no keyword list — withdrawn text is DECLARED.
  Both helpers come from the shared parser.
*/

/* ---- tables in H ---------------------------------------------------- */
const between = (text, from, to) => {
  const a = text.indexOf(from);
  if (a < 0) return '';
  const b = to === null ? text.length : text.indexOf(to, a);
  return text.slice(a, b < 0 ? undefined : b);
};

const rowsIn = (block) =>
  block
    .split('\n')
    .filter((line) => line.startsWith('| §'))
    .map((line) => {
      const cols = line.split('|').map((c) => c.trim());
      const id = cols[1].replace(/^§/, '').split(/\s/)[0];
      return { id, title: cols[2] ?? '', pointer: cols.slice(3).join('|'), line };
    });

const governs = rowsIn(between(src.H, '## What each subsection governs', '## Structural sections'));
const pointers = rowsIn(between(src.H, '## Structural sections', '## Build order'));
const allRows = [...governs, ...pointers];

const orderBlock = between(src.H, '## Build order', '## Maintaining');

/* ---- assertions ------------------------------------------------------ */
const failures = [];
const fail = (line) => failures.push(line);
/*
  **The `--candidates` bootstrap is gone, and with it the last thing here
  that guessed.**

  The spec's own instruction retired it: "After the pass, delete
  `--candidates` and the pattern with it, so nothing in the script guesses."
  The marking pass has landed, so the trigger is met.

  What it carried was an eleven-keyword regex over every sentence in three
  files — the exact machinery the declared-mark design replaced, because a
  list derived from the phrasings seen so far fits those and misses the next
  one. It missed "reversed", which this corpus uses constantly. Leaving it
  reachable behind a flag left the guessing in the script; a flag is not a
  deletion.

  The PROVISIONAL state went with it. It existed to say "the marking pass has
  not landed, so 6, 7 and 8a cannot be judged either way". They can be judged
  now, so every assertion is PASS or FAIL and every offender is fatal.
*/
const report = (n, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`);

/* 1. Every heading has exactly one row. */
{
  const before = failures.length;
  const counts = new Map();
  for (const r of allRows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  for (const h of ALL) {
    const k = counts.get(h.id) ?? 0;
    if (k !== 1) fail(`1 §${h.id} rows=${k}`);
  }
  for (const r of allRows) if (!byId.has(r.id)) fail(`1 §${r.id} no-heading`);
  report(1, failures.length === before);
}

/* 2. Every governs row is in the build order. */
{
  const before = failures.length;
  for (const r of governs) {
    const re = new RegExp(`§${r.id.replace('.', '\\.')}(?![\\d.])`);
    if (!re.test(orderBlock)) fail(`2 §${r.id} not-in-order`);
  }
  report(2, failures.length === before);
}

/* 3. Steps are contiguous, and none follows the closing paragraph. */
{
  const before = failures.length;
  const lines = orderBlock.split('\n');
  const steps = [];
  lines.forEach((line, i) => {
    const m = /^(\d+)\. /.exec(line);
    if (m !== null) steps.push({ n: Number(m[1]), i });
  });
  steps.forEach((s, k) => {
    if (s.n !== k) fail(`3 gap-at ${s.n}`);
  });
  const closeAt = lines.findIndex((l) => l.includes('Every row in the table above'));
  if (closeAt >= 0) for (const s of steps) if (s.i > closeAt) fail(`3 step-after-close ${s.n}`);
  report(3, failures.length === before);
}

/* 4. Cross-file references resolve. */
{
  const before = failures.length;
  const has = (id) => byId.has(id);
  /* Spec: exclude the renumbering note at the head of W, which names §11 as the old number. */
  const bodyOf = (key) => {
    const text = collapse(stripTags(withoutSvg(src[key])));
    if (key !== 'W') return text;
    const note = text.indexOf('Renumbering');
    return note < 0 ? text : text.slice(0, note) + text.slice(text.indexOf('. ', note + 200) + 1);
  };
  for (const key of ['L', 'S']) {
    for (const m of bodyOf(key).matchAll(/§(W\.\d+(?:\.\d+)?)/g)) {
      if (!has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['L', 'W']) {
    for (const m of bodyOf(key).matchAll(/§(\d{1,2}(?:\.\d+)?)/g)) {
      const n = Number(m[1].split('.')[0]);
      if (n >= 1 && n <= 10 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['S', 'W']) {
    for (const m of bodyOf(key).matchAll(/§(\d{1,2}(?:\.\d+)?)/g)) {
      const n = Number(m[1].split('.')[0]);
      if (n >= 12 && n <= 32 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  report(4, failures.length === before);
}

/* 5. Each row's subject matches its section. */
{
  const before = failures.length;
  const norm = (s) => collapse(s.replace(/’/g, "'").toLowerCase());
  for (const r of allRows) {
    const h = byId.get(r.id);
    if (h === undefined) continue;
    const subject = norm(r.title.split(/[(:;,—]/)[0]).slice(0, 24);
    if (subject === '') continue;
    const hay = norm(`${h.title} ${sectionText(h.html).slice(0, 600)}`);
    if (!hay.includes(subject)) fail(`5 §${r.id} title="${subject}" heading="${norm(h.title).slice(0, 40)}"`);
  }
  report(5, failures.length === before);
}

/* The declared withdrawal marks, and the reader's note's list. */
/**
 * Every mark in a section, as `{ by, id }`.
 *
 * **The id is what makes 6 and 7 count rather than merely ask.** Both read
 * only the `data-withdrawn-by` value until now, so they were set-membership
 * checks: "does §26 contain a mark saying 26" is satisfied by one mark
 * however many entries the list carries. §26 has two self-withdrawals, and
 * deleting either left both assertions green and the run at exit 0 —
 * confirmed by mutation twice, the second time with the deletion verified
 * against a pristine copy.
 *
 * `data-withdrawal` names WHICH withdrawal a mark is, so the two directions
 * pair entries with marks one-to-one instead of comparing two sets.
 */
const WITHDRAWN_IN = (html) =>
  [...html.matchAll(/<span data-withdrawn-by="([^"]+)"(?:\s+data-withdrawal="([^"]*)")?/g)].map((m) => ({
    by: m[1],
    id: m[2],
  }));

/** The list's `what` as an id. The script derives it; it is never typed twice. */
const WITHDRAWAL_ID = (what) => what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const listMatch = /<!--\s*reader-note-withdrawals\s*(\[[\s\S]*?\])\s*-->/.exec(src.L);
const withdrawals = listMatch === null ? [] : JSON.parse(listMatch[1]);

/* 6. Every listed withdrawal is marked where it happened — matched by id. */
{
  const before = failures.length;
  for (const [s, by, what] of withdrawals) {
    const id = WITHDRAWAL_ID(what);
    const h = byId.get(s);
    const marks = h === undefined ? [] : WITHDRAWN_IN(h.html);
    const hit = marks.filter((mk) => mk.by === by && mk.id === id);
    if (hit.length === 0) fail(`6 §${s}/§${by}#${id}`);
  }
  report(6, failures.length === before);
}

/* 7. Every marked withdrawal is listed — and carries an id to be listed by. */
{
  const before = failures.length;
  for (const h of ALL) {
    if (h.id.startsWith('W')) continue;
    for (const mk of WITHDRAWN_IN(h.html)) {
      /* An unidentified mark cannot be paired with an entry, so it fails on its own. */
      if (mk.id === undefined) { fail(`7 §${h.id} no-id`); continue; }
      if (!withdrawals.some(([s, b, what]) => s === h.id && b === mk.by && WITHDRAWAL_ID(what) === mk.id)) {
        fail(`7 §${h.id}#${mk.id}`);
      }
    }
  }
  report(7, failures.length === before);
}

/*
  7b. No two list entries share a (section, id), and no two marks do either.

  **Without this, the pairing is one-to-many again.** 6 asks whether at least
  one mark matches an entry and 7 whether at least one entry matches a mark,
  so two identical entries are both satisfied by a single mark — the same
  hole one level up, since the ids would be equal rather than the attributes
  absent. The spec's list has no uniqueness rule; this supplies it.
*/
{
  const before = failures.length;
  const seenEntries = new Map();
  for (const [s, , what] of withdrawals) {
    const key = `${s}#${WITHDRAWAL_ID(what)}`;
    seenEntries.set(key, (seenEntries.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seenEntries) if (n > 1) fail(`7b entry ${key} x${n}`);

  for (const h of ALL) {
    if (h.id.startsWith('W')) continue;
    const seen = new Map();
    for (const mk of WITHDRAWN_IN(h.html)) {
      if (mk.id === undefined) continue;
      const key = `${h.id}#${mk.id}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen) if (n > 1) fail(`7b mark ${key} x${n}`);
  }
  report('7b', failures.length === before);
}

/* 8. Figures in rows. */
{
  const beforeA = failures.length;
  /* Spec: strip section refs, step refs, artefact names — but never units. */
  const strip = (s) =>
    s
      .replace(/§W\.\d+(\.\d+)?/g, ' ')
      .replace(/§W\b/g, ' ')
      .replace(/§\d+(\.\d+)?/g, ' ')
      .replace(/steps? \d+/gi, ' ')
      .replace(/\b[A-Z]\d+[a-z]?\b/g, ' ')
      .replace(/\b\d{1,2}[a-z]\b/g, ' ');
  const FIGURE = /\d+(?:\.\d+)?%?(?:\s?[×x]\s?\d+(?:\.\d+)?)?/g;

  for (const r of governs) {
    const h = byId.get(r.id);
    if (h === undefined) continue;
    const hay = liveText(h.html).replace(/\s+/g, '');
    const missing = [...strip(`${r.title}|${r.pointer}`).matchAll(FIGURE)]
      .map((m) => m[0].replace(/\s+/g, ''))
      .filter((n) => !hay.includes(n));
    if (missing.length > 0) fail(`8a §${r.id} missing=${[...new Set(missing)].join(',')}`);
  }
  report('8a', failures.length === beforeA);

  const beforeB = failures.length;
  /* Spec: the governs table ONLY — the pointer table has no pointer column. */
  const ALLOW = new Set(['23', 'W.37']);
  for (const r of governs) {
    const stripped = strip(r.pointer);
    if (collapse(stripped) === '') {
      fail(`8b empty-column §${r.id}`);
      continue;
    }
    if (ALLOW.has(r.id)) continue;
    const tokens = stripped.match(/\d/g);
    if (tokens !== null) fail(`8b §${r.id} tokens=${collapse(stripped).slice(0, 60)}`);
  }
  report('8b', failures.length === beforeB);
}

for (const line of failures) console.log(line);
process.exit(failures.length > 0 ? 1 : 0);
