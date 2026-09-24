/**
 * Re-applies the mechanical layer: one `<span data-withdrawn-by data-withdrawal>`
 * around each withdrawn passage.
 *
 * **The marks are the build's layer, not Design's.** Design's copy has never
 * carried one, which is why its report ships the withdrawal list instead. The
 * ids are Design's, read from that list and never derived here -- an earlier
 * version of this script slugged the `what` itself and produced
 * `13/placement-of-edit-and-delete` where the list says
 * `13/placement-of-edit-and`. Deriving an id is authoring one.
 *
 * Idempotent: a passage already wrapped is left alone.
 */
import fs from 'node:fs';
import { sections, stripTags, collapse } from './design-target-parser.mjs';

const L = 'docs/design/Record Detail 8a - build target.dc.html';
const S = 'docs/design/Record Detail 8a - settled 1-10.dc.html';

const list = JSON.parse(
  /<!--\s*reader-note-withdrawals\s*(\[[\s\S]*?\])\s*-->/.exec(fs.readFileSync(L, 'utf8'))[1],
);

/**
 * The opening fragment of each withdrawn passage, by the list's id.
 *
 * **Matched on content, never on position.** §26's two self-withdrawals share
 * both section and replacer, so nothing but their text tells them apart --
 * that pair is the whole reason the ids exist, and assigning by position is
 * the failure they replaced.
 */
const OPENS = {
  '13/placement-of-edit-and': 'Superseded by §24: both verbs sit together',
  '13/the-eyebrow-row': 'Withdrawn by §27: the eyebrow row below is undone.',
  '17/cell-aspect-ruling': 'Withdrawn by §20 — the drawing is width-bound',
  '19/rotation-term-and-curve': 'Superseded by §20 on the first term',
  '20/the-squeeze': 'Withdrawn by §22: k returns to 1',
  '25/tint-top-face': 'Superseded by §26 for a solid’s top face',
  '26/0-78-scale': 'and the earlier sentence here blaming the disc is withdrawn.',
  '26/frame-sized-as-the': 'Superseded by §31 on how the frame is sized',
  '26/first-wording-of-placement': 'The first wording of this ruling named a solo in a strip and a pair in air',
  '23/per-record-height-fill': 'Superseded by §32 as a per-record claim',
  '30/floor-figures-above-1440': 'Superseded by §32 on the floor figures that follow:',
  '4.2/ornament-step': 'Superseded by §28 for the ornament step',
  '2.1/corner-reserve': 'Superseded by §28 on the reserve: the identity cell has no corner field',
  '8.1/corner-reserve': 'Superseded by §28: there is no corner reserve or triangle',
  '18/corner-reserve': 'Superseded by §28 on the reserve: there is no two-track grid',
};

const applied = [], already = [], unmatched = [];

for (const [file, tag] of [[L, 'L'], [S, 'S']]) {
  let src = fs.readFileSync(file, 'utf8');
  for (const entry of list) {
    const sec = sections(src, tag).find((x) => x.id === entry.s);
    if (sec === undefined) continue;
    if (src.includes(`data-withdrawal="${entry.id}"`)) { already.push(entry.id); continue; }

    const open = OPENS[entry.id];
    if (open === undefined) { unmatched.push(`${entry.id}: no opening fragment`); continue; }

    /* Locate the passage in the RAW html, so the wrap lands on real bytes. */
    const start = sec.html.indexOf(open);
    if (start === -1) { unmatched.push(`${entry.id}: opening fragment not found in §${entry.s}`); continue; }

    /* The passage runs to the end of the sentence's own <strong> or paragraph. */
    const tail = sec.html.slice(start);
    const stop = tail.search(/<\/strong>|<\/p>/);
    if (stop === -1) { unmatched.push(`${entry.id}: no closing tag`); continue; }
    const passage = tail.slice(0, stop);

    const absolute = src.indexOf(passage);
    if (absolute === -1 || src.indexOf(passage, absolute + 1) !== -1) {
      unmatched.push(`${entry.id}: passage not unique in file`);
      continue;
    }
    const wrapped = `<span data-withdrawn-by="${entry.by}" data-withdrawal="${entry.id}">${passage}</span>`;
    src = src.slice(0, absolute) + wrapped + src.slice(absolute + passage.length);
    applied.push(`§${entry.s} <- §${entry.by}  ${entry.id}  "${collapse(stripTags(passage)).slice(0, 48)}"`);
  }
  fs.writeFileSync(file, src);
}

console.log(`APPLIED ${applied.length}:`);
applied.forEach((a) => console.log('  ' + a));
if (already.length > 0) console.log(`ALREADY MARKED ${already.length}: ${already.join(', ')}`);
console.log(`UNMATCHED ${unmatched.length}:`);
unmatched.forEach((u) => console.log('  ' + u));
