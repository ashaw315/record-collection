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

/** 38 characters: five lines at 72px in §4.2's 412 box, four at the cell's rendered 444 (§45). The collection's own. */
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

/**
 * **The other end of the collection: the emptiest record §29 reports on.**
 *
 * §29's build step 21 measures each flat "on the shared extremes fixture's
 * emptiest and fullest records", because a flat is sized against its host and
 * the host's height is its content's. The fullest record gives the largest
 * flat; this gives the smallest, and §29 rules a floor only if the smallest
 * reads as a speck.
 *
 * Emptiest means what the schema permits, not what looks sparse: a record
 * needs a title and an artist and nothing else. One short title word, a
 * one-line artist, no label, no pressing facts, no genres — so every section
 * below the fold renders at its minimum and About has no snippet, which is
 * the 104px host §29 names.
 */
export const EMPTIEST = {
  title: 'Sun',
  artist: 'Kim Jung Mi',
  label: null,
  catalogNumber: null,
  countryPressed: null,
  yearPressed: null,
  releaseYear: 1973,
  format: null,
  genres: [] as readonly string[],
} as const;

/**
 * **A short title, for the comparison the floor ruling needs.**
 *
 * §1's ruling is that the pressing block stays on the cell's floor and the
 * gap varies by record. Showing that takes two records whose TITLES differ —
 * `FITS_AFTER_COLLAPSE` is the same five-line title with a shorter label, so
 * both its gap and the worst record's come out ~25–31px and the void never
 * appears. `Meddle` is the collection's own shortest, and it carries a 302px
 * gap where the worst title carries 25.
 */
export const SHORT_TITLE = {
  ...FITS_AFTER_COLLAPSE,
  title: 'Meddle',
  artist: 'Pink Floyd',
} as const;

export type IdentityExtreme =
  | typeof WORST
  | typeof FITS_AFTER_COLLAPSE
  | typeof SHORT_TITLE
  | typeof EMPTIEST;
