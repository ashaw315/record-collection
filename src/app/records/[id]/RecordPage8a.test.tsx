import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { RecordPage8a, type PageRecord } from './RecordPage8a';

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

describe('the sleeve block sits inside the bar, not against the page edge', () => {
  /*
    §5.1 anchors the construction with a block INSIDE the sleeve's base bar —
    its own comment says "not straddling the frame edge", because a mark half
    off the page reads as a crop. With a cover the bar is a flex child and the
    block's `right-[10px]` lands inside it. With NO cover the bar is absolutely
    positioned at the cell's right edge and the block, offset by the same 10px,
    landed against the viewport's edge: a stray ink square belonging to no
    panel, which is how a reader reported it.
  */
  it('is offset past the bar’s width when there is no cover', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl: null }} />);
    const block = /<div[^>]*data-mark="sleeveBlock"[^>]*>/.exec(html)?.[0] ?? '';
    expect(block, 'the block is drawn').not.toBe('');
    expect(block, 'clear of the bar, not at the page edge').toMatch(/right-\[20px\]/);
  });

  it('keeps its position inside the bar when there is a cover', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl: 'https://c/x.jpg' }} />);
    const block = /<div[^>]*data-mark="sleeveBlock"[^>]*>/.exec(html)?.[0] ?? '';
    expect(block).toMatch(/right-\[10px\]/);
  });
});
