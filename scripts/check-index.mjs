#!/usr/bin/env node
/**
 * Index assertions — implemented from `scripts/ASSERTIONS-spec.md`, beside this script.
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
import { spawnSync } from 'node:child_process';
import { parseBullets, serialize, shippedComment } from './withdrawals.mjs';
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
  D: 'WITHDRAWALS.md',
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

const src = { H: read('H'), L: read('L'), S: read('S'), W: read('W'), D: read('D') };

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

/*
  0. The spec this script implements is the committed one. It lived in
  docs/design/ and was overwritten by three exports before it moved beside
  this script; a stray drop is now an exit code, not something a reader
  notices. Untracked or differing from HEAD both fail.
*/
{
  const before = failures.length;
  const spec = 'scripts/ASSERTIONS-spec.md';
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', spec], { encoding: 'utf8' });
  if (tracked.status !== 0) fail(`0 spec-untracked ${spec}`);
  else if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', spec], { encoding: 'utf8' }).status !== 0) fail(`0 spec-modified ${spec} differs from HEAD`);
  report(0, failures.length === before);
}

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
      if (n >= 12 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
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
 * The withdrawal list, from `WITHDRAWALS.md`'s machine-readable block.
 *
 * **Nothing in the targets marks a withdrawal.** A mark written into a target
 * did not survive its export: across eleven exports the targets carried no
 * withdrawal attribute and no `<span>` at all, so every "re-applied" mark set
 * was a rebuild that the next Design drop destroyed. Each entry now quotes its
 * withdrawal sentence verbatim and the quote is what is checked.
 */
const withdrawals = parseBullets(src.D);
/*
  The shipped comment is IGNORED as a source and compared as a claim: the
  bullets are what Claude authors and can read back; the comment is derived.
*/
const shipped = shippedComment(src.D);
const commentStale = shipped === null || collapse(shipped) !== collapse(serialize(withdrawals));

/** A section's text, normalised the one way the spec defines. */
const textOf = (id) => {
  const h = byId.get(id);
  return h === undefined ? null : collapse(stripTags(h.html));
};

/**
 * Spec: a withdrawal sentence "starts at a declared prefix that begins a
 * sentence inside a `<strong>` run outside a heading -- the run's first
 * text, or the text after a sentence end within the run -- and runs to its
 * own sentence end." (This comment quoted an older, stricter wording --
 * "as the first text of a `<strong>` run" -- for a round while the code
 * below implemented the spec's; the two are one reading now.)
 */
const WITHDRAWAL_PREFIX =
  /^(Withdrawn by §|Withdrawn in part by §|Withdrawn in whole by §|Withdrawn within §|Superseded by §|Superseded in part by §)/;

/* 6. Every entry's quote is in its section, exactly once, with no overlaps. */
{
  const before = failures.length;

  if (withdrawals.length === 0) fail('6 empty');

  const seenIds = new Map();
  for (const e of withdrawals) seenIds.set(e.id, (seenIds.get(e.id) ?? 0) + 1);
  for (const [id, n] of seenIds) if (n > 1) fail(`6 duplicate-id ${id}`);

  /* Where each quote sits, per section, so overlaps can be found. */
  const spans = new Map();
  for (const e of withdrawals) {
    const text = textOf(e.s);
    /* Three states: the section is in no input (absent), the quote is not in it (broken), or it is (working). */
    if (text === null) { fail(`6 ${e.id} section-absent`); continue; }
    const quote = collapse(e.quote);
    const first = text.indexOf(quote);
    if (first === -1) { fail(`6 ${e.id} quote-missing`); continue; }
    if (text.indexOf(quote, first + 1) !== -1) { fail(`6 ${e.id} quote-repeated`); continue; }
    if (!spans.has(e.s)) spans.set(e.s, []);
    spans.get(e.s).push({ id: e.id, start: first, end: first + quote.length });
  }

  /*
    **Overlapping quotes, which 6 would otherwise pass.** Two entries whose
    spans share a character each occur exactly once, so every check above is
    satisfied -- and the defect then surfaces in 8a as a removed count falling
    short of the entry count, reported against a section as though an entry
    were missing. Named where it happens instead.
  */
  for (const [s, list] of spans) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start < sorted[i - 1].end) {
        fail(`6 §${s} quote-overlap ${sorted[i - 1].id},${sorted[i].id}`);
      }
    }
  }

  if (commentStale) fail('6 comment-stale (run scripts/derive-withdrawals.mjs)');

  console.log(`     6: ${withdrawals.length} entries checked`);
  report(6, failures.length === before);
}

/* 7. Every declared withdrawal sentence is an entry, one to one. */
{
  const before = failures.length;

  /*
    Spec: a declared sentence "starts at a declared prefix, as the first text
    of a <strong> run outside a heading, and runs to its own sentence end --
    the first `. `, `? ` or `! ` after the prefix, or the end of its
    paragraph. A run of bold text is not a sentence boundary."

    So the paragraph's plain text is what is sliced, and the strong run only
    says where a sentence STARTS. Matching is on the whole sentence, one to
    one -- a 40-character slice once let 7 pass with an entry deleted.
  */
  const sentences = [];
  for (const h of ALL) {
    if (h.id.startsWith('W')) continue;
    for (const para of h.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const inner = para[1];
      const plain = collapse(stripTags(inner));
      for (const run of inner.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/g)) {
        const runText = collapse(stripTags(run[1]));
        /*
          **A prefix that BEGINS A SENTENCE inside the run, not only the
          run's first text.** Design flattened its nested bold by merging
          runs, so `33/three-line-cap`'s sentence now sits mid-run after
          "…is within the supply." -- with an unchanged quote that equals
          its sentence exactly. Bold is not a sentence boundary in either
          direction: the sentence may run past </strong>, and a run may hold
          more than one sentence.
        */
        const starts = [];
        if (WITHDRAWAL_PREFIX.test(runText)) starts.push(0);
        for (const b of runText.matchAll(/[.!?] (?=\S)/g)) {
          if (WITHDRAWAL_PREFIX.test(runText.slice(b.index + 2))) starts.push(b.index + 2);
        }
        for (const at of starts) {
          const head = runText.slice(at, at + Math.min(60, runText.length - at));
          const start = plain.indexOf(head);
          if (start === -1) continue;
          const rest = plain.slice(start);
          const end = /[.!?](?=\s|$)/.exec(rest);
          const sentence = end === null ? rest : rest.slice(0, end.index + 1);
          sentences.push({ section: h.id, sentence });
        }
      }
    }
  }
  if (sentences.length === 0) fail('7 empty');

  /* One to one, both directions. */
  const byKey = new Map();
  for (const s of sentences) {
    const key = `${s.section}\u0000${s.sentence}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  for (const [key, n] of byKey) {
    if (n > 1) { const [sec, sent] = key.split('\u0000'); fail(`7 §${sec} quoted-twice "${sent.slice(0, 60)}"`); }
  }
  for (const s of sentences) {
    const matches = withdrawals.filter((e) => e.s === s.section && collapse(e.quote) === s.sentence);
    if (matches.length === 0) fail(`7 §${s.section} unquoted "${s.sentence.slice(0, 60)}"`);
  }
  for (const e of withdrawals) {
    if (!WITHDRAWAL_PREFIX.test(collapse(e.quote))) continue; /* outside 7 by design; 6 checks it */
    const n = sentences.filter((s) => s.section === e.s && s.sentence === collapse(e.quote)).length;
    if (n === 0) fail(`7 ${e.id} matches-none`);
    else if (n > 1) fail(`7 ${e.id} matches-many ${n}`);
  }

  console.log(`     7: ${sentences.length} declared withdrawal sentences against ${withdrawals.length} entries`);
  report(7, failures.length === before);
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

  /*
    **Live text is the section's text with every entry's quote removed**, and
    the removal is COUNTED. Spec: "Assert, per section, that the number of
    quotes removed equals the number of entries for it, so a section with
    nothing removed is known to have nothing listed rather than assumed."

    That count is the fix for a vacuous pass. Before the quote scheme, 8a read
    a section with zero marks as wholly live and passed on every row; nothing
    in its output distinguished "this section has no withdrawals" from "the
    marking was destroyed".
  */
  /*
    **The denominator is what 8a can REACH, not the list's length.**

    8a iterates governs rows, and §1-§10 have pointer rows instead -- so the
    settled file's eight entries are permanently out of its scope. Printing
    them in the denominator showed a clean run as 18 against 26, a standing
    gap of eight that says nothing and trains a reader to ignore the number.
    The comparison that carries information is removed against in-scope.
  */
  const inScopeIds = new Set(governs.map((r) => r.id));
  const inScope = withdrawals.filter((e) => inScopeIds.has(e.s)).length;
  let removedTotal = 0;
  const live = (id, html) => {
    let text = collapse(stripTags(html));
    const entries = withdrawals.filter((e) => e.s === id);
    let removed = 0;
    for (const e of entries) {
      const quote = collapse(e.quote);
      if (text.includes(quote)) {
        text = text.replace(quote, ' ');
        removed += 1;
      }
    }
    if (removed !== entries.length) {
      fail(`8a §${id} removed=${removed} entries=${entries.length}`);
    }
    removedTotal += removed;
    return collapse(text);
  };

  for (const r of governs) {
    const h = byId.get(r.id);
    if (h === undefined) continue;
    const hay = live(r.id, h.html).replace(/\s+/g, '');
    const missing = [...strip(`${r.title}|${r.pointer}`).matchAll(FIGURE)]
      .map((m) => m[0].replace(/\s+/g, ''))
      .filter((n) => !hay.includes(n));
    if (missing.length > 0) fail(`8a §${r.id} missing=${[...new Set(missing)].join(',')}`);
  }
  console.log(
    `     8a: ${governs.length} rows, ${removedTotal} of ${inScope} in-scope quotes removed` +
      ` (${withdrawals.length - inScope} more are in the settled file, which has no governs rows)`,
  );
  if (removedTotal !== inScope) fail(`8a removed=${removedTotal} in-scope=${inScope}`);
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
