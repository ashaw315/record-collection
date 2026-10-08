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
    .replace(/\s+/g, ' ');
  const out = [];
  for (const block of text.split('␞')) {
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
  return { removed, reworded };
}

/** The numbers of the build order's steps, in the order they stand. */
export function stepsOf(markdown) {
  return [...markdown.matchAll(/^(\d{1,3})\. /gm)].map((m) => Number(m[1]));
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
  for (const file of FILES) {
    const path = `${DESIGN}/${file}`;
    const before = at(from, path);
    const after = to === undefined ? (existsSync(path) ? readFileSync(path, 'utf8') : null) : at(to, path);
    if (before === null && after === null) continue;
    if (before === null) { console.log(`\n${file}: new since ${from}; nothing to have been removed.`); continue; }
    if (after === null) { console.log(`\n${file}: GONE. It is in ${from} and not in ${to ?? 'the working tree'}.`); outright += 1; continue; }
    const { removed, reworded } = diffProse(before, after);
    const lostSteps = file.startsWith('HANDOFF') ? stepsOf(before).filter((n) => !stepsOf(after).includes(n)) : [];
    if (removed.length === 0 && reworded.length === 0 && lostSteps.length === 0) continue;
    console.log(`\n${file}: ${removed.length} removed, ${reworded.length} reworded${lostSteps.length ? `, steps gone: ${lostSteps.join(', ')}` : ''}`);
    for (const sentence of removed) console.log(`  REMOVED  ${sentence}`);
    for (const pair of reworded) console.log(`  was      ${pair.was}\n  now      ${pair.now}`);
    outright += removed.length + lostSteps.length;
  }
  console.log(`\n${outright === 0 ? 'Nothing was removed outright.' : `${outright} removed outright (sentences and steps).`} Compared ${to ?? 'the working tree'} with ${from}.`);
  return strict && outright > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
