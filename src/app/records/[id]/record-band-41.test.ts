import { describe, expect, it } from 'vitest';
import { fillRows, packRecordBand, packedRows, packedRules, RECORD_BAND_QUARTERS } from './record-band-41';

/**
 * §41 (step 47): "from 960 to 1439 the record band packs its cells into
 * rows: each takes the width its content needs, rounded up to a quarter of
 * the band, and a row fills left to right in reading order. A cell never
 * narrows below its longest label, per §34."
 */
describe('§41: the record band packed by content (step 47)', () => {
  const quarter = 1000 / RECORD_BAND_QUARTERS;
  const pad = 18;

  it('rounds each cell’s content, with its padding, up to a quarter of the band', () => {
    /* Measured at 1000: Provenance 76 of ink, Matrix 194, Year 164, Market 114, a filled About 959. */
    const spans = packRecordBand({ quarter, padding: pad, cells: [{ ink: 76, label: 76 }, { ink: 194, label: 100 }, { ink: 164, label: 130 }, { ink: 114, label: 114 }, { ink: 959, label: 40 }] });
    expect(spans).toEqual([1, 1, 1, 1, 4]);
  });

  it('never narrows a cell below its longest label', () => {
    expect(packRecordBand({ quarter, padding: pad, cells: [{ ink: 10, label: 300 }] })).toEqual([2]);
    expect(packRecordBand({ quarter, padding: pad, cells: [{ ink: 10, label: 214 }] }), '214 + 36 is 250, exactly one quarter').toEqual([1]);
    expect(packRecordBand({ quarter, padding: pad, cells: [{ ink: 10, label: 215 }] }), 'a pixel over takes the next quarter').toEqual([2]);
  });

  it('caps a cell at the whole band and floors it at one quarter', () => {
    expect(packRecordBand({ quarter, padding: pad, cells: [{ ink: 5000, label: 0 }, { ink: 0, label: 0 }] })).toEqual([4, 1]);
  });

  it('fills rows left to right in reading order, wrapping where the next cell does not fit', () => {
    expect(packedRows([1, 1, 1, 1, 4])).toEqual([[0, 1, 2, 3], [4]]);
    expect(packedRows([2, 3, 1, 4])).toEqual([[0], [1, 2], [3]]);
    expect(packedRows([1, 1, 2, 2, 1])).toEqual([[0, 1, 2], [3, 4]]);
  });
});

/**
 * §42 (step 49): "Below §18's fork a 1px hairline divides packed cells where
 * they meet in a row, and a 1px hairline across the band divides packed
 * rows... The last cell in a row takes whatever width the row has left, so a
 * row never ends in empty grid for a rule to stand against. A cell that
 * spans the row has no vertical."
 */
describe('§42: the last cell in a row takes the row’s remaining width, and rules stand only between rendered cells (step 49)', () => {
  it('fills each row’s remainder into its last cell', () => {
    expect(fillRows([1, 1, 1, 1, 4])).toEqual([1, 1, 1, 1, 4]);
    expect(fillRows([2, 3, 1, 4]), '2 alone in row 1 takes 4; 3 + 1 fill row 2').toEqual([4, 3, 1, 4]);
    expect(fillRows([1, 1, 2, 2, 1]), 'row 2 is 2 + 1, so the 1 takes 2').toEqual([1, 1, 2, 2, 2]);
    expect(fillRows([1]), 'one cell takes the row').toEqual([4]);
  });

  it('states each cell’s rules: a right rule where a cell follows it in the row, a top rule on every row but the first', () => {
    expect(packedRules([1, 1, 1, 1, 4])).toEqual([
      { right: 1, top: 0 }, { right: 1, top: 0 }, { right: 1, top: 0 }, { right: 0, top: 0 }, { right: 0, top: 1 },
    ]);
    expect(packedRules([4, 3, 1, 4])).toEqual([{ right: 0, top: 0 }, { right: 1, top: 1 }, { right: 0, top: 1 }, { right: 0, top: 1 }]);
  });
});
