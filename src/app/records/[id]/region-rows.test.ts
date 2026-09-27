import { describe, expect, it } from 'vitest';
import { SECTIONS } from './extended-grid';
import {
  AIR_MIN,
  COLUMNS_AT,
  FIGURE_PLACES,
  REGION_ROWS,
  WIDTHS,
  BAND_AT_REFERENCE,
  COLUMN_MIN,
  PAGE_CEILING,
  airOf,
  figurePlacement,
  widePageStylesheet,
  wideRowsAt,
  bandHeightAt,
  constructionScaleAt,
  pageWidthAt,
  upperSpansAt,
  airPlacement,
  columnWidthAt,
  columnsFor,
  upperAirAt,
  upperRowsAt,
  placeRow,
  placementOf,
  regionStylesheet,
  rowOf,
  airRow,
  rowsAt,
  type RegionWidth,
} from './region-rows';

/**
 * §26's five rows and §28's groupings at every width.
 *
 * **§28's list governs over its drawing at every width** (Adam's ruling, and
 * §28 says so itself: "Where the drawing disagrees, this list governs"). So
 * the table is the section's list, transcribed row by row, and the drawing is
 * not consulted.
 *
 * Row 1 Pressing detail + air: 7 + 5 at 12, 8 at 8 (air moves up beside the
 * third upper cell), 4 at 4, 1 at one column. Row 2 three sections:
 * 4/4/4 · 3/3/2 · three rows of 4 · three rows of 1. Row 3 one section:
 * 12 · 8 · 4 · 1. Row 4 two sections: 6/6 · 4/4 · 2/2 kept side by side ·
 * two rows of 1. Row 5 air + one section: 3+9 · 3+5 air first · 4 with the
 * air dropped (under 240) · 1.
 */

describe('§28’s groupings, transcribed from the section’s list', () => {
  it('runs the eight sections in §9’s order, in five rows, with no section twice or missing', () => {
    const ordered = REGION_ROWS.flatMap((row) => row.sections);
    expect(ordered, 'every §9 section appears once, in order').toEqual([...SECTIONS]);
  });

  it('gives each width the column count §28 derives from a measurement', () => {
    expect(COLUMNS_AT).toEqual({ 1440: 12, 960: 8, 480: 4, 390: 1 });
    /* Derived, not device widths: 8 × 120 seats two 480 cells; 4 × 120 is one. */
    expect(columnsFor(1440)).toBe(12);
    expect(columnsFor(1679), 'holds to 1679; §30 rules from 1680').toBe(12);
    expect(columnsFor(1200)).toBe(8);
    expect(columnsFor(960)).toBe(8);
    expect(columnsFor(600)).toBe(4);
    expect(columnsFor(480)).toBe(4);
    expect(columnsFor(479), 'below 480 one fluid column').toBe(1);
    expect(columnsFor(390)).toBe(1);
  });

  it('lays every row to §28’s spans, at each of the four widths', () => {
    const spansAt = (width: RegionWidth) => rowsAt(width).map((row) => row.items.map((item) => item.span));

    expect(spansAt(1440), '7+5 · 4/4/4 · 12 · 6/6 · 3+9').toEqual([[7, 5], [4, 4, 4], [12], [6, 6], [3, 9]]);
    expect(spansAt(960), '8 · 3/3/2 · 8 · 4/4 · 3+5').toEqual([[8], [3, 3, 2], [8], [4, 4], [3, 5]]);
    /* At 4 the rows that cannot sit side by side stack, apart from row 4's pair. */
    expect(spansAt(480), 'row 2 stacks three, row 4 keeps its pair, row 5 drops its air').toEqual([[4], [4], [4], [4], [4], [2, 2], [4]]);
    expect(spansAt(390), 'one fluid column throughout').toEqual([[1], [1], [1], [1], [1], [1], [1], [1]]);
  });

  it('counts the rows §28 states: five at 12 and 8, seven at 4, eight at one column', () => {
    expect(rowsAt(1440)).toHaveLength(5);
    expect(rowsAt(960)).toHaveLength(5);
    expect(rowsAt(480)).toHaveLength(7);
    expect(rowsAt(390)).toHaveLength(8);
  });

  it('every row fills its width exactly — no row short, none overflowing', () => {
    for (const width of WIDTHS) {
      for (const row of rowsAt(width)) {
        const total = row.items.reduce((sum, item) => sum + item.span, 0);
        expect(total, `${width}: row [${row.items.map((i) => i.kind).join(', ')}] fills ${COLUMNS_AT[width]}`).toBe(COLUMNS_AT[width]);
      }
    }
  });
});

describe('where the air is, and what it carries', () => {
  it('puts the air where §28 puts it: after row 1’s section, BEFORE row 5’s', () => {
    expect(airOf(1440, 'pressing-detail')?.side, 'row 1: section then air').toBe('after');
    expect(airOf(1440, 'journal')?.side, 'row 5 is air-first — it makes the left page edge').toBe('before');
  });

  it('keeps row 5 air-first at 8 columns, and drops it at 4 because it is under 240', () => {
    expect(airOf(960, 'journal')?.side).toBe('before');
    expect(airOf(960, 'journal')?.span).toBe(3);
    /* 3 of 8 columns at 960 is 360 — still air enough. At 4 columns nothing reaches 240. */
    expect(airOf(480, 'journal'), '§28: the air is dropped, being under 240').toBeUndefined();
    expect(airOf(390, 'journal')).toBeUndefined();
  });

  it('moves row 1’s air up beside the third upper cell at 8 columns, leaving row 1 full width', () => {
    expect(airOf(960, 'pressing-detail'), 'the air has left the lower region').toBeUndefined();
    expect(rowsAt(960)[0].items.map((i) => i.kind), 'row 1 is the section alone').toEqual(['section']);
  });

  it('requires 240 of air before a figure may sit in it, at every width', () => {
    expect(AIR_MIN, 'the width of a figure at 0.855 of a section’s height').toBe(240);
    for (const width of WIDTHS) {
      for (const row of rowsAt(width)) {
        for (const item of row.items) {
          if (item.kind !== 'air') continue;
          const px = (item.span / COLUMNS_AT[width]) * width;
          expect(px, `${width}: air of ${item.span} columns is ${Math.round(px)}px`).toBeGreaterThanOrEqual(AIR_MIN);
        }
      }
    }
  });
});

describe('the figures and flats §26 places, and where they may go', () => {
  it('names two figure places: Pressing detail’s air and Price history’s strip', () => {
    expect(FIGURE_PLACES).toEqual([
      { section: 'pressing-detail', place: 'air' },
      { section: 'price-history', place: 'strip' },
    ]);
  });

  it('gives the pair a host at 12 columns and none at 4, because the air is gone', () => {
    expect(placeRow(1440, 'pressing-detail').figure, 'the pair sits in the air beside Pressing detail').toBe('air');
    /* §28: below 960 the lower region is a document — one pair and one flat. */
    expect(placeRow(480, 'pressing-detail').figure, 'no air, no figure').toBeNull();
    expect(placeRow(390, 'pressing-detail').figure).toBeNull();
  });

  it('keeps the solo in Price history’s strip at every width, since a full-width row is air enough', () => {
    for (const width of WIDTHS) {
      expect(placeRow(width, 'price-history').figure, `${width}`).toBe('strip');
    }
  });

  it('leaves the other six sections without a figure at every width', () => {
    for (const width of WIDTHS) {
      for (const section of SECTIONS) {
        if (section === 'pressing-detail' || section === 'price-history') continue;
        expect(placeRow(width, section).figure, `${section} at ${width}`).toBeNull();
      }
    }
  });
});

describe('placement is derived from the section’s name, not passed in', () => {
  it('gives each section the span and start §28 puts it at, at 12 columns', () => {
    /*
      The region's rows are the authority, and a section knows its own name,
      so a caller cannot place a section where §26 does not. Seven call sites
      across six components pass nothing; this table is the only place spans
      are stated.
    */
    expect(placementOf(1440, 'pressing-detail')).toEqual({ start: 1, span: 7, endsRow: false });
    expect(placementOf(1440, 'acquisition')).toEqual({ start: 1, span: 4, endsRow: false });
    expect(placementOf(1440, 'tags')).toEqual({ start: 5, span: 4, endsRow: false });
    expect(placementOf(1440, 'market')).toEqual({ start: 9, span: 4, endsRow: true });
    expect(placementOf(1440, 'price-history')).toEqual({ start: 1, span: 12, endsRow: true });
    expect(placementOf(1440, 'images')).toEqual({ start: 1, span: 6, endsRow: false });
    expect(placementOf(1440, 'snippet')).toEqual({ start: 7, span: 6, endsRow: true });
    /* Row 5 is air-first: the journal starts at column 4, after 3 of air. */
    expect(placementOf(1440, 'journal')).toEqual({ start: 4, span: 9, endsRow: true });
  });

  it('marks a section as ending its row exactly when nothing follows it', () => {
    for (const width of WIDTHS) {
      for (const row of rowsAt(width)) {
        row.items.forEach((item, index) => {
          if (item.kind !== 'section') return;
          const last = index === row.items.length - 1;
          expect(placementOf(width, item.section).endsRow, `${item.section} at ${width}`).toBe(last);
        });
      }
    }
  });

  it('places the air columns too, so the region can render them without knowing the list', () => {
    expect(airPlacement(1440, 0), 'row 1: after the 7').toEqual({ start: 8, span: 5 });
    expect(airPlacement(1440, 4), 'row 5: before the 9, making the left page edge').toEqual({ start: 1, span: 3 });
    expect(airPlacement(1440, 1), 'row 2 has none').toBeNull();
  });
});

describe('rows are explicit, because a column placement alone does not pick a row', () => {
  it('gives each section the grid row its §26 row occupies', () => {
    expect(rowOf(1440, 'pressing-detail')).toBe(1);
    expect(rowOf(1440, 'acquisition')).toBe(2);
    expect(rowOf(1440, 'tags')).toBe(2);
    expect(rowOf(1440, 'market')).toBe(2);
    expect(rowOf(1440, 'price-history')).toBe(3);
    expect(rowOf(1440, 'images')).toBe(4);
    expect(rowOf(1440, 'snippet')).toBe(4);
    expect(rowOf(1440, 'journal')).toBe(5);
  });

  it('splits a row into several at the widths §28 stacks it, and numbers them in order', () => {
    /* At 4 columns row 2's three sections take a row each, so what follows moves down. */
    expect(rowOf(480, 'acquisition')).toBe(2);
    expect(rowOf(480, 'tags')).toBe(3);
    expect(rowOf(480, 'market')).toBe(4);
    expect(rowOf(480, 'price-history')).toBe(5);
    expect(rowOf(480, 'journal')).toBe(7);
  });

  it('puts an air column on the same row as the sections it sits beside', () => {
    expect(airRow(1440, 0), 'row 1’s air is on row 1, beside Pressing detail').toBe(1);
    expect(airRow(1440, 4), 'row 5’s air is on row 5, before Journal').toBe(5);
  });
});

describe('§28’s breakpoints: the column count is derived, and the region follows it', () => {
  it('never lets a column fall below 120, which is where every breakpoint comes from', () => {
    /*
      §28 derives all four from one measurement: the identity cell holds
      §4.2's 412 measure plus 34 of padding each side, which is 480, or four
      columns of 120. 8 × 120 seats two such cells; 4 × 120 seats one.
    */
    expect(COLUMN_MIN).toBe(120);
    for (const [viewport, columns] of [[1440, 12], [1200, 8], [960, 8], [700, 4], [480, 4]] as const) {
      expect(viewport / columns, `${viewport} over ${columns} columns`).toBeGreaterThanOrEqual(COLUMN_MIN);
    }
  });

  it('grows columns between breakpoints rather than centring a narrower page (§28, §30)', () => {
    /*
      "Between breakpoints, columns grow above 120 and never shrink below
      it." §30 states the same clause for above 1440 and names the build's
      centring as a divergence: at 1000 the page is 1000 wide on 8 columns of
      125, not 960 centred.
    */
    expect(columnWidthAt(960)).toBe(120);
    expect(columnWidthAt(1000)).toBe(125);
    expect(columnWidthAt(1439)).toBeCloseTo(1439 / 8, 5);
    expect(columnWidthAt(1440)).toBe(120);
    /*
      **Columns grow between 1440 and 1679 too.** §30 computes the floor at
      1679 × 1050 from "twelve columns, so the construction is four columns
      of 139.9" — 1679 ÷ 12. The build held the page at a flat 1440 through
      that range, which made a four-column cell 480 where §30 measures 559.7.
    */
    expect(columnWidthAt(1679)).toBeCloseTo(1679 / 12, 4);
    expect(columnWidthAt(1600)).toBeCloseTo(1600 / 12, 4);
    /* And never below the floor at any width the grid is defined for. */
    for (let w = 480; w <= 1440; w += 7) {
      expect(columnWidthAt(w), `${w}`).toBeGreaterThanOrEqual(COLUMN_MIN);
    }
  });

  it('keeps the upper cells at 480 and wraps them, rather than reshaping any (§28)', () => {
    /*
      "No upper cell reshapes: the construction's frame is fitted to a 480
      cell, and reshaping it moves §5.5's floor, so the cells wrap and extra
      width becomes air." At 8 columns two sit side by side and the third
      takes a second row.
    */
    expect(upperRowsAt(1440), 'three abreast').toEqual([['identity', 'still', 'sleeve']]);
    expect(upperRowsAt(960), 'two, then one with 480 of air beside it').toEqual([['identity', 'still'], ['sleeve']]);
    expect(upperRowsAt(480), 'stacked').toEqual([['identity'], ['still'], ['sleeve']]);
    expect(upperRowsAt(390), 'stacked below 480 too').toEqual([['identity'], ['still'], ['sleeve']]);
  });

  it('gives the third upper cell’s air the tint flat and NO figure, at 8 columns (§37)', () => {
    /*
      §37, step 40: "the upper air is a section, and carries no figure...
      The first figure stays in the lower region, drawn only if its air
      clears §28's 240px." §28's "that air carries the lower region's first
      figure" is withdrawn by §37 (`28/upper-air-figure`); the tint field
      still moves up, "moved, not added".
    */
    expect(upperAirAt(960)).toEqual({ start: 5, span: 4, figure: null, flat: 'triangle' });
    expect(upperAirAt(1440), 'no air above the fold at 12 columns').toBeNull();
    expect(upperAirAt(480), 'nor below 960, where the cells stack').toBeNull();
  });

  it('does not draw the region’s own triangle where the upper air carries it (§37: moved, not added)', () => {
    /*
      "At eight columns the region's own triangle is not drawn, so the page
      carries the same flats at eight columns as at twelve, one relocated...
      flats at three at eight columns, because the region kept its triangle
      when the upper air declared one; that third flat is the defect."
    */
    const css = regionStylesheet();
    const blocks = css.split('@media');
    const eight = blocks.find((b) => b.startsWith(' (max-width: 1439px)'));
    const hide = '[data-air="4"] > [data-ornament="flat"] { display: none; }';
    expect(eight, 'the 8-column block exists').toBeDefined();
    expect(eight, 'row 5’s triangle is hidden at 8 columns').toContain(hide);
    expect(blocks[0], 'and drawn at 12').not.toContain(hide);
    expect(blocks.find((b) => b.startsWith(' (max-width: 959px)')), 'below 960 the air itself is dropped, so nothing to hide').not.toContain(hide);
  });
});

describe('the breakpoint stylesheet is generated from the same table the tests assert', () => {
  const css = regionStylesheet();

  it('emits one block per §28 width, in descending order so later rules win', () => {
    const widths = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(widths, 'a block for 1439, 959 and 479').toEqual([1439, 959, 479]);
  });

  it('states each width’s column count, so the page grows rather than centring (§28, §30)', () => {
    expect(css, '12 columns at 1440 and above, fixed at the module').toContain(`repeat(12, ${COLUMN_MIN}px)`);
    expect(css, '8 columns below 1440, fractional so they grow').toContain('repeat(8, 1fr)');
    expect(css, '4 below 960').toContain('repeat(4, 1fr)');
    expect(css, 'one fluid column below 480').toContain('repeat(1, 1fr)');
  });

  it('places every section at each width from the rows, never by hand', () => {
    /* A spot check per width: if the generator stopped reading the table this diverges. */
    expect(css, 'market takes the last 4 of row 2 at 12').toContain('[data-section="market"] { grid-column: 9 / span 4; grid-row: 2; }');
    expect(css, 'and the 2 of 3/3/2 at 8').toContain('[data-section="market"] { grid-column: 7 / span 2; grid-row: 2; }');
    expect(css, 'a row of its own at 4').toContain('[data-section="market"] { grid-column: 1 / span 4; grid-row: 4; }');
  });

  it('drops the air columns where §28 drops them, rather than hiding them everywhere', () => {
    /*
      Row 5's air survives at 8 (3 of 8 columns is 360, over the 240 a figure
      needs) and goes at 4. Sliced between the media queries that OPEN each
      block, so a rule in the unqueried 12-column block cannot satisfy a
      claim about the 8-column one.
    */
    const block = (query: string, next: string) =>
      css.slice(css.indexOf(query) + query.length, next === '' ? undefined : css.indexOf(next));
    const at960 = block('@media (max-width: 1439px) {', '@media (max-width: 959px) {');
    const at480 = block('@media (max-width: 959px) {', '@media (max-width: 479px) {');
    expect(at960, 'row 5 keeps its air at 8 columns').toContain('[data-air="4"] { grid-column: 1 / span 3; grid-row: 5; display: block; }');
    expect(at480, 'and loses it at 4, being under 240').toContain('[data-air="4"] { display: none; }');
  });
});

describe('§30: the page above 1440 — 14 and 16 columns, a wider construction, a ceiling', () => {
  it('adds columns at the same 120 module and caps at 16', () => {
    /*
      §30: "There are 14 columns from 1680 (14 × 120) and 16 from 1920
      (16 × 120), and the ceiling is 16... Above 1920 the page stays 1920
      wide and centres."
    */
    expect(columnsFor(1440)).toBe(12);
    expect(columnsFor(1679), 'twelve holds to 1679').toBe(12);
    expect(columnsFor(1680)).toBe(14);
    expect(columnsFor(1919)).toBe(14);
    expect(columnsFor(1920)).toBe(16);
    expect(columnsFor(2560), 'the ceiling: the page stays 1920 and centres').toBe(16);
    expect(pageWidthAt(2560), 'and its width stops growing').toBe(1920);
    expect(pageWidthAt(1800), 'below the ceiling it takes the window').toBe(1800);
    expect(pageWidthAt(1600), 'and it takes it between 1440 and 1680 as well').toBe(1600);
  });

  it('gives the construction the extra columns and leaves identity and cover at four', () => {
    /*
      §30: "the construction takes five columns at 14 (600 wide) and six at 16
      (720 wide), while the identity and cover cells keep four. The rule is
      which cells grow. A cell whose content has a fixed measure keeps its
      width: the identity cell holds the 412 title measure, and the cover
      holds a square sleeve."
    */
    expect(upperSpansAt(1440)).toEqual({ identity: 4, still: 4, sleeve: 4, air: 0 });
    expect(upperSpansAt(1680)).toEqual({ identity: 4, still: 5, sleeve: 4, air: 1 });
    expect(upperSpansAt(1920)).toEqual({ identity: 4, still: 6, sleeve: 4, air: 2 });
  });

  it('keeps the band’s ratio above 1440, and gives the height to the construction', () => {
    /*
      The handoff's step 22: "Above 1440 the upper band is max(547, 547/900 ×
      viewport height), and the whole extra height goes to the construction
      cell." §32's frame fills that cell, so a taller band is what stops the
      floor falling as the viewport grows.
    */
    expect(bandHeightAt(900), 'at the reference viewport, the ruled 547').toBe(547);
    expect(bandHeightAt(800), 'never below it').toBe(547);
    expect(bandHeightAt(1050)).toBe(Math.round((547 / 900) * 1050));
    expect(bandHeightAt(1080)).toBe(Math.round((547 / 900) * 1080));
    expect(bandHeightAt(950), 'the real maximised window').toBe(Math.round((547 / 900) * 950));
  });

  it('never lets the construction’s drawn scale fall as the window widens (§30’s invariant)', () => {
    /*
      **§30's invariant, checked in 1px steps across the whole range.** "The
      drawing's scale never falls as the window widens." It is what the
      6-column step at 1920 is FOR: at 1919 the 14 columns are 137 wide and a
      five-column construction is 686; keeping five at 1920 would drop it to
      600.
    */
    let previous = 0;
    const drops: string[] = [];
    for (let width = 1440; width <= 1920; width += 1) {
      const scale = constructionScaleAt(width);
      if (scale < previous - 1e-9) drops.push(`${width}: ${scale.toFixed(4)} after ${previous.toFixed(4)}`);
      previous = scale;
    }
    expect(drops, `the scale falls at: ${drops.join(', ')}`).toEqual([]);
  });
});

describe('§30’s stylesheet: the wide page is CSS, because the server has no viewport', () => {
  const css = widePageStylesheet();

  it('lifts the page cap to 1920 and states each width’s columns', () => {
    expect(css, '14 columns from 1680').toContain('@media (min-width: 1680px)');
    expect(css, '16 from 1920').toContain('@media (min-width: 1920px)');
    expect(css, 'the page takes the window up to the ceiling').toContain(`max-width: ${PAGE_CEILING}px`);
  });

  it('gives the construction the extra columns and holds the other two at four', () => {
    const at14 = css.slice(css.indexOf('@media (min-width: 1680px)'), css.indexOf('@media (min-width: 1920px)'));
    expect(at14, 'the still cell takes five of fourteen').toContain('grid-column: span 5 !important');
    /* `!important` because §23's 4/4/4 is inline on the cells — see `widePageStylesheet`. */
    expect(at14, 'and identity keeps four').toContain('[data-cell="identity"] { grid-column: span 4 !important; }');
  });

  it('grows the band by the viewport’s height, never below the ruled 547', () => {
    /*
      `max(547px, 60.7778vh)` is `547/900` as a viewport unit: the band keeps
      its share of the screen above 1440 and never shrinks below the figure
      §28 ruled. The whole extra height goes to the construction cell, which
      is the only upper cell fitted rather than fixed.
    */
    expect(css).toContain(`max(${BAND_AT_REFERENCE}px,`);
    expect(css).toContain('vh)');
  });
});

describe('§30: the lower region above 1440 — extra columns become air, alternating sides', () => {
  it('spans every row across the whole grid, so no row stops short of the page', () => {
    /*
      §30: "In the lower region, the extra columns become air, not wider
      sections." A row that keeps its 12-column spans on a 14- or 16-column
      grid leaves a dead strip at the right — measured at 1920, where the
      region stopped at 1440 while the frame ran to 1920.
    */
    for (const width of [1680, 1920]) {
      const columns = columnsFor(width);
      for (const row of wideRowsAt(width)) {
        const total = row.items.reduce((sum, item) => sum + item.span, 0);
        expect(total, `${width}: row [${row.items.map((i) => i.kind).join(', ')}] fills ${columns}`).toBe(columns);
      }
    }
  });

  it('keeps each section’s own span and gives the surplus to air', () => {
    /*
      "Section content has fixed measures... A wider section is empty space
      hidden inside a box, whereas an air column is where §26 puts its figures
      and flats."
    */
    const at1920 = wideRowsAt(1920);
    const pressing = at1920[0].items.find((i) => i.kind === 'section' && i.section === 'pressing-detail');
    expect(pressing?.span, 'Pressing detail keeps its 7 of §26’s 7 + 5').toBe(7);
    expect(at1920[0].items.filter((i) => i.kind === 'air').reduce((s, i) => s + i.span, 0), 'the rest is air: 5 + 4 more').toBe(9);
  });

  it('alternates the new air column’s side row to row, so it does not stack into a margin', () => {
    /*
      §30: "A row with no air gains one on the side its neighbour above leaves
      filled, so the air alternates down the page rather than stacking into a
      margin at the right."
    */
    /*
      The full-width strip has no air at all — "spanning is what it is for" —
      so it is not part of the alternation and is skipped rather than counted
      as a side. Counting it broke the chain at row 4.
    */
    const sides = wideRowsAt(1920)
      .filter((row) => row.items.some((item) => item.kind === 'air'))
      .map((row) => (row.items[0].kind === 'air' ? 'left' : 'right'));
    expect(sides.length, 'four rows carry air at 16 columns').toBe(4);
    for (let i = 1; i < sides.length; i += 1) {
      expect(sides[i], `the ${i + 1}th air-carrying row alternates from the one above`).not.toBe(sides[i - 1]);
    }
  });

  it('leaves the full-width strip full width, because spanning is what it is for', () => {
    const strip = wideRowsAt(1920)[2];
    expect(strip.items.filter((i) => i.kind === 'section')).toHaveLength(1);
    expect(strip.items[0].span, 'Price history takes all sixteen').toBe(16);
  });
});

describe('§26 placement: the rule is the HOST’s, not the figure’s (step 28)', () => {
  /**
   * §28's step: "two rules by host. A figure in a full-width strip takes a
   * two-column right inset; a figure in an air column is centred in it.
   * **Neither rule depends on solo or pair.**"
   *
   * The build had one right-inset constant of 240, fitted across
   * both. It is right for the strip and wrong for the air column: measured
   * on §26's own drawing, the air figure's host is 840..1440 (midpoint
   * 1140.0) and the figure spans 1043.4..1237.2 (midpoint 1140.3) — centred
   * to 0.3px, where its "203px inset" was centring seen from one side. The
   * strip figure is genuinely inset, at 242.9 = 2.02 columns.
   *
   * **Asserted by host, never by solo-versus-pair.** This drawing happens to
   * have one of each, so a test written to the figure type would encode that
   * correlation — and §21 applies this vocabulary to six more screens, where
   * an air column may hold a solo and a strip a pair.
   */
  it('insets a figure in a full-width strip by two columns, whatever the figure is', () => {
    for (const figure of ['solo', 'pair'] as const) {
      const placed = figurePlacement({ host: 'strip', hostWidth: 1440, columnWidth: 120, figureWidth: 95, kind: figure });
      expect(placed.right, `${figure} in a strip: two columns in from the host's right`).toBe(240);
    }
  });

  it('centres a figure in an air column, whatever the figure is', () => {
    for (const figure of ['solo', 'pair'] as const) {
      /* §26's drawing: air host 600 wide, figure 193.8 across. */
      const placed = figurePlacement({ host: 'air', hostWidth: 600, columnWidth: 120, figureWidth: 193.8, kind: figure });
      expect(placed.right, `${figure} in air: centred, so the right gap is half the slack`).toBeCloseTo((600 - 193.8) / 2, 1);
    }
  });

  it('reproduces §26’s drawing on both its figures', () => {
    /* The strip figure: host 0..1440, drawn right edge 1197.1 -> inset 242.9 ≈ 2 columns. */
    const strip = figurePlacement({ host: 'strip', hostWidth: 1440, columnWidth: 120, figureWidth: 95, kind: 'solo' });
    expect(1440 - strip.right, 'the strip figure’s right edge').toBeCloseTo(1200, 0);

    /* The air figure: host 840..1440, drawn 1043.4..1237.2, midpoint on the host's. */
    const air = figurePlacement({ host: 'air', hostWidth: 600, columnWidth: 120, figureWidth: 193.8, kind: 'pair' });
    expect(840 + air.left + 193.8 / 2, 'the air figure’s midpoint sits on its host’s').toBeCloseTo(1140, 0);
  });

  it('keeps the two figures apart, where one constant aligned them', () => {
    /*
      The observable defect: with a single 240 inset both figures landed on
      x = 1200 at 1440, forming a vertical the design does not have — the
      drawing has them 40px apart. A regularity reads as intent, which is why
      it survived review.
    */
    const stripRight = 1440 - figurePlacement({ host: 'strip', hostWidth: 1440, columnWidth: 120, figureWidth: 95, kind: 'solo' }).right;
    const airRight = 840 + figurePlacement({ host: 'air', hostWidth: 600, columnWidth: 120, figureWidth: 193.8, kind: 'pair' }).left + 193.8;
    expect(Math.abs(stripRight - airRight), 'the two right edges do not coincide').toBeGreaterThan(20);
  });
});
