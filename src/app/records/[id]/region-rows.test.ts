import { describe, expect, it } from 'vitest';
import { SECTIONS } from './extended-grid';
import {
  AIR_MIN,
  COLUMNS_AT,
  FIGURE_PLACES,
  REGION_ROWS,
  WIDTHS,
  airOf,
  airPlacement,
  columnsFor,
  placeRow,
  placementOf,
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
