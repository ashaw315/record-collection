import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLUMNS_AT, WIDTHS, columnsFor, rowsAt } from '../../src/app/records/[id]/region-rows';
import { blocksOf, sentencesOf } from '../../scripts/export-diff.mjs';

/**
 * **ASSERTIONS-spec 14: a row count the card states is the count the build lays (the coordinator, 9 and 10 Nov).**
 * §28's sentence "six rows at 12 and 8 columns, eight at 4 and nine at one" carried two figures forward that §34 and
 * §53 contradicted inside the same card, and nothing joined a figure in prose to the figure the code derives. "Row
 * counts left to the build" (10 Nov) withdrew it: §28 states no count. §26 does, in its listing: "The lower region runs
 * as six rows: a wide section beside air (7 + 5), the tracklist full width (12), …".
 *
 * **Scope: twelve columns, and no other width.** §26's spans are twelve-column spans, so its six is the count at twelve
 * columns. Reading that listing as a count at every width and adding one is how six/six/eight/nine was produced; pinned
 * at 8, 4 and one it would fail and read as the card being wrong when it is not.
 *
 * **Which sentence is in force is read from the withdrawal sentences, never taken as the last match or the largest
 * number.** The card keeps superseded prose with its withdrawal after it, so §26 holds "runs as five rows" and "runs
 * as six rows"; a stated count is withdrawn where a "Withdrawn within §26: the lower region as N rows" names it, and
 * exactly one must remain. Found through the shared heading parser (§26 by `sectionId`).
 */
const CARD = 'docs/design/Record Detail 8a - build target.dc.html';
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const count = (word: string) => WORDS[word.toLowerCase()] ?? Number(word);
const STATED = /^The lower region runs as (\w+) rows:/;
const WITHDRAWN = /^Withdrawn within §26: the lower region as (\w+) rows\b/;

function section26(): string[] {
  const html = readFileSync(CARD, 'utf8');
  return blocksOf(html).filter((b) => b.sectionId === '26').flatMap((b) => sentencesOf(b.block));
}

/** §26's stated counts, each with whether a withdrawal sentence in §26 names it. */
function statedCounts(sentences: string[]): { n: number; withdrawn: boolean }[] {
  const withdrawn = new Set(sentences.map((s) => WITHDRAWN.exec(s)?.[1]).filter((w): w is string => w !== undefined).map(count));
  return sentences.map((s) => STATED.exec(s)?.[1]).filter((w): w is string => w !== undefined).map(count).map((n) => ({ n, withdrawn: withdrawn.has(n) }));
}

describe('§26’s stated row count against the rows the build lays, at twelve columns', () => {
  it('finds §26’s listings, and exactly one of them in force once the withdrawal sentences are read', () => {
    const stated = statedCounts(section26());
    expect(stated.length, 'the precondition: §26 lists the lower region’s rows, superseded listings included').toBeGreaterThanOrEqual(1);
    expect(stated.filter((s) => !s.withdrawn), `${CARD}: one listing in force in §26; found ${JSON.stringify(stated)}`).toHaveLength(1);
  });

  /*
    The width is derived, not written down (the coordinator, 10 Nov). The card has a named "1440 fork" and speaks of
    "the page above 1440", so 1440 sits on the boundary; whichever side the card means, the pin reads the build's own
    column count and fails if the width it measures at is not twelve columns, so a moved fork is said, not quietly
    measured on its other side.
  */
  const TWELVE = WIDTHS.find((w) => COLUMNS_AT[w] === 12);

  it('measures at a width the build lays twelve columns at, by the build’s own column count', () => {
    expect(TWELVE, 'region-rows keys one width to twelve columns').toBeDefined();
    if (TWELVE === undefined) return;
    expect(columnsFor(TWELVE), `the viewport ${TWELVE} is twelve columns, not the width before the fork`).toBe(12);
  });

  it('agrees with region-rows.ts at twelve columns, the width its spans are given at', () => {
    const inForce = statedCounts(section26()).filter((s) => !s.withdrawn);
    if (inForce.length !== 1 || TWELVE === undefined) return;
    expect(rowsAt(TWELVE).length, `the build at ${TWELVE}, twelve columns, lays the rows §26 lists`).toBe(inForce[0].n);
  });

  it('reads the withdrawal, not the order or the size: the superseded five is withdrawn and the six is not', () => {
    const stated = statedCounts(section26());
    expect(stated.find((s) => s.n === 5)?.withdrawn, 'five rows, withdrawn by its own sentence').toBe(true);
    expect(stated.find((s) => s.n === 6)?.withdrawn, 'six rows, in force').toBe(false);
  });
});
