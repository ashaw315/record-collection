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
 * **Measured at 1440 × 900 after §27 removed the eyebrow row, on the record's
 * REAL shape, fonts confirmed loaded.** One number and one cause, because
 * two earlier figures for this record — 16 and 14.9 — reached the same
 * report and Design was about to rule a height term against whichever
 * arrived. Both were one measurement of a fixture that had the wrong shape:
 *
 * | | artist | pressing line | needed | ornament | against 510 |
 * |---|---|---|---|---|---|
 * | fixture, suffixed artist | 2 lines, 80 | 2 lines, 39 | 525 | 1 | **−15** |
 * | the record, as it is | 1 line, 40 | 2 lines, 39 | 485 | 25.1 | **+25** |
 *
 * The 15 (the 16 counted the ornament track's own 1px floor) was the
 * fixture's twelve-character isolation suffix wrapping "Donna Summer" to a
 * second 40px line. The real record fits by 25 after §4.2's third term
 * fires. **What actually drives the shape is the label**: a two-by-two over
 * {short, long label} × {three, six genres} gives 505 / 505 / 525 / 525 —
 * the genre count changes nothing once the run has collapsed, and the long
 * label's second pressing line is the whole 19.5px difference. Six genres
 * are here because the genres spec needs a run worth collapsing, not because
 * they cost height.
 *
 * So `WORST` is: five-line title, one-line artist, a label long enough to
 * wrap the pressing line, and a collapsing run. Its margin is +25. Any test
 * that measures it must assert the one-line artist as a precondition, since
 * the suffix that isolates it is what inflated it.
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

/** The same record with a short label and three genres: needs 505 collapsed (465 with the one-line artist), the run need not collapse at all. */
export const FITS_AFTER_COLLAPSE = {
  ...WORST,
  label: 'Casablanca',
  genres: ['Disco', 'Soul', 'Pop'],
} as const;

export type IdentityExtreme = typeof WORST | typeof FITS_AFTER_COLLAPSE;
