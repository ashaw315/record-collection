/**
 * The withdrawal list, read from WITHDRAWALS.md's BULLETS.
 *
 * Spec: "Claude authors only the bulleted entries; the script derives the
 * machine-readable comment from them." The comment is one line of about 8KB
 * of JSON nobody can read to confirm an edit, so it is never the source --
 * `check-index.mjs` reads the bullets and fails when the comment disagrees,
 * and `derive-withdrawals.mjs` rewrites it, idempotently.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The bullet grammar, as the spec states it:
 *
 *   - **`ID`**: §S, withdrawn by §BY. WHAT
 *     > QUOTE
 *
 * `WHAT` runs from the character after the by-clause's own ". " to the end
 * of the line and is carried VERBATIM -- capital, trailing period, colons,
 * inner periods, straight or curly apostrophes. Anchoring the split on the
 * by-clause is what keeps `26/0-78-scale`'s inner period and `31/whole`'s
 * colon out of it.
 */
const BULLET = /^- \*\*`([^`]+)`\*\*: §([0-9]+(?:\.[0-9]+)?|W(?:\.[0-9]+)*|G(?:\.[0-9]+)+|M(?:\.[0-9]+)+|T(?:\.[0-9]+)+|P(?:\.[0-9]+)+), withdrawn by §([0-9]+(?:\.[0-9]+)?|W(?:\.[0-9]+)*|G(?:\.[0-9]+)+|M(?:\.[0-9]+)+|T(?:\.[0-9]+)+|P(?:\.[0-9]+)+)\. (.+)$/;
const QUOTE = /^\s*> (.+)$/;
export const COMMENT = /<!--\s*machine-readable:\s*(\[[\s\S]*?\])\s*-->/;

/**
 * Parses the bullets into entries.
 *
 * **Loud on anything it cannot read.** A bullet that does not match the
 * grammar, or has no `> quote` line after it, throws with the line number and
 * the line -- a source of truth that silently drops an entry is exactly the
 * defect this file replaced. The first version of this parser matched 0 of 33
 * bullets and the derivation wrote an empty comment without a word.
 */
export function parseBullets(markdown) {
  const lines = markdown.split('\n');
  const entries = [];
  const problems = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('- ')) continue;
    const m = BULLET.exec(line);
    if (m === null) { problems.push(`line ${i + 1}: bullet does not match the grammar: ${line.slice(0, 90)}`); continue; }
    const q = QUOTE.exec(lines[i + 1] ?? '');
    if (q === null) { problems.push(`line ${i + 1}: entry ${m[1]} has no "> quote" line after it`); continue; }
    entries.push({ id: m[1], s: m[2], by: m[3], what: m[4].trim(), quote: q[1].trim() });
  }
  if (problems.length > 0) throw new Error(`WITHDRAWALS.md cannot be parsed:\n  ${problems.join('\n  ')}`);
  if (entries.length === 0) throw new Error('WITHDRAWALS.md yielded no entries: the grammar and the file disagree');
  return entries;
}

export const serialize = (entries) => JSON.stringify(entries);

/** The comment as shipped, or null when the file carries none. */
export function shippedComment(markdown) {
  const m = COMMENT.exec(markdown);
  return m === null ? null : m[1];
}

/** Rewrites the comment from the bullets; returns whether the file changed. */
export function deriveInto(path) {
  const markdown = readFileSync(path, 'utf8');
  const entries = parseBullets(markdown);
  const comment = `<!-- machine-readable: ${serialize(entries)} -->`;
  const next = COMMENT.test(markdown) ? markdown.replace(COMMENT, comment) : `${markdown.trimEnd()}\n\n${comment}\n`;
  if (next === markdown) return { changed: false, entries: entries.length };
  writeFileSync(path, next);
  return { changed: true, entries: entries.length };
}

/* ---- the reverse direction ------------------------------------------ */

/**
 * **The index ran one direction and was assumed to run both.** Assertion 6
 * checks every entry's quote is in its section; assertion 7 finds declared
 * sentences only where they start a `<strong>` run or follow a sentence end
 * inside one. A sentence in withdrawal form anywhere else -- unbolded, or
 * after other words in a run -- passed with no entry filed: §28 and §33 each
 * carried one narrowing the Price history solo. This is the other direction:
 * every phrasing the file uses, wherever it sits, must have an entry whose
 * quote matches its sentence. The §34 shape, a guard in Plane and not Figure.
 */
const PHRASING = /(?:Withdrawn (?:in part |in whole )?by §|Withdrawn within §|Superseded (?:in part )?by §)/g;

export const collapseText = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Every sentence that carries a withdrawal phrasing, from the phrasing to
 * its own sentence end. A phrasing inside quotation marks is an example of
 * the form, not a declaration, and is not counted; the matching is
 * case-sensitive, so prose that says "withdrawn by" mid-sentence is prose.
 */
export function withdrawalSentencesIn(plain) {
  const text = collapseText(plain);
  const blank = (m) => ' '.repeat(m.length);
  const scrubbed = text.replace(/“[^”]*”/g, blank).replace(/"[^"]*"/g, blank);
  const out = [];
  for (const m of scrubbed.matchAll(PHRASING)) {
    const rest = text.slice(m.index);
    const end = rest.search(/[.!?](?=\s|$)/);
    out.push(end === -1 ? rest : rest.slice(0, end + 1));
  }
  return out;
}

/** The sentences no entry's quote matches, on collapsed whitespace. */
export function unenteredWithdrawals(sentences, entries) {
  const quotes = new Set(entries.map((e) => collapseText(e.quote)));
  return sentences.map(collapseText).filter((s) => !quotes.has(s));
}

/**
 * The entries whose id prefix disagrees with the heading they sit under
 * (13 Oct). The file groups its bullets under "The wall", "The nav", "The
 * modal" and "The table and grid", with the numeric ids in the main list at
 * the top, and its own text said the headings were for people and no check
 * read them: ten entries had drifted under the table and grid's heading.
 * `W.` is the wall, `G.` the nav, `M.` the modal, `T.` the table and grid,
 * and a numeric id the main list. Each misplaced entry is named with its
 * line, the heading it is under and the one it belongs under.
 */
export function misplacedEntries(markdown) {
  const HEADING_OF = { W: '## The wall', G: '## The nav', M: '## The modal', T: '## The table and grid', n: '# Withdrawals' };
  const out = [];
  let under = '';
  markdown.split('\n').forEach((line, index) => {
    if (/^#{1,2} /.test(line)) { under = line.trim(); return; }
    const entry = /^- \*\*`([^`]+)`\*\*/.exec(line);
    if (entry === null) return;
    const id = entry[1];
    const prefix = /^([A-Z])\./.exec(id)?.[1] ?? 'n';
    const belongs = HEADING_OF[prefix];
    if (belongs !== undefined && belongs !== under) out.push({ id, line: index + 1, under, belongs });
  });
  return out;
}
