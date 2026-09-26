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
  about: null,
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


/**
 * §33 (d), amended: "The lower frame's last cell shows the record's About,
 * labelled ABOUT... A record with no About shows its latest journal entry
 * instead, date and text; a record with neither shows §6's diagonal. Absence
 * is one state: an About or entry that is null, empty or only whitespace,
 * once trimmed, counts as none."
 */
function lastCell(html: string): string {
  const start = html.indexOf('data-cell="note"');
  expect(start, 'the last cell renders').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('data-cell=', start + 1) === -1 ? undefined : html.indexOf('data-cell=', start + 1));
}

describe('the frame’s last cell is the About, else the entry, else the diagonal (§33)', () => {
  const entry = { entry: 'Played it right through.', entryDate: '2026-09-20' };

  it('shows the About under an ABOUT label, ahead of any entry', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: 'Her last album for the label.', journalEntry: entry }} />));
    expect(cell).toContain('>About<');
    expect(cell).toContain('Her last album for the label.');
    expect(cell, 'the entry yields to the About').not.toContain('Played it right through.');
    expect(cell, 'no diagonal').not.toContain('data-diagonal');
  });

  it('falls to the latest entry, date and text, under a JOURNAL label', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, journalEntry: entry }} />));
    expect(cell).toContain('>Journal<');
    expect(cell).toContain('2026-09-20');
    expect(cell).toContain('Played it right through.');
    expect(cell).not.toContain('data-diagonal');
  });

  it('shows the diagonal when there is neither', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, journalEntry: null }} />));
    expect(cell).toContain('data-diagonal');
  });

  /**
   * **The hole the note version had, closed on the About.** It tested null,
   * so an empty string printed a heading over nothing with no diagonal.
   * Reachable now, because Adam can clear an About.
   */
  it('treats an empty or whitespace About as absent', () => {
    for (const about of ['', '   ', '\n\t']) {
      const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about, journalEntry: null }} />));
      expect(cell, `about=${JSON.stringify(about)}: the diagonal fires`).toContain('data-diagonal');
    }
    const withEntry = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: '  ', journalEntry: entry }} />));
    expect(withEntry, 'an empty About yields to the entry').toContain('Played it right through.');
  });

  /**
   * §33: "An About longer than ten lines — a hand edit, or one written before
   * this ruling — shows nine lines and more ↓, which opens the lower row's
   * editor with the full text." Lines are measured after paint; on the
   * server the measured character budget is the guess, so a long About never
   * paints unclamped for a frame.
   */
  it('clamps a long About to nine lines on first paint and links more ↓ to the editor', () => {
    const long = 'A sentence about the record that goes on. '.repeat(20);
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: long, journalEntry: null }} />));
    expect(cell).toContain('data-clamped');
    expect(cell).toMatch(/-webkit-line-clamp:9/);
    expect(cell).toContain('href="#snippet"');
    expect(cell).toContain('more ↓');
  });

  it('does not clamp an About within the budget', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: 'Short.', journalEntry: null }} />));
    expect(cell).not.toContain('data-clamped');
    expect(cell).not.toContain('more ↓');
  });
});

/**
 * §34: "§29 governs a plane's size: §5.1's quarter-circles are flats, and a
 * flat is sized against its host... a plane is sized first, to at most
 * two-thirds of its host's height and a quarter of its section's width, and
 * only then tested against type." §29: "a size on a specimen sheet is a drawn
 * instance, never a rule" -- so the drawing's 112 is not carried.
 */
describe('§5.1’s quarter-circles are sized against their host (§29, §34)', () => {
  it('draws each arc at two-thirds of the host height, capped at a quarter of its width, never at a fixed 112', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), purchasePrice: '12.99', about: 'Short.', journalEntry: null }} />);
    /* provenanceArc only: aboutArc is withdrawn by §35. */
    for (const name of ['provenanceArc']) {
      const arc = new RegExp(`<div[^>]*data-mark="${name}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(arc, `${name} renders`).not.toBe('');
      expect(arc, `${name} is not a fixed 112`).not.toMatch(/h-\[112px\]|w-\[112px\]|height:112px/);
      expect(arc, `${name}: two-thirds of the host height`).toMatch(/height:66\.6+\d*%/);
      expect(arc, `${name}: at most a quarter of the section width`).toMatch(/max-width:25%/);
      expect(arc, `${name}: a square, so the smaller bound wins`).toMatch(/aspect-ratio:1 \/ 1/);
    }
  });
});

/**
 * §6: "Label persists, one diagonal fills the body box." Measured on the
 * collection's real rows: 12 of 17 have neither About nor entry, and the
 * diagonal was `inset-0` of the cell, drawn across the ABOUT label.
 */
describe('the diagonal fills the body box, not the cell (§6)', () => {
  it('draws the empty last cell’s diagonal after its label and not over it', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, journalEntry: null }} />));
    const label = cell.indexOf('>About<');
    const diagonal = cell.indexOf('data-diagonal');
    expect(label, 'the label persists').toBeGreaterThan(-1);
    expect(diagonal, 'the diagonal follows the label').toBeGreaterThan(label);
    const el = /<div[^>]*data-diagonal[^>]*>/.exec(cell)?.[0] ?? '';
    expect(el, 'not the whole cell').not.toMatch(/inset-0/);
    expect(el, 'in the body box, filling it').toMatch(/flex-1/);
  });
});

/**
 * §35: "The About's quarter-circle is withdrawn: a mark drawn on one record
 * in seventeen is not part of the page's composition." The cell holds the
 * About; where there is none, the latest journal entry; where there is
 * neither, absence -- and no arc in any of the three.
 */
describe('§35: the About cell carries no quarter-circle in any state', () => {
  const entry = { entry: 'Played it right through.', entryDate: '2026-09-20' };
  it.each([
    ['an About', { about: 'Her last album for the label.', journalEntry: null }],
    ['a journal entry', { about: null, journalEntry: entry }],
    ['neither', { about: null, journalEntry: null }],
  ])('with %s', (_state, fields) => {
    /* Provenance populated, so its plane is the control for 'withdrawn' meaning this mark and not all planes. */
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), purchasePrice: '12.99', ...fields }} />);
    expect(html, 'aboutArc is withdrawn (§35)').not.toContain('data-mark="aboutArc"');
    expect(html, 'the provenance plane is untouched by the withdrawal').toContain('data-mark="provenanceArc"');
  });
});

/**
 * §35: "The same rule governs every cell that can be empty -- provenance,
 * matrix, market." Absence is drawn in flow after the label, filling what
 * the cell has left; never positioned over the cell. This guards the rule
 * on the three cells whose real emptiness is not yet in the data file: it
 * passes today because EmptyMark is shared, and it is here so that a
 * per-cell regression cannot pass unseen.
 */
describe('§35: absence in flow after the label in every cell that can be empty', () => {
  it('provenance, matrix and market draw the diagonal after their label, filling the body', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), purchasePrice: null, storeName: null, conditionMedia: null, conditionSleeve: null, matrixRunout: null, marketMedian: null, marketLow: null, marketHigh: null, hasDiscogsRelease: false }} />);
    for (const [cell, label] of [['provenance', 'Provenance'], ['matrix', 'Matrix / runout'], ['market', 'Market median']] as const) {
      const start = html.indexOf(`data-cell="${cell}"`);
      expect(start, `${cell} renders`).toBeGreaterThan(-1);
      const body = html.slice(start, html.indexOf('data-cell=', start + 1));
      const at = body.indexOf(`>${label}<`);
      const diagonal = /<div[^>]*data-diagonal[^>]*>/.exec(body);
      expect(at, `${cell}: the label persists`).toBeGreaterThan(-1);
      expect(diagonal, `${cell}: the diagonal is drawn`).not.toBeNull();
      expect(diagonal?.index ?? -1, `${cell}: after the label`).toBeGreaterThan(at);
      expect(diagonal?.[0] ?? '', `${cell}: in flow, filling the body, never over the cell`).toMatch(/flex-1/);
      expect(diagonal?.[0] ?? '', `${cell}: not inset-0`).not.toMatch(/inset-0/);
    }
  });
});
