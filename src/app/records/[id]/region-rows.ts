import { SECTIONS, type SectionName } from './extended-grid';

/**
 * §26's five rows and §28's groupings at every width.
 *
 * **§28's list governs over its drawing, at every width.** The section says
 * so in its own text — "Where the drawing disagrees, this list governs" —
 * and Adam gave the same ruling. So this module is that list transcribed,
 * and the drawing is not consulted for spans.
 *
 * **Why the widths are a table rather than a breakpoint each.** §28 derives
 * every column count from a measurement: the column never drops below 120
 * because the identity cell holds §4.2's 412 measure plus 34 of padding each
 * side, and 8 × 120 is exactly two 480 cells while 4 × 120 is one. A table
 * keyed by column count says that once; a breakpoint per width would say it
 * four times and let the four drift.
 *
 * Step 18b builds 12 columns; step 20 turns the rest on. The table carries
 * all four now so that step 20 adds breakpoints rather than re-deriving
 * placement — the defect §28 names when it says the drawing has been
 * redrawn to the list.
 */

/** §28's four widths, by the column count each seats. */
export const WIDTHS = [1440, 960, 480, 390] as const;
export type RegionWidth = (typeof WIDTHS)[number];

/** Columns at each width: 12 at 1440, 8 from 960, 4 from 480, one fluid below. */
export const COLUMNS_AT: Record<RegionWidth, number> = { 1440: 12, 960: 8, 480: 4, 390: 1 };

/**
 * The width band a viewport falls in. **12 columns holds to 1679** — §30
 * rules the page from 1680 up, and this function stops at §28's ceiling
 * rather than guessing past it.
 */
export function columnsFor(viewport: number): number {
  if (viewport >= 1440) return 12;
  if (viewport >= 960) return 8;
  if (viewport >= 480) return 4;
  return 1;
}

/**
 * §28: "A figure needs at least 240 of air, the width of a figure at 0.855 of
 * a section's height." At 4 columns no air column reaches it, which is why
 * the lower region below 960 is a document rather than a composition.
 */
export const AIR_MIN = 240;

/** A row is a section, or an air column, or several sections side by side. */
export type RowItem = { kind: 'section'; section: SectionName; span: number } | { kind: 'air'; span: number };
export type RegionRow = { items: RowItem[] };

/**
 * §26's five rows, as the sections they carry and the air each has.
 *
 * `air` is the side the air column sits on at the widths that have one.
 * **Row 5 is air-FIRST, and that is the ruling's point**: every other row
 * starts with content at x = 0, so "flats on opposite page edges" needs one
 * cleared column on the left, and ordering this row air-first makes it.
 */
export const REGION_ROWS: ReadonlyArray<{ sections: readonly SectionName[]; air: 'before' | 'after' | null }> = [
  { sections: ['pressing-detail'], air: 'after' },
  { sections: ['acquisition', 'tags', 'market'], air: null },
  { sections: ['price-history'], air: null },
  { sections: ['images', 'snippet'], air: null },
  { sections: ['journal'], air: 'before' },
];

/**
 * §28's spans, row by row, at each width — transcribed from the list.
 *
 * Where a row's sections cannot sit side by side at a width, the row becomes
 * several rows of one section each: §28's "three rows of 4", "two rows of 1".
 * Row 4's pair is the exception it names — "kept side by side as the one
 * pair" at 4 columns.
 *
 * Row 1's air at 8 columns is NOT here: §28 moves it up beside the third
 * upper cell, so it leaves the lower region entirely and the row is 8 wide.
 * Row 5's air is dropped at 4 and 1 because it would be under 240.
 */
const SPANS: Record<RegionWidth, ReadonlyArray<ReadonlyArray<number>>> = {
  /* 7+5 · 4/4/4 · 12 · 6/6 · 3+9 */
  1440: [[7, 5], [4, 4, 4], [12], [6, 6], [3, 9]],
  /* 8 · 3/3/2 (the last section takes the 2) · 8 · 4/4 · 3+5 air first */
  960: [[8], [3, 3, 2], [8], [4, 4], [3, 5]],
  /* 4 · three rows of 4 · 4 · 2/2 · 4 with the air dropped */
  480: [[4], [4], [4], [4], [4], [2, 2], [4]],
  390: [[1], [1], [1], [1], [1], [1], [1], [1]],
};

/** Which row of `SPANS` each of §26's five rows becomes, at a width that splits it. */
const SPLIT_ROWS: Record<RegionWidth, ReadonlyArray<number>> = {
  1440: [1, 1, 1, 1, 1],
  960: [1, 1, 1, 1, 1],
  /* Row 2's three sections take a row each; row 4 keeps its pair. */
  480: [1, 3, 1, 1, 1],
  390: [1, 3, 1, 2, 1],
};

/** Whether a row keeps its air column at a given width. */
function airAt(rowIndex: number, width: RegionWidth): 'before' | 'after' | null {
  const air = REGION_ROWS[rowIndex].air;
  if (air === null) return null;
  /* §28: at 8 the first row's air moves up beside the third upper cell. */
  if (rowIndex === 0 && width !== 1440) return null;
  /* §28: below 960 no air column reaches 240, so row 5's is dropped. */
  if (rowIndex === 4 && (width === 480 || width === 390)) return null;
  return air;
}

/** The region's rows at one width, each as the items it lays across the grid. */
export function rowsAt(width: RegionWidth): RegionRow[] {
  const spans = SPANS[width];
  const out: RegionRow[] = [];
  let cursor = 0;

  REGION_ROWS.forEach((row, rowIndex) => {
    const air = airAt(rowIndex, width);
    const taken = SPLIT_ROWS[width][rowIndex];

    for (let i = 0; i < taken; i += 1) {
      const rowSpans = spans[cursor];
      cursor += 1;
      /* One section per sub-row when a row splits; all of them when it does not. */
      const sections = taken === 1 ? row.sections : [row.sections[i]];
      const items: RowItem[] = [];

      if (air === 'before') items.push({ kind: 'air', span: rowSpans[0] });
      sections.forEach((section, index) => {
        items.push({ kind: 'section', section, span: rowSpans[air === 'before' ? index + 1 : index] });
      });
      if (air === 'after') items.push({ kind: 'air', span: rowSpans[rowSpans.length - 1] });

      out.push({ items });
    }
  });

  return out;
}

/** The air column beside a section at a width, if that row has one. */
export function airOf(width: RegionWidth, section: SectionName): { side: 'before' | 'after'; span: number } | undefined {
  const rowIndex = REGION_ROWS.findIndex((row) => row.sections.includes(section));
  if (rowIndex === -1) return undefined;
  const side = airAt(rowIndex, width);
  if (side === null) return undefined;

  for (const row of rowsAt(width)) {
    if (!row.items.some((item) => item.kind === 'section' && item.section === section)) continue;
    const air = row.items.find((item) => item.kind === 'air');
    if (air !== undefined) return { side, span: air.span };
  }
  return undefined;
}

/** §26's two figures: the pair in Pressing detail's air, the solo in Price history's strip. */
export const FIGURE_PLACES = [
  { section: 'pressing-detail', place: 'air' },
  { section: 'price-history', place: 'strip' },
] as const;

/**
 * Where a section's figure may sit at a width, if it has one.
 *
 * A figure in an air column needs that air to exist; a figure in a strip
 * needs only the full-width row, which every width has. So the pair
 * disappears below 1440 and the solo does not — which is §28's "below 960
 * the lower region is a document: sections in order, one pair, and one flat
 * field", with the pair being row 4's span pair rather than §25's figure.
 */
export function placeRow(width: RegionWidth, section: SectionName): { figure: 'air' | 'strip' | null } {
  const placed = FIGURE_PLACES.find((f) => f.section === section);
  if (placed === undefined) return { figure: null };
  if (placed.place === 'strip') return { figure: 'strip' };
  return { figure: airOf(width, section) === undefined ? null : 'air' };
}

/** Every section, in §9's order — re-exported so a caller need not import both modules. */
export const ORDERED_SECTIONS = SECTIONS;

/** Where a section sits in its row: the column it starts at, its span, and whether anything follows it. */
export type Placement = { start: number; span: number; endsRow: boolean };

/**
 * **Placement is derived from the section's name, never passed in.**
 *
 * Seven call sites across six components render a section, and none of them
 * knows the region's rows. If each passed its own span, §28's list would be
 * restated seven times — the shape this file's index has failed on three
 * times, and the shape §26 names when it says the drawing was redrawn to the
 * list. A section knows its own name; the rows know where that name goes.
 */
export function placementOf(width: RegionWidth, section: SectionName): Placement {
  for (const row of rowsAt(width)) {
    let column = 1;
    for (let i = 0; i < row.items.length; i += 1) {
      const item = row.items[i];
      if (item.kind === 'section' && item.section === section) {
        return { start: column, span: item.span, endsRow: i === row.items.length - 1 };
      }
      column += item.span;
    }
  }
  /* Unreachable for a §9 section: every one appears in REGION_ROWS, asserted in the test. */
  return { start: 1, span: COLUMNS_AT[width], endsRow: true };
}

/** Where row `rowIndex` of §26's five puts its air column, if it has one at this width. */
export function airPlacement(width: RegionWidth, rowIndex: number): { start: number; span: number } | null {
  const air = REGION_ROWS[rowIndex].air;
  if (air === null) return null;

  const sections = REGION_ROWS[rowIndex].sections;
  for (const row of rowsAt(width)) {
    if (!row.items.some((item) => item.kind === 'section' && sections.includes(item.section))) continue;
    let column = 1;
    for (const item of row.items) {
      if (item.kind === 'air') return { start: column, span: item.span };
      column += item.span;
    }
  }
  return null;
}

/**
 * The grid row a section occupies, 1-based.
 *
 * **Explicit, because a column placement alone does not pick a row.** A grid
 * item given `grid-column` and no row is auto-placed into the first row with
 * space, so an air column declared after its sections landed in a later row
 * and the section beside it read as the last item in its own. Measured on
 * the route: row 1 ended at 840 with its air somewhere below.
 */
export function rowOf(width: RegionWidth, section: SectionName): number {
  const rows = rowsAt(width);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].items.some((item) => item.kind === 'section' && item.section === section)) return i + 1;
  }
  return 1;
}

/** The grid row row `rowIndex` of §26's five occupies at this width — the row its air sits on. */
export function airRow(width: RegionWidth, rowIndex: number): number {
  const sections = REGION_ROWS[rowIndex].sections;
  const rows = rowsAt(width);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].items.some((item) => item.kind === 'section' && sections.includes(item.section))) return i + 1;
  }
  return rowIndex + 1;
}

/**
 * §28: **the column never drops below 120px**, and every breakpoint is
 * derived from that rather than from a device width.
 *
 * The identity cell holds §4.2's 412 title measure plus 34 of padding each
 * side, which is 480 — four columns of 120. So 8 × 120 is the narrowest grid
 * that seats two upper cells side by side, and 4 × 120 is one.
 */
export const COLUMN_MIN = 120;

/**
 * The width of one column at a viewport.
 *
 * **Columns GROW between breakpoints.** §28 rules it below 1440 and §30
 * repeats it above: at 1000 the page is 1000 wide on 8 columns of 125, not
 * 960 centred. §30 names the build's centring as a divergence from §28 in
 * both directions, which is what step 22's check at 1000 is for.
 */
export function columnWidthAt(viewport: number): number {
  return viewport / columnsFor(viewport);
}

/** The three upper cells, in the order §23 places them. */
const UPPER_CELLS = ['identity', 'still', 'sleeve'] as const;

/**
 * §28: **no upper cell reshapes; they wrap.** "The construction's frame is
 * fitted to a 480 cell, and reshaping it moves §5.5's floor, so the cells
 * wrap and extra width becomes air." Three abreast at 12 columns, two then
 * one at 8, stacked at 4 and below.
 */
export function upperRowsAt(viewport: number): string[][] {
  const perRow = Math.max(1, Math.floor(columnsFor(viewport) / 4));
  const rows: string[][] = [];
  for (let i = 0; i < UPPER_CELLS.length; i += perRow) rows.push([...UPPER_CELLS.slice(i, i + perRow)]);
  return rows;
}

/**
 * The air beside the third upper cell at 8 columns, which carries what the
 * first lower row gives up.
 *
 * §28: "That air carries the lower region's first figure and the tint field,
 * moved up from the first lower row, so it reads as composed rather than as a
 * gap." It exists only at 8 — at 12 the three cells fill the band, and below
 * 960 they stack with nothing beside them.
 */
export function upperAirAt(viewport: number): { start: number; span: number; figure: string; flat: string } | null {
  if (columnsFor(viewport) !== 8) return null;
  return { start: 5, span: 4, figure: 'pressing-detail:air', flat: 'triangle' };
}

/**
 * §28's groupings as CSS, generated from the table above.
 *
 * **Generated rather than hand-written, because §28's list is the authority
 * and a stylesheet is a second copy of it.** Four widths × eight sections ×
 * two air columns is fifty-odd placements; typed by hand they would drift
 * from the table the unit tests assert, and the drift would show only as a
 * layout nobody measured. §26 records the same argument when it says its
 * drawing "has been redrawn to this list".
 *
 * A stylesheet rather than a measurement: the server has no viewport, so a
 * JavaScript fork renders the wrong composition first and corrects it after
 * hydration, and this page must be right on the first paint.
 *
 * **The columns are fractional below 1440 and fixed at or above it.** §28
 * grows columns between breakpoints — at 1000 the page is 1000 wide on 8
 * columns of 125 — while §18's fixed `120px` module holds at the fork and
 * above, where §30 takes over.
 */
export function regionStylesheet(): string {
  const blocks: Array<{ width: RegionWidth; rules: string[] }> = [];

  for (const width of WIDTHS) {
    const columns = COLUMNS_AT[width];
    const rules: string[] = [
      `[data-region="extended-grid"] { grid-template-columns: repeat(${columns}, ${width === 1440 ? `${COLUMN_MIN}px` : '1fr'}); }`,
    ];

    for (const section of SECTIONS) {
      const { start, span, endsRow } = placementOf(width, section);
      rules.push(`[data-section="${section}"] { grid-column: ${start} / span ${span}; grid-row: ${rowOf(width, section)}; }`);
      /* A rule divides two cells; the last in a row has the page edge beside it. */
      rules.push(`[data-section="${section}"] { border-right-width: ${endsRow ? 0 : 1}px; }`);
    }

    REGION_ROWS.forEach((_, index) => {
      const air = airPlacement(width, index);
      rules.push(
        air === null
          ? `[data-air="${index}"] { display: none; }`
          : `[data-air="${index}"] { grid-column: ${air.start} / span ${air.span}; grid-row: ${airRow(width, index)}; display: block; }`,
      );
    });

    blocks.push({ width, rules });
  }

  /*
    Descending, so a narrower block's rules win: `max-width` queries all match
    at a small viewport, and the last one wins by source order.
  */
  const [widest, ...rest] = blocks;
  const out = [widest.rules.join('\n')];
  rest.forEach((block, index) => {
    /*
      A block's ceiling is one below the width ABOVE it, not below its own:
      `WIDTHS` names the width each grouping STARTS at, so the 8-column block
      governs 960–1439 and its query is `max-width: 1439`.
    */
    const ceiling = (index === 0 ? widest.width : rest[index - 1].width) - 1;
    out.push(`@media (max-width: ${ceiling}px) {\n${block.rules.join('\n')}\n}`);
  });
  return out.join('\n');
}
