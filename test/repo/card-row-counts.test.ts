import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rowsAt, type RegionWidth } from '../../src/app/records/[id]/region-rows';
import { blocksOf, sentencesOf } from '../../scripts/export-diff.mjs';

/**
 * **ASSERTIONS-spec 14: a figure the card states in prose against the figure the build derives (the coordinator,
 * 9 Nov).** §28's sentence "the lower region is six rows at 12 and 8 columns, eight at 4 and nine at one" carried
 * two figures forward that §34 (the market's own row at 8) and §53 (the images row unsplit at one) already
 * contradicted inside the same card, and neither side could see it: Design had no build to check against, and the
 * card's verification counts tags, sentences and quotes and never a number against another section. Two independent
 * records, the card's sentence and `rowsAt`, compared at the widths the sentence names.
 *
 * The sentence is found through the shared heading parser (§28 by `sectionId`), and its absence fails: a reworded
 * sentence breaks this loudly rather than reading as nothing to compare.
 */
const CARD = 'docs/design/Record Detail 8a - build target.dc.html';
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const STATED = /lower region is (\w+) rows at 12 and 8 columns, (\w+) at 4 and (\w+) at one/;

function stated(): Record<RegionWidth, number> | null {
  const html = readFileSync(CARD, 'utf8');
  const sentences: string[] = blocksOf(html).filter((b) => b.sectionId === '28').flatMap((b) => sentencesOf(b.block));
  /* The sentence in force: §28 also holds its withdrawn "five rows at 12 and 8" form, inside a withdrawal sentence. */
  const inForce = sentences.filter((s) => STATED.test(s) && !/^Withdrawn within/.test(s));
  if (inForce.length !== 1) return null;
  const m = STATED.exec(inForce[0]);
  if (m === null) return null;
  const [twelveAndEight, four, one] = [m[1], m[2], m[3]].map((w) => WORDS[w.toLowerCase()] ?? Number(w));
  return { 1440: twelveAndEight, 960: twelveAndEight, 480: four, 390: one };
}

/*
  The disagreement in force when this was written, declared so the commit path stays green while Design corrects the
  sentence: the test fails if it changes in either direction, the sentence corrected or the build moved, and the entry
  is then removed. Each names the ruling the build follows.
*/
const KNOWN: Partial<Record<RegionWidth, { card: number; build: number; why: string }>> = {
  /* 9 Nov, reported to Design with "Tracklist row": the sentence's withdrawn counts plus one. */
  960: { card: 6, build: 7, why: '§34: at eight columns the market takes its own row, so row 2 is two rows there' },
  390: { card: 9, build: 8, why: '§53: the images row is one section and does not split at one column; the withdrawn eight was its pair with the About' },
};

describe('§28’s stated row counts against the rows the build lays', () => {
  it('finds the sentence in force, once, in §28', () => {
    expect(stated(), `${CARD}: §28 states the lower region's row counts in one sentence in force`).not.toBeNull();
  });

  it('agrees at every width the sentence names, or disagrees exactly as declared', () => {
    const card = stated();
    if (card === null) return;
    const disagree: Partial<Record<RegionWidth, { card: number; build: number }>> = {};
    for (const width of [1440, 960, 480, 390] as const) {
      const build = rowsAt(width).length;
      if (card[width] !== build) disagree[width] = { card: card[width], build };
    }
    const declared = Object.fromEntries(Object.entries(KNOWN).map(([w, k]) => [w, { card: k.card, build: k.build }]));
    expect(disagree, 'the card and region-rows.ts disagree only where declared').toEqual(declared);
  });
});
