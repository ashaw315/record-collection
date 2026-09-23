/**
 * **The identity cell's worst case, as one shared record — derived by
 * measurement, not hand-written per test.**
 *
 * Twice a fixture that under-represented the real worst case produced a
 * false pass. §20's first test carried twelve of the seventeen record ids and
 * the five it dropped were the five worst. The identity probe's five-line
 * case was the real longest title with NO pressing block: it needed 462px
 * where the same title with its catalogue, country, year, format and genres
 * needs 495 — 33px short of the collection's actual worst, and §13's 16.5px
 * eyebrow row passed the probe while cutting the real record. A sample that
 * drops its tail reports its median as its minimum.
 *
 * So every test that claims to check the identity cell's bound consumes THIS,
 * and the probe route renders it, so none can disagree about what the worst
 * case is. `real-records.ts` is the same rule for the construction's floor.
 *
 * **Measured at 1440 × 900 after §27 removed the eyebrow row**, on the two
 * cases the genres spec had been carrying:
 *
 * | case | pressing line | needed after collapse | margin |
 * |---|---|---|---|
 * | three genres, short label | 1 line, 19.5px | 505 | +0.4 |
 * | six genres, long label | 2 lines, 39px | 525 | −16.0 |
 *
 * The long label is what makes the second the worst: its pressing line wraps,
 * and 19.5px of a second line is more than the height give order has left
 * once the gap, the reserve and the genres run are spent. That case is the
 * collection's real worst and is what `WORST` names.
 *
 * Longer term this should be DERIVED from the live collection — longest title
 * by rendered lines, longest label, fullest pressing block — so a longer
 * title arriving moves the fixture with it. Until then the figures are
 * measured and dated, and a change to any of them is a change to what the
 * bound tests assert.
 */

/** 38 characters, five lines at 72px in the 412 measure (§4.2). The collection's own. */
export const FIVE_LINE_TITLE = 'On The Radio: Greatest Hits Vol. 1 & 2';

export const WORST = {
  title: FIVE_LINE_TITLE,
  artist: 'Donna Summer',
  /** Long enough to wrap the pressing line to two — the term that makes this the worst. */
  label: 'Casablanca Record and FilmWorks International',
  catalogNumber: 'NBLP 7119',
  countryPressed: 'United States',
  yearPressed: 1979,
  releaseYear: 1979,
  format: 'Vinyl, LP, Album',
  genres: ['Disco', 'Soul', 'Pop', 'Funk', 'Electronic', 'Hi-NRG'],
} as const;

/** The same record with a short label and three genres: fits once the run collapses, by 0.4px. */
export const FITS_AFTER_COLLAPSE = {
  ...WORST,
  label: 'Casablanca',
  genres: ['Disco', 'Soul', 'Pop'],
} as const;

export type IdentityExtreme = typeof WORST | typeof FITS_AFTER_COLLAPSE;
