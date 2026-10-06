import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { RecordPage8a, type PageRecord } from './RecordPage8a';
import { BANDS } from './band-geometry';
import { STRIP_SPLIT } from './cover-33';
import { recordLadder } from '@/lib/colour/record-ladder';
import { construction } from './construction';
import { fieldCapFor } from './ink';
import { STEP_GAP } from './title-steps';

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
  aboutEditedAt: null,
  about: null,
  imageCount: 0,
  earlierCovers: 0,
  coverUrl: null,
  backUrl: null,
  spineColour,
});

/** The year cell's markup, cut at the next cell. */
function yearCell(html: string): string {
  const start = elementIndex(html, 'year');
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
/** Where the ELEMENT carrying data-cell="name" starts -- never the stylesheet's selector for it, which precedes every element and is written [data-cell="name"]. */
function elementIndex(html: string, name: string): number {
  const m = new RegExp(`(?<!\\[)data-cell="${name}"`).exec(html);
  return m === null ? -1 : m.index;
}

function lastCell(html: string): string {
  const start = elementIndex(html, 'note');
  expect(start, 'the last cell renders').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('data-cell=', start + 1) === -1 ? undefined : html.indexOf('data-cell=', start + 1));
}

describe('§48: the identity is 520 from 960 to 1439 and the construction takes the rest; the cover row splits at 520 (step 56; §41\'s half-page withdrawn)', () => {
  it('states half-the-page tracks in the 8-column block, and keeps one 480 track below 960', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null) }} />);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const eight = style.slice(style.indexOf('@media (max-width: 1439px)'), style.indexOf('@media (max-width: 959px)'));
    expect(eight, 'the identity track is 520 and the construction takes the rest (§48)').toMatch(/\[data-band="identity"\]\s*\{[^}]*grid-template-columns:\s*520px 1fr/);
    expect(eight, 'no half-page track in that range (41/identity-half-page)').not.toMatch(/repeat\(2,\s*50%\)/);
    /* §48: the extra 40 of cell goes to padding, 38 a side, so the measure stays 443; vertical padding stays 18. */
    /* §49 (step 57): the padding absorbs whatever the cell has beyond the measure, from 960 up -- 38 at a 520 cell, 18 at 480, about 58 at 1679 -- as one rule, not a figure per range. */
    expect(eight, 'the identity content\'s padding is the cell beyond the measure, halved').toMatch(/\[data-cell="identity-content"\]\s*\{[^}]*padding-left:\s*calc\(\(100% - 443px\) \/ 2\)[^}]*padding-right:\s*calc\(\(100% - 443px\) \/ 2\)/);
    expect(style, 'and no block types 38px').not.toMatch(/padding-left:\s*38px/);
    /* §42 (step 48): the row takes the viewport's height as §40 rules above the fork, never less than 547 (41/band-stays-547). */
    expect(eight, 'each row is max(546, 60.7778vh - 1)').toMatch(/grid-auto-rows:\s*max\(546px,\s*calc\(60\.7778vh - 1px\)\)/);
    expect(eight, 'and the band two such rows').toMatch(/height:\s*max\(1094px,\s*calc\(2 \* 60\.7778vh\)\)/);
    /* §45 (step 53): the track is never pinned; the ladder's supply is the rendered track. A negative assertion, because the pin sat here through every green run. */
    expect(style, 'no stylesheet block pins the identity track (42/supply-stays-510, 40/supply-held-510)').not.toMatch(/--identity-track:\s*\d/);
    const four = style.slice(style.indexOf('@media (max-width: 959px)'), style.indexOf('@media (max-width: 479px)'));
    /* §44 (step 52): from 480 to 959 the identity keeps 480 and the air takes the rest of its row; the construction and the cover take their rows. */
    expect(four, 'a 480 track and the rest of the row').toMatch(/\[data-band="identity"\]\s*\{[^}]*grid-template-columns:\s*480px 1fr/);
    expect(four, 'the air shows beside the identity').toMatch(/\[data-upper-air\]\s*\{[^}]*display:\s*block/);
    expect(four, 'the construction takes its row').toMatch(/\[data-cell="still"\]\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(four, 'and so does the cover').toMatch(/\[data-cell="sleeve"\]\s*\{[^}]*grid-column:\s*1 \/ -1/);
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
    /* §43 (step 51): the server states the packing per width; no packer measures after paint. */
    expect(html, 'no after-paint packer').not.toContain('data-record-band-packer');
    expect(style, 'the server states each cell’s quarters per width range').toMatch(/@media \(min-width: 960px\) and \(max-width: \d+px\) \{[\s\S]*?\[data-band="record"\] > \[data-cell="provenance"\] \{ --packed: [1-4];/);
    expect(style, 'and covers the range to 1439').toMatch(/\(max-width: 1439px\)/);
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
      const start = elementIndex(html, cell);
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
 * **§53 (step 60a): the About cell is the About's only place.** "At rest the
 * cell carries four things, in this order: the ABOUT label, the scrolling
 * prose, one line of controls, and the IMAGES row at its foot. The control
 * line is the by-line's short form, 'Written by Claude', then Edit, Delete
 * and Write a new one, in the 11px mono the label uses. The by-line's
 * qualifier moves to a hover title on it... Where no About exists the
 * absence state carries Write one as the button itself. Where writing is
 * not configured it carries no control." The lower row is the route's
 * (60b); what this holds is the cell's markup.
 */
describe('§53: the About cell carries its control line, and the absence state its Write one button', () => {
  const none = { about: null, aboutEditedAt: null, journalEntry: null };
  const generated = { about: 'A long About, written by the model.', aboutEditedAt: null, journalEntry: null };
  const edited = { about: 'My own words.', aboutEditedAt: '2026-09-30T10:00:00.000Z', journalEntry: null };
  const controlsOf = (cell: string) => /<div[^>]*data-field="about-controls"[^>]*>[\s\S]*?<\/div>/.exec(cell)?.[0] ?? '';

  it('puts the control line after the prose region and before the IMAGES foot, in the label’s style', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...generated }} writingConfigured />));
    const controls = controlsOf(cell);
    expect(controls, 'a control line').not.toBe('');
    expect(cell.indexOf('data-field="about-controls"'), 'after the prose region').toBeGreaterThan(cell.indexOf('data-field="about"'));
    expect(cell.indexOf('data-field="about-controls"'), 'before the IMAGES foot').toBeLessThan(cell.indexOf('data-field="images-foot"'));
    expect(cell.indexOf('data-field="images-foot"'), 'the foot is there to be before').toBeGreaterThan(-1);
    expect(controls, 'the 11px mono the label uses').toMatch(/font-mono/);
    expect(controls).toMatch(/uppercase/);
  });

  it('names a generated About “Written by Claude”, then Edit, Delete and Write a new one, with no sentence and no title in the resting line', () => {
    const controls = controlsOf(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...generated }} writingConfigured />)));
    expect(controls).toMatch(/<span[^>]*data-testid="snippet-generated-label"[^>]*>Written by Claude<\/span>/);
    expect(controls).toMatch(/<button[^>]*data-testid="snippet-edit"[^>]*>Edit<\/button>/);
    expect(controls).toMatch(/<button[^>]*data-testid="snippet-delete"[^>]*>Delete<\/button>/);
    expect(controls).toMatch(/<button[^>]*data-testid="snippet-generate"[^>]*>Write a new one<\/button>/);
    /* §53, corrected: "the sentence is not in the resting control line beside Write a new one" -- it cost a row and did the least work there. */
    expect(controls, 'no sentence in the resting line').not.toContain('about-qualifier');
    expect(controls, 'never a title attribute').not.toContain('title=');
  });

  it('names an edited About “Your own note”, with no sentence and no title', () => {
    const controls = controlsOf(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...edited }} writingConfigured />)));
    expect(controls).toMatch(/<span[^>]*data-testid="snippet-yours"[^>]*>Your own note<\/span>/);
    expect(controls).not.toContain('title=');
    expect(controls).not.toContain('snippet-generated-label');
    expect(controls).not.toContain('about-qualifier');
  });

  it('carries no Write a new one where writing is not configured, and no message about it', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...generated }} />));
    expect(controlsOf(cell)).toContain('snippet-edit');
    expect(controlsOf(cell)).toContain('snippet-delete');
    expect(cell).not.toContain('data-testid="snippet-generate"');
    expect(cell, 'the sentence belongs to the generate control, so it goes with it').not.toContain('about-qualifier');
    expect(cell).not.toContain('not configured');
  });

  it('serves no textarea at rest: editing is a state the reader enters', () => {
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...generated }} writingConfigured />))).not.toContain('<textarea');
  });

  it('carries Write one as a button below the label, ahead of the diagonal, where no About exists and writing is configured', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} writingConfigured />));
    const button = /<button[^>]*data-field="about-write"[^>]*>Write one<\/button>/.exec(cell)?.[0] ?? '';
    expect(button, 'the button itself, not a link').not.toBe('');
    expect(cell).not.toMatch(/<a[^>]*about-write/);
    expect(cell).not.toContain('Write one ↓');
    expect(cell.indexOf('data-field="about-write"'), 'below the label').toBeGreaterThan(cell.indexOf('>About<'));
    expect(cell.indexOf('data-field="about-write"'), 'ahead of the diagonal').toBeLessThan(cell.indexOf('data-diagonal'));
    expect(cell, 'the diagonal stays').toContain('data-diagonal');
    /* §53: the qualifier beside Write one, visibly. */
    expect(cell).toMatch(/about-write"[^>]*>Write one<\/button>[^<]*<span[^>]*data-field="about-qualifier"[^>]*>about the music, not a fact this app checked<\/span>/);
    expect(cell).not.toContain('title=');
  });

  it('carries Write one in the entry state too: an entry is not an About, and the row that offered one is gone', () => {
    const cell = lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), about: null, aboutEditedAt: null, journalEntry: { entry: 'Played.', entryDate: '2026-09-20' } }} writingConfigured />));
    expect(cell).toContain('data-field="about-write"');
    expect(cell, 'the entry still shows').toContain('Played.');
  });

  it('carries no Write one where writing is not configured, and none where an About exists', () => {
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} writingConfigured={false} />))).not.toContain('about-write');
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...none }} />)), 'unconfigured by default').not.toContain('about-write');
    expect(lastCell(renderToStaticMarkup(<RecordPage8a record={{ ...record(null), ...generated }} writingConfigured />))).not.toContain('about-write');
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
    const sleeve = elementIndex(html, 'sleeve');
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

/**
 * **§45 (step 53b): the leftover between the title and the pressing block
 * takes the tint step as a field.** "The title is the largest that fits, and
 * the height it leaves takes the tint step as a field across the cell, between
 * the title and the pressing block." Provisional until a capture; the markup
 * is what this holds. A record with no ladder (no spine colour) draws none,
 * as it draws no other tint mark.
 */
describe('§45: the identity cell’s leftover is a tint field', () => {
  const trackOf = (html: string) => {
    const start = html.indexOf('data-track="content"');
    const end = html.indexOf('data-block="pressing"', start);
    return { start, end, between: html.slice(start, end) };
  };

  it('draws the field between the title block and the pressing block, in the ladder’s tint', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={record('#a25829')} />);
    const { start, end, between } = trackOf(html);
    expect(start, 'the content track').toBeGreaterThan(-1);
    expect(end, 'the pressing block follows it').toBeGreaterThan(start);
    const field = /<div[^>]*data-mark="identityField"[^>]*>/.exec(between)?.[0];
    expect(field, 'a tint field sits between the two blocks').toBeDefined();
    expect(between.indexOf('data-block="title"'), 'after the title block').toBeLessThan(between.indexOf('data-mark="identityField"'));
    const tint = recordLadder('#a25829')?.tint;
    expect(tint).toBeDefined();
    expect(field, 'filled with the record’s tint step').toContain(`background:${tint}`);
    /* The paint sits inside a ground wrapper that the genres run's demand skips and assistive tech never sees; the paint itself is inset by the ladder's gap. */
    const ground = /<div[^>]*data-ground=""[^>]*>/.exec(between)?.[0];
    expect(ground, 'inside a ground wrapper').toBeDefined();
    expect(ground, 'ground, not content: hidden from assistive tech').toContain('aria-hidden="true"');
    /* §49: sized by TitleStep after the pair is chosen -- anchored to the pressing block, bounded by the title stack and the artist's line -- so the server sends it at no height, pending. */
    expect(field, 'served pending, at no height, until the ladder sizes it').toContain('data-field-state="pending"');
    expect(field).toContain('height:0');
  });

  /**
   * §51 (step 59): "the tint field starts 24 below the artist's last line,
   * the ladder's own gap, so the height left over when a cap binds falls
   * between the field and the pressing block, not between the type and the
   * field." The ground wrapper begins at the title block's end, so the paint
   * is placed from the wrapper's top by STEP_GAP, and no longer from its
   * bottom.
   */
  it('places the field 24 from the ground’s top, the ladder’s gap, not against the pressing block (§51)', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={record('#a25829')} />);
    const field = /<div[^>]*data-mark="identityField"[^>]*>/.exec(trackOf(html).between)?.[0];
    expect(field).toBeDefined();
    expect(field, 'from the top, by the ladder’s gap').toContain(`top:${STEP_GAP}px`);
    expect(field, 'not from the bottom').not.toMatch(/bottom-0|bottom:0/);
  });

  /**
   * §50/§52 (step 58): the cap is a property of the record's construction,
   * computed on the server from the same scene the still draws, and served on
   * the field so the client sizes against it without rasterising anything.
   */
  it('serves the field’s ink cap, computed from the record’s own construction (§52)', () => {
    const r = record('#a25829');
    const html = renderToStaticMarkup(<RecordPage8a record={r} />);
    const field = /<div[^>]*data-mark="identityField"[^>]*>/.exec(trackOf(html).between)?.[0];
    expect(field).toBeDefined();
    const cap = fieldCapFor(construction(r.id));
    expect(cap).toBeGreaterThan(0);
    /* Three decimals: served to one, the cap rounded UP by 0.05 on the records it bound and the floored field still exceeded the ink (found in the §50 spec, 30 Sep). */
    expect(field, 'the cap the server computed').toContain(`data-field-cap="${cap.toFixed(3)}"`);
  });

  it('draws no field when the record has no ladder', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={record(null)} />);
    expect(trackOf(html).between).not.toContain('identityField');
  });
});

/**
 * **§54 (step 62): the record with no cover is ink, flat.** "Every one of
 * §5.1's marks is ink, flat and at full strength... The 0.55 alpha goes, and
 * so does every opacity on this record: the Plane's fallback of ink at 0.14
 * too." The still's disc and base-step faces were at ink 0.55 and the
 * provenance arc at ink 0.14, two opacity variants §5.5 does not have; the
 * upper air's triangle was not drawn at all.
 */
describe('§54: the record with no cover is ink, flat, at full strength', () => {
  /* A provenance, as the real record has, so §5.1's arc is served and can be asserted on. */
  const html = renderToStaticMarkup(<RecordPage8a record={{ ...record(null), conditionMedia: 'VG', conditionSleeve: 'G+' }} />);
  it('serves no opacity variant of ink anywhere on the page, the still’s shadow footprints aside', () => {
    expect(html).not.toContain('0.19 0.008 60 / 0.55');
    expect(html).not.toContain('0.19 0.008 60 / 0.14');
    /* The footprints under the forms are ink at 0.05, 0.09 and 0.2 on EVERY record -- a drawing device, not one of §5.1's marks -- so they are set aside here and reported to Design with step 62. */
    const withoutFootprints = html.replace(/<polygon(?![^>]*data-face)[^>]*>/g, '');
    expect(withoutFootprints, 'no ink at any alpha').not.toMatch(/oklch\(0\.19 0\.008 60 \/ /);
  });
  it('draws the still’s disc and base-step faces at ink', () => {
    const still = /<svg[^>]*data-testid="construction-still"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    expect(still).not.toBe('');
    expect(still).toMatch(/data-mark="disc"[^>]*fill="oklch\(0\.19 0\.008 60\)"/);
    for (const face of still.matchAll(/<polygon[^>]*data-step="base"[^>]*fill="([^"]+)"/g)) expect(face[1], 'a base-step face').toBe('oklch(0.19 0.008 60)');
    for (const face of still.matchAll(/<polygon[^>]*data-step="grey"[^>]*fill="([^"]+)"/g)) expect(face[1], 'a grey face keeps its neutral').toBe('oklch(0.74 0.004 80)');
  });
  it('draws the corner triangle in the upper air without a ladder, at ink', () => {
    const air = /<div[^>]*data-upper-air[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? '';
    expect(air).toContain('data-flat="triangle"');
    expect(air).toContain('background:oklch(0.19 0.008 60)');
  });
  it('gives the provenance arc ink, not ink at 0.14', () => {
    const arc = /<div[^>]*data-mark="provenanceArc"[^>]*>/.exec(html)?.[0] ?? '';
    expect(arc, 'the arc is served (its covers-type rule decides at render whether it shows)').not.toBe('');
    expect(arc).toContain('background:oklch(0.19 0.008 60)');
  });
  it('gives the cover cell paper for its ground, since there is no tint step to take -- a reading of §40 for Design, not a sentence of §54', () => {
    expect(html).toMatch(/--sleeve-tint:oklch\(0\.925 0\.004 80\)/);
  });
});

describe('§49: the measure is 443 at every width from 480 up (step 57)', () => {
  it('states the padding rule above the fork too, so the stretch between column counts goes to padding', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={record(null)} />);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const above = style.slice(style.indexOf('@media (min-width: 1440px)'));
    expect(above, 'from 1440 up the identity content is padded to the measure').toMatch(/\[data-cell="identity-content"\]\s*\{[^}]*padding-left:\s*calc\(\(100% - 443px\) \/ 2\)/);
  });
});

/**
 * §62 (step 73): the line reads the count of what the page shows, then names
 * the covers it does not show "as '· N earlier covers', still before Manage".
 * "Bitches Brew then reads Images 2 · 3 earlier covers · Manage. A record
 * that holds only what it shows carries no clause."
 */
describe('§62: the Images line counts what the page shows and names earlier covers before Manage', () => {
  const lineOf = (html: string) => {
    const at = html.indexOf('data-field="images-line"');
    expect(at, 'the Images line renders').toBeGreaterThan(-1);
    const inner = html.slice(html.indexOf('>', at) + 1, html.indexOf('</div>', at));
    return inner.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  };

  /* Fails against the earlier-covers clause in RecordPage8a's Images line. */
  it('reads “Images 2 · 3 earlier covers · Manage →” on a record showing two and holding three more covers', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#95484a'), imageCount: 2, earlierCovers: 3 }} />);
    expect(lineOf(html)).toBe('Images 2 · 3 earlier covers · Manage →');
  });

  /* Fails against the clause's condition: at zero the line is the one §53 placed, with no separator left behind. */
  it('carries no clause and no separator where the record holds only what it shows', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#95484a'), imageCount: 1, earlierCovers: 0 }} />);
    expect(lineOf(html)).toBe('Images 1 Manage →');
    expect(html).not.toContain('data-field="earlier-covers"');
  });

  /* Fails against the plural: one earlier cover is "1 earlier cover". A reading for Design -- §62 writes the plural form only. */
  it('says “1 earlier cover” for one', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#95484a'), imageCount: 1, earlierCovers: 1 }} />);
    expect(lineOf(html)).toBe('Images 1 · 1 earlier cover · Manage →');
  });

  /* Fails against the link: the clause sits before Manage and is not part of it. */
  it('keeps Manage as the link, with the clause outside it', () => {
    const html = renderToStaticMarkup(<RecordPage8a record={{ ...record('#95484a'), imageCount: 2, earlierCovers: 3 }} />);
    const link = /<a href="#images"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? '';
    expect(link.replace(/<!-- -->/g, '').trim()).toBe('Manage →');
  });
});
