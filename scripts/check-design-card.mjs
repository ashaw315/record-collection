#!/usr/bin/env node
/**
 * **The checks run by hand on every Design card, as one report (Q20, the
 * coordinator, 5 Nov).** Written ad hoc three times in one week before this:
 * strong-tag open/close balance and nesting depth; doctype and closing
 * `</html>`; withdrawal sentences counted, and any that stands twice; every
 * quote in the change file matched character for character against the
 * card, curly apostrophes and quote marks included, since straightening them
 * is how a mismatch hides; and the bold-sentence set diff between the
 * previous card and the new one.
 *
 *     node scripts/check-design-card.mjs <card.dc.html> [--change <file.md>] [--previous <card.dc.html | refs/drops/...>]
 *
 * Without `--previous`, the newest drop under refs/drops that holds the same
 * file is the previous card (scripts/drop-ref.mjs keeps them).
 *
 * **A report, never a refusal.** Its exit is 0 whatever it finds; a reading
 * aid for the intake, not an assertion, and not in ASSERTIONS-spec. The
 * assertions over a card live in check-index.mjs. The foot says so.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withdrawalSentencesIn } from './withdrawals.mjs';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', sect: '§' };

const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The card's prose as one string: comments, scripts, styles and svg out, tags stripped, entities decoded, whitespace collapsed; the marks as written. */
export function plainText(html) {
  return collapse(decode(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|td|th|tr|blockquote|section)>/gi, ' ')
    .replace(/<[^>]*>/g, '')));
}

/** Opens and closes of `<strong>`, the deepest nesting, and the lines where a strong opened inside another. */
export function strongBalance(html) {
  let opens = 0; let closes = 0; let depth = 0; let maxDepth = 0;
  const overDepthAt = [];
  for (const m of html.matchAll(/<(\/?)strong\b[^>]*>/gi)) {
    if (m[1] === '/') { closes += 1; depth = Math.max(0, depth - 1); continue; }
    opens += 1; depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (depth > 1) overDepthAt.push(lineOf(html, m.index));
  }
  return { opens, closes, maxDepth, overDepthAt };
}

/** A doctype at the top, in either case, and `</html>` as the last thing in the file. */
export function documentShape(html) {
  return { doctype: /^﻿?\s*<!doctype\s+html/i.test(html), closingHtml: /<\/html>\s*$/i.test(html) };
}

/** The declared forms (withdrawals.mjs PHRASING), each as the opening of a declared sentence; the order is the printed order. */
const FORMS = [
  ['within', /^Withdrawn within §/],
  ['by', /^Withdrawn by §/],
  ['inPartBy', /^Withdrawn in part by §/],
  ['inWholeBy', /^Withdrawn in whole by §/],
  ['supersededBy', /^Superseded by §/],
  ['supersededInPartBy', /^Superseded in part by §/],
];
const FORM_LABELS = { within: 'within', by: 'by', inPartBy: 'in part by', inWholeBy: 'in whole by', supersededBy: 'superseded by', supersededInPartBy: 'superseded in part by' };

/**
 * The declared withdrawal sentences (withdrawals.mjs, which leaves a quoted
 * example out), those standing more than once, and the count by form from the
 * SAME sentences, so the forms sum to the count: on 6 Nov a total recalled
 * from one statement and a breakdown grepped in another gave 87 against 88,
 * and nothing in either could say which was wrong.
 */
export function withdrawalReport(html) {
  const sentences = withdrawalSentencesIn(plainText(html));
  const seen = new Map();
  const byForm = Object.fromEntries(FORMS.map(([name]) => [name, 0]));
  for (const s of sentences) {
    seen.set(s, (seen.get(s) ?? 0) + 1);
    const form = FORMS.find(([, re]) => re.test(s));
    if (form !== undefined) byForm[form[0]] += 1;
  }
  return { count: sentences.length, duplicates: [...seen].filter(([, n]) => n > 1).map(([s]) => s), byForm };
}

export function byFormLine(byForm) {
  return FORMS.map(([name]) => `${FORM_LABELS[name]} ${byForm[name]}`).join(', ');
}

/**
 * The change file's quotes, in file order: text in curly or straight quotation
 * marks (`quotation`), and each blockquote (`ruling`), the sentence the card is
 * meant to carry verbatim.
 */
export function quotesOf(markdown) {
  const found = [];
  for (const m of markdown.matchAll(/“([^”]+)”|"([^"\n]+)"/g)) found.push({ at: m.index, kind: 'quotation', text: collapse(m[1] ?? m[2]) });
  for (const m of markdown.matchAll(/(?:^|\n)((?:[ \t]*>[ \t]?[^\n]*\n?)+)/g)) {
    const text = collapse(m[1].split('\n').map((line) => line.replace(/^[ \t]*>[ \t]?/, '')).join(' '));
    if (text !== '') found.push({ at: m.index, kind: 'ruling', text });
  }
  return found.sort((a, b) => a.at - b.at).map(({ kind, text }) => ({ kind, text }));
}

const straighten = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/** The quotes the card does not carry character for character; `onlyByMarks` when straightening every apostrophe and quote mark on both sides would have matched. */
export function unmatchedQuotes(markdown, cardHtml) {
  const plain = plainText(cardHtml);
  const loose = straighten(plain);
  return quotesOf(markdown)
    .filter(({ text }) => !plain.includes(text))
    .map(({ kind, text }) => ({ kind, text, onlyByMarks: loose.includes(straighten(text)) }));
}

/** Every strong run's text, decoded and collapsed, in order. */
export function boldSentences(html) {
  return [...html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)].map((m) => collapse(decode(m[1].replace(/<[^>]*>/g, '')))).filter((s) => s !== '');
}

/** Bold sentences `after` has that `before` had not, and the reverse; a sentence that only moved is in neither. */
export function boldDiff(before, after) {
  const [was, now] = [new Set(boldSentences(before)), new Set(boldSentences(after))];
  return { added: [...now].filter((s) => !was.has(s)), removed: [...was].filter((s) => !now.has(s)) };
}

/** The newest drop under refs/drops that holds `path`, as { ref, text }, or null. */
function previousFromDrops(path) {
  let refs = [];
  try { refs = execFileSync('git', ['for-each-ref', '--sort=-refname', '--format=%(refname)', 'refs/drops'], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return null; }
  for (const ref of refs) {
    try { return { ref, text: execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }; } catch { /* not in this drop */ }
  }
  return null;
}

function report(args) {
  const [card, ...rest] = args;
  if (card === undefined || !existsSync(card)) {
    process.stderr.write('usage: node scripts/check-design-card.mjs <card.dc.html> [--change <file.md>] [--previous <card.dc.html | refs/drops/...>]\n');
    return 2;
  }
  const opt = (name) => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
  const html = readFileSync(card, 'utf8');
  const out = [];
  out.push(`check-design-card: ${card}`);

  const s = strongBalance(html);
  out.push(`strong: opens ${s.opens}, closes ${s.closes}, deepest ${s.maxDepth}${s.opens === s.closes ? '' : ' — UNBALANCED'}${s.overDepthAt.length > 0 ? ` — a strong inside a strong on line${s.overDepthAt.length > 1 ? 's' : ''} ${s.overDepthAt.join(', ')}` : ''}`);

  const shape = documentShape(html);
  out.push(`doctype: ${shape.doctype ? 'present' : 'ABSENT'}; closing </html>: ${shape.closingHtml ? 'present at the end' : 'ABSENT or not at the end'}`);

  const w = withdrawalReport(html);
  out.push(`withdrawal sentences: ${w.count} declared (${byFormLine(w.byForm)})${w.duplicates.length > 0 ? `; standing more than once: ${w.duplicates.length}` : '; none twice'}`);
  for (const d of w.duplicates) out.push(`  twice: ${d}`);

  const change = opt('--change');
  if (change !== undefined) {
    const md = readFileSync(change, 'utf8');
    const quotes = quotesOf(md);
    const unmatched = unmatchedQuotes(md, html);
    /*
      Two lists, never one (the coordinator, 6 Nov): a blockquote is the sentence the change file presents
      as card text, so one not carried is the mismatch this reading exists for; a quotation in the change
      file's prose may quote the handoff, a question or an old wording, and two of those stand on every
      card. In one list a reader learns to skip them, and that is how a real one gets missed.
    */
    const rulings = quotes.filter((q) => q.kind === 'ruling');
    const missingRulings = unmatched.filter((q) => q.kind === 'ruling');
    out.push(`change file ${change}: ${rulings.length} ruling${rulings.length === 1 ? '' : 's'} (blockquotes, presented as card text), ${missingRulings.length === 0 ? 'all carried character for character' : `${missingRulings.length} NOT CARRIED`}`);
    for (const q of missingRulings) out.push(`  ruling not carried${q.onlyByMarks ? ' (differs only by apostrophes or quote marks)' : ''}: ${q.text}`);
    const quotations = quotes.filter((q) => q.kind === 'quotation');
    const missingQuotations = unmatched.filter((q) => q.kind === 'quotation');
    out.push(`  quotations in the change file's prose, which may quote another document: ${quotations.length}, ${missingQuotations.length} not in the card`);
    for (const q of missingQuotations) out.push(`    not in the card${q.onlyByMarks ? ' (differs only by apostrophes or quote marks)' : ''}: ${q.text}`);
  } else {
    out.push('change file: none given (--change <file.md>)');
  }

  let previous = null;
  const given = opt('--previous');
  if (given !== undefined) {
    if (existsSync(given)) previous = { ref: given, text: readFileSync(given, 'utf8') };
    else { try { previous = { ref: given, text: execFileSync('git', ['show', `${given}:${relative(process.cwd(), card)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }; } catch { previous = null; } }
  } else {
    previous = previousFromDrops(`docs/design/${basename(card)}`);
  }
  if (previous === null) {
    out.push(`previous card: none found${given === undefined ? ' under refs/drops' : ` at ${given}`}; bold-sentence diff not read`);
  } else {
    const d = boldDiff(previous.text, html);
    out.push(`previous card: ${previous.ref}; bold sentences added ${d.added.length}, removed ${d.removed.length}`);
    for (const a of d.added) out.push(`  added: ${a}`);
    for (const r of d.removed) out.push(`  removed: ${r}`);
  }

  out.push('A report, not a verdict: it refuses nothing, and a quiet report is not proof the card is right; the assertions over a card are check-index.mjs’s.');
  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(report(process.argv.slice(2)));
