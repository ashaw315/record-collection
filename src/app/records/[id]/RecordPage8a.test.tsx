import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { RecordPage8a, type PageRecord } from './RecordPage8a';
import { BAR_BOTTOM, COVER_COLUMN } from './cover-geometry';

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

describe('the sleeve block shares the bar’s column (§23)', () => {
  /*
    **§23 put the block in a ruled column, and the two cases collapse into
    one.** These tests pinned `right-[20px]` without a cover and `right-[10px]`
    with one — offsets that kept a 46px block clear of a 10px bar, because a
    block at the viewport's edge read as "a stray ink square belonging to no
    panel". §23 answers the same complaint by structure: the bar and the block
    SHARE one 30px column at the cell's right edge, bar above and block below,
    so the block belongs to the column whether or not there is a cover. The
    claim survives; the mechanism is the column, not an offset.
  */
  it('sits in the shared column below the bar, with or without a cover (§23)', () => {
    for (const coverUrl of [null, 'https://c/x.jpg']) {
      const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl }} />);
      const block = /<div[^>]*data-mark="sleeveBlock"[^>]*>/.exec(html)?.[0] ?? '';
      const bar = /<div[^>]*data-mark="sleeveBar"[^>]*>/.exec(html)?.[0] ?? '';
      expect(block, `cover=${coverUrl}: the block is drawn`).not.toBe('');
      /* Both at the cell's right edge, both the column's width. */
      expect(block, 'block at the right edge').toMatch(/right-0/);
      expect(bar, 'bar at the right edge').toMatch(/right-0/);
      expect(block, `block is ${COVER_COLUMN} wide`).toMatch(new RegExp(`width:${COVER_COLUMN}px`));
      expect(bar, `bar is ${COVER_COLUMN} wide`).toMatch(new RegExp(`width:${COVER_COLUMN}px`));
      /* Block below bar: its top is the bar's bottom. */
      expect(block, `block starts at ${BAR_BOTTOM}`).toMatch(new RegExp(`top:${BAR_BOTTOM}px`));
    }
  });
});
