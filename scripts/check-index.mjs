#!/usr/bin/env node
/**
 * Index assertions — implemented from `scripts/ASSERTIONS-spec.md`, beside this script.
 *
 * **The script's exit code is the result.** A report written by whoever
 * edited the index is not. Run it in CI and before any handoff is exported.
 *
 * Built from the spec rather than from the handoff or from the repo's own
 * earlier index test: the spec records, for most of its ten assertions, the
 * defect that motivated it and the weaker version that passed on it. Those
 * notes are the reason each check has the shape it has, and are reproduced
 * at the assertions they belong to.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseBullets, serialize, shippedComment, unenteredWithdrawals, withdrawalSentencesIn } from './withdrawals.mjs';
import { doneStepsAbsent, isDone, parseSteps, stepSequence } from './build-order.mjs';
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

/* `INDEX_DESIGN_DIR` points a run at a staged copy of the inputs, which is how the tests break a tree on purpose. */
const DESIGN = process.env.INDEX_DESIGN_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'design');
const FILES = {
  H: 'HANDOFF-wall-and-pull.md',
  L: 'Record Detail 8a - build target.dc.html',
  S: 'Record Detail 8a - settled 1-10.dc.html',
  W: 'Wall and Pull - build target.dc.html',
  G: 'Nav - build target.dc.html',
  D: 'WITHDRAWALS.md',
};

/*
  **Every id gets a line, even when the run stops.** The ids in run order;
  each is PASS, FAIL or, if the run stopped before it, ABSENT. On 2 Oct the
  withdrawal parser threw after 5, and the run ended in five PASS lines and a
  stack trace: to someone skimming for FAIL, a clean run. An id with no
  result is now named as one, and the last line counts all three.
*/
const IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9'];
const results = new Map();
function stop(reason) {
  console.log(`RUN STOPPED: ${reason}`);
  for (const id of IDS) if (!results.has(id)) console.log(`ABSENT ${id} (the run stopped before it)`);
  summarise();
  process.exit(2);
}
function summarise() {
  const n = (v) => [...results.values()].filter((r) => r === v).length;
  const absent = IDS.length - results.size;
  console.log(`RESULT: ${n('PASS')} PASS, ${n('FAIL')} FAIL, ${absent} ABSENT of ${IDS.length}${absent > 0 ? ' -- INCOMPLETE' : ''}`);
}
process.on('uncaughtException', (error) => stop(error instanceof Error ? error.message.split('\n').join(' / ') : String(error)));

/** Spec: decode these two entities before any text comparison. */
const decode = decodeEntities;

const read = (key) => {
  const path = join(DESIGN, FILES[key]);
  if (!existsSync(path)) {
    stop(`missing input ${key}: ${FILES[key]}`);
  }
  return decode(readFileSync(path, 'utf8'));
};

const src = { H: read('H'), L: read('L'), S: read('S'), W: read('W'), G: read('G'), D: read('D') };

/**
 * Headings of one target file — delegated to `design-target-parser.mjs`, the
 * ONE implementation of this pattern. A lookalike that matched the eyebrow
 * styling without requiring an id and " · " truncated §26 at a figure
 * caption; see that module's header.
 */
const headings = (key) => sections(src[key], { prefixW: key === 'W' });

const ALL = [...headings('L'), ...headings('S'), ...headings('W'), ...headings('G')];
const byId = new Map(ALL.map((h) => [h.id, h]));

/*
  Spec: live text is a section's text with every entry's quote for that
  section removed (8a builds it). Nothing in a target marks a withdrawal;
  the list's quotes are the only record. The parsing helpers come from the
  shared parser.
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
  **Two kinds of offender, and only one is fatal.** Assertions 0 to 8b are
  PASS or FAIL, and every offender they print fails the run. Assertion 9 is
  report-only: it prints its offenders and still reports PASS, failing only
  with --strict-reverse. So a run with no FAIL line is not a run with no
  offenders: read 9's count and its lines. (Until c9efd90 every assertion
  was fatal, and this comment said so after it stopped being true.)

  **Nothing here guesses.** The `--candidates` bootstrap, an eleven-keyword
  regex over every sentence that missed "reversed", is deleted, and with it
  the PROVISIONAL state it existed for. Withdrawals are found by the six
  declared prefixes and by the list's quotes, never by keywords.
*/
const report = (n, ok) => {
  results.set(String(n), ok ? 'PASS' : 'FAIL');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`);
};

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

/*
  3. Steps run 0 to N with no gaps and no duplicates, none follows the
  closing paragraph, and no step the committed order marked done is absent.

  **The direction nobody was looking (1 Oct).** Design's exports replace H
  wholesale, so a step inserted between two exports is overwritten without a
  trace; step 71 went that way twice. The first version of this check
  compared each number with its position, which fails on such a tree but
  names the step after the gap (`gap-at 72`, then 73), and could not tell a
  duplicate from a gap. The absent number is what a reader restores, so it
  is what is named. The done marks are read from HEAD's copy of H, because
  an export that drops a step drops its mark with it: the tree cannot say
  what it lost, and the committed order can.
*/
{
  const before = failures.length;
  const steps = parseSteps(orderBlock);
  if (steps.length === 0) fail('3 empty');
  const { missing, duplicates } = stepSequence(steps);
  for (const n of missing) fail(`3 missing ${n}`);
  for (const n of duplicates) fail(`3 duplicate ${n}`);

  const lines = orderBlock.split('\n');
  const closeAt = lines.findIndex((l) => l.includes('Every row in the table above'));
  if (closeAt >= 0) for (const s of steps) if (s.line > closeAt) fail(`3 step-after-close ${s.n}`);

  /* Three states: HEAD unreadable (broken, named), no marks (counted as zero, which the suite refuses), marks present (checked). */
  const committed = spawnSync('git', ['show', `HEAD:docs/design/${FILES.H}`], { encoding: 'utf8' });
  let doneInHead = 0;
  if (committed.status !== 0) {
    fail(`3 head-unreadable ${FILES.H}`);
  } else {
    const previous = parseSteps(between(decode(committed.stdout), '## Build order', '## Maintaining'));
    doneInHead = previous.filter((s) => isDone(s.text)).length;
    for (const s of doneStepsAbsent(previous, steps)) fail(`3 done-absent ${s.n} "${s.text.slice(0, 80)}"`);
  }
  console.log(`     3: ${steps.length} steps in the tree, ${doneInHead} marked done in HEAD`);
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
  /*
    **§G, both directions (2 Oct).** Before the nav target was an input, 4
    recognised only W and bare-number shapes, so "Superseded in part by
    §G.8" in §24 was not a reference to it at all, and 4 passed on it while
    the withdrawal parser, ten lines later, refused the same id by line
    number. Every §G.N in any target names a heading in G; G's own W and
    bare-number references follow the same rules as W's.
  */
  for (const key of ['L', 'S', 'G']) {
    for (const m of bodyOf(key).matchAll(/§(W\.\d+(?:\.\d+)?)/g)) {
      if (!has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['L', 'S', 'W', 'G']) {
    for (const m of bodyOf(key).matchAll(/§(G\.\d+(?:\.\d+)?)/g)) {
      if (!has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['L', 'W', 'G']) {
    for (const m of bodyOf(key).matchAll(/§(\d{1,2}(?:\.\d+)?)/g)) {
      const n = Number(m[1].split('.')[0]);
      if (n >= 1 && n <= 10 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['S', 'W', 'G']) {
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

/* The withdrawal list, read from WITHDRAWALS.md's bullets. */
/**
 * The withdrawal list, parsed from `WITHDRAWALS.md`'s bulleted entries. The
 * machine-readable comment is derived from them and is never read as a
 * source; 6 compares it as a claim (below).
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
 * The six declared prefixes. Spec: a withdrawal sentence "starts at a
 * declared prefix wherever it occurs in a paragraph outside a heading, and
 * runs to its own sentence end." 7 searches for them anywhere in a
 * paragraph's plain text; the anchor here is for testing an entry's quote,
 * which must itself begin with one.
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
    Spec: a declared sentence "starts at a declared prefix wherever it
    occurs in a paragraph outside a heading, and runs to its own sentence
    end": the first `. `, `? ` or `! ` after the prefix, or the end of its
    paragraph. Bold is not a sentence boundary in either direction.

    So the paragraph's plain text is what is sliced, and a bold run plays no
    part in finding a sentence (see the comment in the loop below for why it
    once did). Matching is on the whole sentence, one to one -- a
    40-character slice once let 7 pass with an entry deleted.
  */
  const sentences = [];
  /* L, S and W alike: the wall had four declared withdrawals and, for as long as this loop skipped W, nothing checked them. */
  for (const h of ALL) {
    for (const para of h.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const inner = para[1];
      const plain = collapse(stripTags(inner));
      /*
        **Plain text, from a prefix wherever it occurs** -- inside a bold
        run or not, as 9 reads. The bold run was the convention for a
        reader's eye and, for a round, the detection mechanism too:
        `28/air-side-at-960` sat in a mono caption, which is already set
        apart and takes no bold, and 7 could not see it while 9 (which reads
        plain text) could. Design ruled the convention stays for prose and 7
        widens to read as 9 does. Not "a prefix that begins a sentence":
        `7/title-measure-fixed` and `45/measure-grows` follow a semicolon
        and a colon, which the run start used to forgive, and 9's reading
        forgives the same way. What neither forgives is a sentence whose
        full stop is not followed by space: it runs on into its host.
      */
      const starts = [];
      for (const m of plain.matchAll(new RegExp(WITHDRAWAL_PREFIX.source.replace(/^\^/, ''), 'g'))) starts.push(m.index);
      for (const at of starts) {
        const rest = plain.slice(at);
        const end = /[.!?](?=\s|$)/.exec(rest);
        const sentence = end === null ? rest : rest.slice(0, end.index + 1);
        sentences.push({ section: h.id, sentence });
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
    if (!WITHDRAWAL_PREFIX.test(collapse(e.quote))) {
      /*
        Spec: an undeclared entry is legal for one case only -- a superseded
        first wording of the SAME section (`s` equals `by`); 6 checks its
        quote and 7 skips it. Any other undeclared withdrawal is a defect in
        the prose: a ruling withdrawn without a declared sentence.
      */
      if (e.s !== e.by) fail(`7 ${e.id} undeclared`);
      continue;
    }
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
      /* §G too (3 Oct): left unstripped, "§G.8" read as a figure 8 in §G.7's pointer. */
      .replace(/§G\.\d+(\.\d+)?/g, ' ')
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

/*
  9 -- the reverse direction (1 Oct). 6 checks every entry's quote is in its
  section. When 9 was written, 7 found declared sentences only where they
  started a <strong> run, so a sentence in withdrawal form anywhere else
  passed with no entry filed, which is how §28 and §33 each carried one
  narrowing the Price history solo. 7 has read plain text since 328d497, as
  this does; 9 differs in reading every section of L, S and W for sentences
  with NO entry, where 7 pairs sentences and entries one to one. This scans
  every section's plain text for the phrasings the file uses, wherever they
  sit (a phrasing inside quotation marks is an example, not a declaration),
  and names each sentence no entry's quote matches. REPORT-ONLY: it fails
  the run only with --strict-reverse. The spec numbers it 9 (ab837cc).
*/
{
  const strict = process.argv.includes('--strict-reverse');
  const before = failures.length;
  const unentered = [];
  for (const h of ALL) {
    const found = withdrawalSentencesIn(collapse(stripTags(h.html)));
    for (const s of unenteredWithdrawals(found, withdrawals)) unentered.push(`9 §${h.id} unentered "${s.slice(0, 160)}"`);
  }
  console.log(`     9: ${unentered.length} withdrawal sentence${unentered.length === 1 ? '' : 's'} with no entry, across ${ALL.length} sections${strict ? '' : ' (report only; --strict-reverse to fail on them)'}`);
  for (const line of unentered) console.log(line);
  if (strict) for (const line of unentered) fail(line);
  report(9, strict ? failures.length === before : true);
}

for (const line of failures) console.log(line);
summarise();
process.exit(failures.length > 0 || results.size < IDS.length ? 1 : 0);
