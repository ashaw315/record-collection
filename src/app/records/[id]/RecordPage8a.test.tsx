import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { RecordPage8a, type PageRecord } from './RecordPage8a';
import { BANDS } from './band-geometry';
import { STRIP_SPLIT } from './cover-33';

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

describe('§33, §39, §40: the cover is the largest square its cell holds, at every breakpoint', () => {
  /*
    The sleeve's marks were absolute pixels inside a 480 × 546 wrapper, so
    the square was 480 wherever the cell was, and the strip beneath it a
    fixed 66. Steps 44 and 45 give the geometry per breakpoint: the cell is
    a size container, the square is min(100cqw, 100cqh), and the bar and
    block fill whatever the square leaves -- beside it where the cell is
    wider than tall, beneath it where it is taller. No element carries a
    pixel of geometry inline, so no breakpoint can be beaten by one.
  */
  it('carries no inline geometry on the square, the bar or the block', () => {
    for (const coverUrl of [null, 'https://c/x.jpg']) {
      const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl }} />);
      const cover = /<(?:img|div)[^>]*(?:data-cover|data-mark="coverFrame")[^>]*>/.exec(html)?.[0] ?? '';
      const bar = /<div[^>]*data-mark="sleeveBar"[^>]*>/.exec(html)?.[0] ?? '';
      const block = /<div[^>]*data-mark="sleeveBlock"[^>]*>/.exec(html)?.[0] ?? '';
      expect(cover, `cover=${coverUrl}: drawn`).not.toBe('');
      for (const [name, tag] of [['cover', cover], ['bar', bar], ['block', block]] as const) {
        expect(tag, `${name}: no inline left/top/width/height`).not.toMatch(/style="[^"]*(?:left|top|width|height):/);
      }
      expect(bar, 'the bar keeps its colour inline: it is the record’s').toMatch(/background/);
      expect(block, 'the block keeps its ink inline').toMatch(/background/);
    }
  });

  it('states the geometry in the stylesheet, in the cell’s own units', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), coverUrl: 'https://c/x.jpg' }} />);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style, 'the sleeve cell is a size container').toMatch(/\[data-cell="sleeve"\][^{]*\{[^}]*container-type:\s*size/);
    expect(style, 'the square is the largest the cell holds').toMatch(/min\(100cqw,\s*100cqh\)/);
    expect(style, 'the strip stands beside a wide cell').toMatch(/@container[^{]*min-aspect-ratio/);
    expect(style, 'and lies beneath a tall one').toMatch(/@container[^{]*max-aspect-ratio/);
    expect(style, 'the bar takes §23’s share along the strip').toContain(`${STRIP_SPLIT.bar}`);
  });

  it('gives the sleeve the ladder’s tint as ground above the fork, for any paper the marks leave (§40)', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#a25829'), coverUrl: 'https://c/x.jpg' }} />);
    const sleeve = /<div[^>]*data-cell="sleeve"[^>]*>/.exec(html)?.[0] ?? '';
    expect(sleeve, 'the tint travels on the cell as a variable').toMatch(/--sleeve-tint:/);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style, 'and is painted as the cell’s ground above the fork only').toMatch(/@media \(min-width: 1440px\)[\s\S]*\[data-cell="sleeve"\]\s*\{[^}]*background:\s*var\(--sleeve-tint\)/);
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

describe('§41: the upper tracks from 960 to 1439 are half the page (step 46)', () => {
  it('states half-the-page tracks in the 8-column block, and keeps one 480 track below 960', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null) }} />);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const eight = style.slice(style.indexOf('@media (max-width: 1439px)'), style.indexOf('@media (max-width: 959px)'));
    expect(eight, 'each upper track is half the page').toMatch(/\[data-band="identity"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*50%\)/);
    expect(eight, 'no 480 track in that range (28/band-pinned-547)').not.toMatch(/repeat\(2,\s*480px\)/);
    /* §42 (step 48): the row takes the viewport's height as §40 rules above the fork, never less than 547 (41/band-stays-547). */
    expect(eight, 'each row is max(546, 60.7778vh - 1)').toMatch(/grid-auto-rows:\s*max\(546px,\s*calc\(60\.7778vh - 1px\)\)/);
    expect(eight, 'and the band two such rows').toMatch(/height:\s*max\(1094px,\s*calc\(2 \* 60\.7778vh\)\)/);
    expect(eight, 'the identity track stays the ladder’s 510 (§42)').toMatch(/\[data-cell="identity-content"\]\s*\{[^}]*--identity-track:\s*510px/);
    const four = style.slice(style.indexOf('@media (max-width: 959px)'), style.indexOf('@media (max-width: 479px)'));
    expect(four, 'below 960 the one 480 track stands').toMatch(/grid-template-columns:\s*480px/);
  });
});

describe('§41: the record band packed by content from 960 to 1439 (step 47)', () => {
  it('lays four quarter tracks in the 8-column block, each cell spanning what the client measured, and one column below 960', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null) }} />);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const eight = style.slice(style.indexOf('@media (max-width: 1439px)'), style.indexOf('@media (max-width: 959px)'));
    expect(eight, 'four quarters of the band').toMatch(/\[data-band="record"\]\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/);
    expect(eight, 'each cell spans the quarters the client measured; a whole row until it has').toMatch(/\[data-band="record"\]\s*>\s*\[data-cell\]\s*\{[^}]*grid-column:\s*span var\(--packed,\s*4\)/);
    const four = style.slice(style.indexOf('@media (max-width: 959px)'), style.indexOf('@media (max-width: 479px)'));
    expect(four, 'below 960 the one column stands (§41)').toMatch(/\[data-band="record"\]\s*>\s*\[data-cell\]\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(html, 'the packer is in the band').toContain('data-record-band-packer');
  });
});

describe('the frame’s last cell is the About, else the entry, else the diagonal (§33)', () => {
  const entry = { entry: 'Played it right through.', entryDate: '2026-09-20' };

  it('shows the About under an ABOUT label, ahead of any entry', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: 'Her last album for the label.', journalEntry: entry }} />));
    expect(cell).toContain('>About<');
    expect(cell).toContain('Her last album for the label.');
    expect(cell, 'the entry yields to the About').not.toContain('Played it right through.');
    expect(cell, 'no diagonal').not.toContain('data-diagonal');
  });

  it('falls to the latest entry, date and text, still under the ABOUT label (§33: labelled ABOUT in every state)', () => {
    /* §33 and §35 label the cell ABOUT and name no second label; the build relabelled it JOURNAL in the entry state. */
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, journalEntry: entry }} />));
    expect(cell).toContain('>About<');
    expect(cell, 'no second label').not.toContain('>Journal<');
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
   * §42 (step 50): "An About longer than its cell scrolls inside the cell;
   * there is no clamp and no more link... The text region is focusable and
   * labelled 'About this record', so a keyboard can scroll it." §33's nine
   * lines and more ↓ are withdrawn (33/more-link).
   */
  it('renders the About whole in a focusable, labelled region that scrolls, with no clamp and no more link', () => {
    for (const about of ['Short.', 'A sentence about the record that goes on. '.repeat(20)]) {
      const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about, journalEntry: null }} />));
      const region = /<div[^>]*data-field="about"[^>]*>/.exec(cell)?.[0] ?? '';
      expect(region, 'the text region').not.toBe('');
      expect(region, 'focusable').toMatch(/tabindex="0"/);
      expect(region, 'labelled').toMatch(/aria-label="About this record"/);
      expect(region, 'a region').toMatch(/role="region"/);
      expect(cell, 'no clamp').not.toMatch(/data-clamped|-webkit-line-clamp/);
      expect(cell, 'no more link').not.toContain('more ↓');
      expect(cell, 'no anchor to the row from the cell').not.toContain('href="#snippet"');
    }
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

/**
 * §36: "on the twelve records with neither About nor entry, the label and
 * §6's diagonal stay, and below the label sits 'Write one ↓', a link to the
 * row in the same vocabulary as 'more ↓'. It is a link, not a button...
 * Where writing is not configured, the absence state carries no link."
 */
describe('§36: the absence state offers the row, only where writing is configured', () => {
  const none = { about: null, journalEntry: null };
  it('links "Write one ↓" to the row below the label, ahead of the diagonal, when configured', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} writingConfigured />));
    const link = /<a[^>]*data-field="about-write"[^>]*>/.exec(cell)?.[0] ?? '';
    expect(link, 'a link, not a button').not.toBe('');
    expect(link).toMatch(/href="#snippet"/);
    expect(cell).toContain('Write one ↓');
    expect(cell.indexOf('data-field="about-write"'), 'below the label').toBeGreaterThan(cell.indexOf('>About<'));
    expect(cell.indexOf('data-field="about-write"'), 'ahead of the diagonal').toBeLessThan(cell.indexOf('data-diagonal'));
    expect(cell, 'the diagonal stays').toContain('data-diagonal');
    expect(cell, 'no button in the frame cell').not.toMatch(/<button/);
  });
  it('carries no link when writing is not configured, and none in the About or entry states', () => {
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} writingConfigured={false} />))).not.toContain('about-write');
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} />)), 'unconfigured by default').not.toContain('about-write');
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: 'Short.', journalEntry: null }} writingConfigured />))).not.toContain('about-write');
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, journalEntry: { entry: 'Played.', entryDate: '2026-09-20' } }} writingConfigured />))).not.toContain('about-write');
  });
});

/**
 * §37, step 40: "Give the upper air at eight columns a `[data-section]` so
 * §21, §25 and §29 resolve against it. Draw no figure there; the first
 * figure stays in the lower region... Move the region's tint triangle up at
 * eight columns rather than drawing both." The markup carries the air cell
 * at every width -- the fork stylesheet shows it from 960 to 1439 only.
 */
describe('§37: the upper band’s air at 8 columns is a section carrying the tint field and no figure', () => {
  it('renders the air cell after the sleeve, as a section, with the tint triangle and no figure', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#a25829') }} />);
    /* The ELEMENTS, not the stylesheet's selectors for them, which precede everything: `[data-cell="sleeve"]` and `[data-band="record"]` both appear in the <style> first. */
    const sleeve = html.indexOf('data-cell="sleeve" class');
    const air = html.indexOf('data-upper-air=""');
    const recordBand = html.indexOf('data-band="record" class');
    expect(air, 'the upper air cell renders').toBeGreaterThan(-1);
    expect(air, 'after the sleeve').toBeGreaterThan(sleeve);
    expect(recordBand, 'the record band element').toBeGreaterThan(air);
    const cell = html.slice(air, recordBand);
    const tag = html.slice(html.lastIndexOf('<div', air), html.indexOf('>', air));
    expect(tag, 'a section, so §21, §25 and §29 resolve against it').toContain('data-section="upper-air"');
    expect(cell, 'no figure: the construction is the only figure above the fold').not.toMatch(/data-ornament="figure"/);
    expect(cell, 'the tint triangle, moved up').toMatch(/data-ornament="flat"[^>]*data-flat="triangle"/);
  });
});
