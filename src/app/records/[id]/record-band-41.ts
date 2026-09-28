/**
 * §41 (step 47): "Below §18's fork the record band's cells are sized by
 * their content, not by the row... from 960 to 1439 the record band packs
 * its cells into rows: each takes the width its content needs, rounded up
 * to a quarter of the band, and a row fills left to right in reading order.
 * A cell never narrows below its longest label, per §34. Below 960 the one
 * column stands."
 *
 * The model is pure: the page measures each cell's content and its longest
 * label, and this turns them into quarters. The grid's own auto-placement
 * fills the rows left to right; `packedRows` restates that placement so a
 * test can assert it.
 */

export const RECORD_BAND_QUARTERS = 4;

export function packRecordBand({
  quarter,
  padding,
  cells,
}: {
  /** One quarter of the band's width. */
  quarter: number;
  /** The cell's padding on each side, which its content sits inside. */
  padding: number;
  /** Per cell, in reading order: the width its content needs, and its longest label. */
  cells: ReadonlyArray<{ ink: number; label: number }>;
}): number[] {
  const need = (width: number) => Math.ceil((width + 2 * padding) / quarter - 1e-6);
  return cells.map(({ ink, label }) => Math.min(RECORD_BAND_QUARTERS, Math.max(1, need(ink), need(label))));
}

/** The rows the grid's auto-placement lays: cells in order, left to right, wrapping where the next does not fit. */
export function packedRows(spans: ReadonlyArray<number>): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  spans.forEach((span, index) => {
    if (used + span > RECORD_BAND_QUARTERS && row.length > 0) { rows.push(row); row = []; used = 0; }
    row.push(index);
    used += span;
  });
  if (row.length > 0) rows.push(row);
  return rows;
}
