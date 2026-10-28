#!/usr/bin/env node
/**
 * **What a Design export took away.**
 *
 *     node scripts/export-diff.mjs                # the working tree against HEAD
 *     node scripts/export-diff.mjs --from A --to B # one commit against another
 *
 * Design's exports replace the targets and the handoff wholesale. The index
 * (`check-index.mjs`) checks quotes it already knows about, so a paragraph
 * dropped with no withdrawal entry vanishes without a trace. This compares
 * each design file with its last committed text and prints every sentence
 * that is gone, every sentence that was reworded as a pair, and every build
 * step whose number is no longer in the handoff.
 *
 * It reports and exits zero. Whether a removal is right is read by whoever
 * takes the drop; with `--strict` it exits one if anything was removed
 * outright, for a caller that wants to stop on it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', sect: '§', middot: '·' };

/** A file's prose as sentences: markup, styles and scripts out, entities decoded, whitespace collapsed. */
export function sentencesOf(source) {
  const text = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    /* A block's end is a sentence's end even where its text has no full stop: headings, labels, table cells. */
    .replace(/<\/(p|div|h[1-6]|li|td|th|tr|blockquote|section)>/gi, ' ␞ ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    /* A blank line is Markdown's block end. The handoff's quoted rulings end without a full stop, so without this a quote swallows the paragraph after it. */
    .replace(/\n[ \t]*\n/g, ' ␞ ')
    /*
      Markdown's markup is not text (13 Oct, the review surface): a quote line or a bullet starting a line is a
      block of its own, its marker gone, and bold's `**` is stripped, because a `**` between a stop and the next
      capital stopped the split there and a lead read as one sentence with what followed it.
    */
    .replace(/\n[ \t]*(?:>|[-*])[ \t]+/g, ' ␞ ')
    .replace(/^[ \t]*(?:>|[-*])[ \t]+/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ');
  const out = [];
  for (const raw of text.split('␞')) {
    /* A bullet or quote after a blank line keeps its marker to here, where the block starts. */
    const block = raw.replace(/^\s*(?:>|[-*])\s+/, '');
    /* A sentence ends at . ! or ? followed by a space and a capital or a quote; "126.5", "§W.24" and "e.g. two" do not end one. */
    let number = '';
    for (const part of block.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘(§*`\[])/)) {
      const sentence = part.trim();
      if (sentence === '') continue;
      /* "97." is a step's number and not a sentence: it stays with the sentence it numbers. */
      if (/^\d+\.$/.test(sentence)) { number = `${sentence} `; continue; }
      out.push(number + sentence);
      number = '';
    }
    if (number !== '') out.push(number.trim());
  }
  return out;
}

/* Words, with a full stop kept only inside one ("126.5", "w.24") and not at its end, so "once." and "once" are one word. */
const words = (sentence) => new Set(sentence.toLowerCase().replace(/[^\p{L}\p{N}\s.§]/gu, ' ').split(/\s+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w.length > 1));
const alike = (a, b) => {
  const [x, y] = [words(a), words(b)];
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.max(1, x.size + y.size - shared);
};

/**
 * What `after` no longer says that `before` said. A sentence gone is
 * `removed`; one whose nearest new sentence shares most of its words is
 * `reworded`, paired with what it became. Sentences that only moved, and
 * markup that only changed, are not reported. Compared as multisets, so a
 * sentence that stood twice and stands once is removed once.
 */
export function diffProse(before, after) {
  const count = (list) => list.reduce((map, s) => map.set(s, (map.get(s) ?? 0) + 1), new Map());
  const [was, now] = [count(sentencesOf(before)), count(sentencesOf(after))];
  const gone = [];
  for (const [sentence, n] of was) for (let i = now.get(sentence) ?? 0; i < n; i += 1) gone.push(sentence);
  const arrived = [];
  for (const [sentence, n] of now) for (let i = was.get(sentence) ?? 0; i < n; i += 1) arrived.push(sentence);
  const removed = [];
  const reworded = [];
  for (const sentence of gone) {
    let best = -1;
    let score = 0;
    arrived.forEach((candidate, index) => {
      const s = alike(sentence, candidate);
      if (s > score) { score = s; best = index; }
    });
    /* More than half its words in common: the same sentence, edited. */
    if (best >= 0 && score >= 0.5) reworded.push({ was: sentence, now: arrived.splice(best, 1)[0] });
    else removed.push(sentence);
  }
  /*
    What is left of `arrived` after the rewordings are paired is what the
    drop ADDED: the other direction (13 Oct). Design's own check confirms
    that what it is about to report is in the file; it cannot see a ruling
    in the file it did not report, or one reported that is not there. The
    added list is read against Design's message on every intake.
  */
  return { removed, reworded, added: arrived };
}

/**
 * A file as blocks, each under the heading and the bold lead above it. A
 * heading is a target's uppercase-styled paragraph or a Markdown `#` line; a
 * lead is a block that opens with `<strong>` or `**`. A block with neither
 * inherits the lead before it.
 */
export function blocksOf(source) {
  const isHtml = /<p\b/i.test(source);
  const raw = isHtml ? source.split(/(?<=<\/p>)/i) : source.split(/\n[ \t]*\n/);
  const out = [];
  let heading = '';
  let lead = '';
  for (const block of raw) {
    const text = block.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    const headingMatch = isHtml ? /<p[^>]*text-transform:\s*uppercase[^>]*>([\s\S]*?)<\/p>/i.exec(block) : /^\s*#{1,6}\s+(.+)$/m.exec(block);
    if (headingMatch !== null) { heading = headingMatch[1].replace(/<[^>]*>/g, '').trim(); lead = ''; continue; }
    const leadMatch = isHtml ? /^\s*<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>/i.exec(block) : /^\s*(?:-\s*)?\*\*(.+?)\*\*/.exec(block);
    if (leadMatch !== null) lead = leadMatch[1].replace(/<[^>]*>/g, '').trim();
    out.push({ section: [heading, lead].filter((part) => part !== '').join(' › '), block });
  }
  return out;
}

/**
 * The review surface for a drop (13 Oct): what `after` says that `before`
 * did not, grouped under the heading and lead each sentence stands beneath,
 * in file order. A section with nothing added is left out. The sentences
 * are `diffProse`'s `added`, so a rewording is not among them.
 */
export function addedBySection(before, after) {
  const pending = new Map();
  for (const sentence of diffProse(before, after).added) pending.set(sentence, (pending.get(sentence) ?? 0) + 1);
  const out = [];
  for (const { section, block } of blocksOf(after)) {
    const here = [];
    for (const sentence of sentencesOf(block)) {
      const n = pending.get(sentence) ?? 0;
      if (n === 0) continue;
      here.push(sentence);
      if (n === 1) pending.delete(sentence); else pending.set(sentence, n - 1);
    }
    if (here.length === 0) continue;
    const last = out[out.length - 1];
    if (last !== undefined && last.section === section) last.added.push(...here);
    else out.push({ section, added: here });
  }
  return out;
}

/** The numbers of the build order's steps, in the order they stand. */
export function stepsOf(markdown) {
  return [...markdown.matchAll(/^(\d{1,3})\. /gm)].map((m) => Number(m[1]));
}

/**
 * A withdrawal sentence that arrives without its entries' file (16 Oct).
 * Twice in one day a file did not cross between Design's tree and the
 * repo's, in opposite directions, and each showed only as an index failure
 * days later that read as Design's fault: the index checks entries against
 * sentences in one tree and cannot see that the tree is missing a whole
 * input. This names the state as it arises: a save adding a sentence in
 * withdrawal form (the index's declared prefixes) to a target while
 * WITHDRAWALS.md is unchanged against the same base. It reports; the index
 * still judges. `arrivals` is `[{ file, added }]` for the files other than
 * WITHDRAWALS.md; `withdrawalsChanged` is whether that file differed at all.
 */
const WITHDRAWAL_FORM = /^(Withdrawn by §|Withdrawn in part by §|Withdrawn in whole by §|Withdrawn within §|Superseded by §|Superseded in part by §)/;
export function entriesNotCrossed(arrivals, withdrawalsChanged) {
  if (withdrawalsChanged) return null;
  const n = arrivals.flatMap((a) => a.added).filter((sentence) => WITHDRAWAL_FORM.test(sentence)).length;
  if (n === 0) return null;
  return `${n} withdrawal sentence${n === 1 ? '' : 's'} arrived and WITHDRAWALS.md did not change: the entries' file has not crossed, or the entries were not written.`;
}

const DESIGN = 'docs/design';
const FILES = ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'Record Modal - build target.dc.html', 'Table and Grid - build target.dc.html', 'WITHDRAWALS.md'];

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  const from = arg('--from') ?? 'HEAD';
  const to = arg('--to');
  const strict = argv.includes('--strict');
  const at = (rev, path) => { try { return execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  let outright = 0;
  let arrivals = 0;
  const arrivalsByFile = [];
  let withdrawalsChanged = false;
  for (const file of FILES) {
    const path = `${DESIGN}/${file}`;
    const before = at(from, path);
    const after = to === undefined ? (existsSync(path) ? readFileSync(path, 'utf8') : null) : at(to, path);
    if (before === null && after === null) continue;
    if (before === null) { console.log(`\n${file}: new since ${from}; nothing to have been removed.`); continue; }
    if (after === null) { console.log(`\n${file}: GONE. It is in ${from} and not in ${to ?? 'the working tree'}.`); outright += 1; continue; }
    const { removed, reworded, added } = diffProse(before, after);
    if (file === 'WITHDRAWALS.md') withdrawalsChanged = before !== after;
    else arrivalsByFile.push({ file, added });
    const lostSteps = file.startsWith('HANDOFF') ? stepsOf(before).filter((n) => !stepsOf(after).includes(n)) : [];
    if (removed.length === 0 && reworded.length === 0 && added.length === 0 && lostSteps.length === 0) continue;
    console.log(`\n${file}: ${removed.length} removed, ${reworded.length} reworded, ${added.length} added${lostSteps.length ? `, steps gone: ${lostSteps.join(', ')}` : ''}`);
    for (const sentence of removed) console.log(`  REMOVED  ${sentence}`);
    for (const pair of reworded) console.log(`  was      ${pair.was}\n  now      ${pair.now}`);
    /*
      Read against Design's message: a sentence here that the message does not
      claim, or a claim with no sentence here, is the report-versus-file
      defect. Grouped under the heading and lead each stands beneath, which is
      the review surface the intake report carries in full (13 Oct).
    */
    for (const group of addedBySection(before, after)) {
      console.log(`  [${group.section || 'no heading'}]`);
      for (const sentence of group.added) console.log(`  ADDED    ${sentence}`);
    }
    outright += removed.length + lostSteps.length;
    arrivals += added.length;
  }
  const notCrossed = entriesNotCrossed(arrivalsByFile, withdrawalsChanged);
  if (notCrossed !== null) console.log(`\n${notCrossed}`);
  console.log(`\n${outright === 0 ? 'Nothing was removed outright.' : `${outright} removed outright (sentences and steps).`} ${arrivals} sentence${arrivals === 1 ? '' : 's'} added, to be read against what Design said the drop holds. Compared ${to ?? 'the working tree'} with ${from}.`);
  return strict && outright > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
