import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLUMNS_AT, REGION_ROWS, WIDTHS, airPlacement, columnsFor, placementOf, rowsAt } from '../../src/app/records/[id]/region-rows';
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

/*
  **Extended to the spans (the coordinator, 10 Nov), once "Row 4 is Images" landed.** The count alone read a listing
  holding a figure known to be wrong, "two halves (6 / 6)", and passed, because at twelve columns a side-by-side pair
  and one section are both one row. Each row's spans in the listing in force are now compared with what the build lays
  at the twelve-column width: a row's sections' spans in order from `placementOf`, and which side its air sits from
  `airPlacement`, the listing's "beside air" being air after and "begins with air" air first. **Row 4 is resolved from
  its replacement sentence, not from the listing:** the listing still reads "two halves (6 / 6)" with its withdrawal
  directly after it, and "Row 4 is Images, one section spanning the row at every width" is the ruling in force. The test
  refuses to resolve row 4 at all unless that withdrawal stands directly after the listing, so a listing whose row 4 is
  live and wrong fails rather than being read past. Passed first time because the card and the build already agree;
  shown to fail against a reading that takes row 4 from the listing, and against a build laying Images as a pair.
*/
type Row = { spans: number[]; air: 'first' | 'after' | null };

/** The listing's rows, in order, from its parentheticals: "(7 + 5)" is content and air, "(4 / 4 / 4)" sections side by side, "(12)" one section. */
export function listingRows(listing: string): Row[] {
  const body = listing.slice(listing.indexOf(':') + 1);
  const rows: Row[] = [];
  for (const m of body.matchAll(/([^(),]*?)\(([\d\s+/]+)\)/g)) {
    const label = m[1];
    const inner = m[2].trim();
    if (inner.includes('+')) {
      const [a, b] = inner.split('+').map((n) => Number(n.trim()));
      if (/begins with air/.test(label)) rows.push({ spans: [b], air: 'first' });
      else if (/beside air/.test(label)) rows.push({ spans: [a], air: 'after' });
      else throw new Error(`a row with air and no side named: "${label.trim()} (${inner})"`);
    } else rows.push({ spans: inner.split('/').map((n) => Number(n.trim())), air: null });
  }
  return rows;
}

/**
 * The rows §26 rules, from the listing in force with row 4 taken from its replacement sentence. Refuses unless the
 * listing's row 4 carries its withdrawal directly after the listing and a replacement sentence rules it.
 */
export function ruledRows(sentences: string[], columns: number): Row[] {
  const at = sentences.findIndex((s) => STATED.test(s) && !/five rows/.test(s));
  if (at === -1) throw new Error('no listing in force');
  const rows = listingRows(sentences[at]);
  const marker = sentences[at + 1] ?? '';
  if (!/^Withdrawn within §26: row 4 as two halves \(6 \/ 6\)/.test(marker)) throw new Error(`row 4's withdrawal does not stand directly after the listing; found: "${marker.slice(0, 80)}"`);
  const replacement = sentences.find((s) => /^Row 4 is Images, one section spanning the row at every width/.test(s));
  if (replacement === undefined) throw new Error('no replacement sentence rules row 4');
  rows[4] = { spans: [columns], air: null };
  return rows;
}

/** What the build lays at a width, row by row, in the listing's terms. */
export function builtRows(width: (typeof WIDTHS)[number]): Row[] {
  return REGION_ROWS.map((r) => {
    const air = airPlacement(width, r.name);
    return { spans: r.sections.map((s) => placementOf(width, s).span), air: air === null ? null : air.start === 1 ? 'first' : 'after' };
  });
}

describe('§26’s spans against the spans the build lays, at twelve columns', () => {
  const TWELVE = WIDTHS.find((w) => COLUMNS_AT[w] === 12);

  it('reads the listing’s rows: content beside air, air first, sections side by side, one section', () => {
    expect(listingRows('The lower region runs as six rows: a wide section beside air (7 + 5), the tracklist full width (12), three tight columns carrying no ornament (4 / 4 / 4), a full-width strip (12), two halves (6 / 6), and a last row that begins with air (3 + 9).'))
      .toEqual([{ spans: [7], air: 'after' }, { spans: [12], air: null }, { spans: [4, 4, 4], air: null }, { spans: [12], air: null }, { spans: [6, 6], air: null }, { spans: [9], air: 'first' }]);
  });

  it('refuses to resolve row 4 unless its withdrawal stands directly after the listing', () => {
    const listing = 'The lower region runs as six rows: a wide section beside air (7 + 5), b (12), c (4 / 4 / 4), d (12), two halves (6 / 6), and a last row that begins with air (3 + 9).';
    expect(() => ruledRows([listing, 'Some other sentence.', 'Row 4 is Images, one section spanning the row at every width, by §53.'], 12)).toThrow(/does not stand directly after/);
    expect(() => ruledRows([listing, 'Withdrawn within §26: row 4 as two halves (6 / 6), in the listing above and in the names below.'], 12)).toThrow(/no replacement sentence/);
  });

  it('lays every row as §26 rules it, row 4 as Images spanning the row', () => {
    expect(TWELVE).toBeDefined();
    if (TWELVE === undefined) return;
    const ruled = ruledRows(section26(), COLUMNS_AT[TWELVE]);
    const built = builtRows(TWELVE);
    expect(built.length, 'the same number of rows').toBe(ruled.length);
    ruled.forEach((row, i) => expect(built[i], `row ${i + 1} of the listing (${REGION_ROWS[i]?.name})`).toEqual(row));
  });
});
