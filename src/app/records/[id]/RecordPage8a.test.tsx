import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { RecordPage8a, type PageRecord } from './RecordPage8a';
import { COVER_CELL } from './cover-geometry';
import { BANDS } from './band-geometry';
import { STRIP_SPLIT, coverSquare, leftoverStrip } from './cover-33';

/**
 * §5.3, the record with no cover: "the fallback is ink for all eight marks
 * ... The release-year label and figure reverse to paper."
 *
 * **Measured live at 1.00:1 before this test existed.** With a null spine the
 * field fell back to ink and the 72 inherited the page's ink, so the coverless
 * record's year was drawn ink on ink — invisible, on the one record the E2E
 * seed produces by default, and nothing looked because the contrast was only
 * ever measured against a field that had a colour.
 */

const record = (spineColour: string | null): PageRecord => ({
  id: 'r1',
  title: 'The Best Of The Blues Project',
  artistName: 'The Blues Project',
  artistId: 'a1',
  pressingLine: 'Verve · V6-5060',
  formatLine: 'Vinyl, LP, Compilation',
  matrixRunout: null,
  releaseYear: 1969,
  yearPressed: null,
  genres: [],
  purchasePrice: null,
  storeName: null,
  conditionMedia: null,
  conditionSleeve: null,
  marketMedian: null,
  marketLow: null,
  marketHigh: null,
  hasDiscogsRelease: false,
  journalEntry: null,
  note: null,
  imageCount: 0,
  coverUrl: null,
  spineColour,
});

/** The year cell's markup, cut at the next cell. */
function yearCell(html: string): string {
  const start = html.indexOf('data-cell="year"');
  expect(start, 'the year cell renders').toBeGreaterThan(-1);
  const rest = html.slice(start);
  const end = rest.indexOf('data-cell=', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('the release-year field on the record with no cover (§5.3)', () => {
  it('reverses label and figure to paper when the field falls back to ink', () => {
    const cell = yearCell(renderToStaticMarkup(<RecordPage8a record={record(null)} />));

    expect(cell, 'the field is ink').toContain('background:oklch(0.19 0.008 60)');
    /* Both marks on the field reverse — a label left in ink is the same 1.00. */
    const figure = cell.slice(cell.indexOf('data-field="year"'));
    expect(figure, 'the 72 reverses').toMatch(/^[^>]*text-background/);
    const label = cell.slice(0, cell.indexOf('data-field="year"'));
    expect(label, 'the label reverses').toContain('text-background');
    expect(label, 'the label is no longer forced to ink').not.toContain('color:oklch(0.19');
  });

  it('keeps ink on the derived field — the control', () => {
    const cell = yearCell(renderToStaticMarkup(<RecordPage8a record={record('#a25829')} />));

    expect(cell).not.toContain('background:oklch(0.19 0.008 60)');
    expect(cell).not.toContain('text-background');
    expect(cell, 'the label on the colour field is full ink (§4)').toContain('color:oklch(0.19');
  });
});

describe('§33: the cover fills its cell and the column lies down', () => {
  /*
    **§23's column is withdrawn by §33.** These tests pinned the bar and block
    to a 30px column at the cell's RIGHT edge, both `right-0`, which is what
    §23 ruled and what let the cover be 414 in a 480 cell.

    §33 rules the cover "the largest square its cell holds, flush to the
    cell's top, left and right" -- 480 × 480 -- and rotates the column into
    the 67px strip beneath: "the base bar and the black block keep their order
    and proportions, now horizontal."

    The claim survives and its mechanism changes, so the test follows the
    ruling rather than being deleted: the two marks still sit together, still
    in the bar-then-block order, and still carry the record's colour and ink.
  */
  it('lies the bar and block along the strip beneath the cover (§33)', () => {
    for (const coverUrl of [null, 'https://c/x.jpg']) {
      const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl }} />);
      const block = /<div[^>]*data-mark="sleeveBlock"[^>]*>/.exec(html)?.[0] ?? '';
      const bar = /<div[^>]*data-mark="sleeveBar"[^>]*>/.exec(html)?.[0] ?? '';
      expect(block, `cover=${coverUrl}: the block is drawn`).not.toBe('');
      expect(bar, `cover=${coverUrl}: the bar is drawn`).not.toBe('');

      /* Both sit at the strip's top, which is the square's foot. */
      const cell = { width: COVER_CELL, height: BANDS.identity };
      const strip = leftoverStrip(cell);
      expect(strip.orientation, 'the leftover falls beneath').toBe('horizontal');
      expect(bar, `the bar starts at the strip (${strip.y})`).toMatch(new RegExp(`top:${strip.y}px`));
      expect(block, `the block starts at the strip (${strip.y})`).toMatch(new RegExp(`top:${strip.y}px`));

      /*
        The bar leads, as it sat above the block in the column.

        **Read back as a number, not matched as a string.** The split is a
        ratio, so the emitted width is a float — pinning its rendered text
        would assert React's number formatting rather than §33's proportion.
      */
      const barWidth = strip.width * STRIP_SPLIT.bar;
      const widthOf = (markup: string) => Number(/width:([\d.]+)px/.exec(markup)?.[1] ?? NaN);
      const leftOf = (markup: string) => Number(/left:([\d.]+)px/.exec(markup)?.[1] ?? NaN);

      expect(widthOf(bar), 'the bar takes its share of the strip').toBeCloseTo(barWidth, 1);
      expect(leftOf(block), 'and the block follows it').toBeCloseTo(barWidth, 1);
      expect(widthOf(bar) + widthOf(block), 'together they fill it').toBeCloseTo(strip.width, 1);
    }
  });

  it('draws the cover at the cell’s full width (§33)', () => {
    const html = renderToStaticMarkup(
      <RecordPage8a record={{ ...record(null), coverUrl: 'https://c/x.jpg' }} />,
    );
    const cover = /<img[^>]*data-cover[^>]*>/.exec(html)?.[0] ?? '';
    const square = coverSquare({ width: COVER_CELL, height: BANDS.identity });
    expect(square.size, 'the largest square the 480 x 547 cell holds').toBe(480);
    expect(cover, 'the cover is that square').toMatch(new RegExp(`width:${square.size}px`));
    expect(cover, 'flush to the cell’s left').toMatch(/left:0/);
    expect(cover, 'flush to the cell’s top').toMatch(/top:0/);
  });
});
