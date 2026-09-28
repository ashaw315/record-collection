import { SECTIONS, SECTION_RULE, type SectionName } from './extended-grid';

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
  /* §30: 14 from 1680, 16 from 1920, and 16 is the ceiling. */
  if (viewport >= 1920) return 16;
  if (viewport >= 1680) return 14;
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
  /*
    8 · 4/4 · 8 · 8 · 4/4 · 3+5 air first. §28 wrote 3/3/2 here; §34
    supersedes it: "a grouping list says where sections sit; it does not
    guarantee each one a measure... At eight columns row 2 is therefore
    4 / 4, then the market at 8." Two columns of 125 gave the market's pair
    cells a 57px measure. The rule that outranks every grouping -- every
    content cell's measure holds its longest label on one line -- is
    asserted across the sweep in `e2e/layout-sweep.spec.ts`.
  */
  960: [[8], [4, 4], [8], [8], [4, 4], [3, 5]],
  /* 4 · three rows of 4 · 4 · 2/2 · 4 with the air dropped */
  480: [[4], [4], [4], [4], [4], [2, 2], [4]],
  390: [[1], [1], [1], [1], [1], [1], [1], [1]],
};

/** Which row of `SPANS` each of §26's five rows becomes, at a width that splits it. */
const SPLIT_ROWS: Record<RegionWidth, ReadonlyArray<number>> = {
  1440: [1, 1, 1, 1, 1],
  /* §34: row 2 is two rows at 8 -- acquisition and tags, then the market. */
  960: [1, 2, 1, 1, 1],
  /* Row 2's three sections take a row each; row 4 keeps its pair. */
  480: [1, 3, 1, 1, 1],
  390: [1, 3, 1, 2, 1],
};

/** Whether a row keeps its air column at a given width. */
/*
  How a split row's sections share its sub-rows, where it is not one per
  sub-row. §34's row 2 at 8: 4 / 4, then the market at 8.
*/
const SUB_ROWS: Partial<Record<RegionWidth, Partial<Record<number, ReadonlyArray<ReadonlyArray<SectionName>>>>>> = {
  960: { 1: [['acquisition', 'tags'], ['market']] },
};

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
      /* All of a row's sections when it does not split; SUB_ROWS' grouping when it does, else one per sub-row. */
      const groups = SUB_ROWS[width]?.[rowIndex];
      const sections = taken === 1 ? row.sections : groups !== undefined ? groups[i] : [row.sections[i]];
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
/** The most grid rows any width lays (eight, at one column); the grid renders a rule element for each. */
export const MAX_ROWS = Math.max(...WIDTHS.map((w) => rowsAt(w).length));

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
export function upperAirAt(viewport: number): { start: number; span: number; figure: null; flat: string } | null {
  if (columnsFor(viewport) !== 8) return null;
  /*
    §37, step 40: a section carrying the tint field and NO figure. §28's
    "that air carries the lower region's first figure" is withdrawn
    (`28/upper-air-figure`): at §25's size the pair was 439 of the air's 480,
    "beside a sleeve the same width, so it competes with the record at the
    width where the page has least room". The first figure stays in the
    lower region, where §28's 240px air rule decides -- and row 1 has no air
    at 8, so it does not draw there.
  */
  return { start: 5, span: 4, figure: null, flat: 'triangle' };
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
/**
 * **§38: a row whose section is absent regroups over the sections that
 * render.** "The dropped section's columns go to the section before it in
 * reading order, or to the one after if it is first." Air keeps its span: it
 * is a cell, not empty grid. A row with no section rendered keeps only its
 * air; §9.1 collapses the rest.
 */
export function regroup(items: readonly RowItem[], present: ReadonlySet<SectionName>): RowItem[] {
  const out: RowItem[] = [];
  let carry = 0;
  for (const item of items) {
    if (item.kind === 'air') { out.push({ ...item }); continue; }
    if (!present.has(item.section)) {
      const before = [...out].reverse().find((o): o is RowItem & { kind: 'section' } => o.kind === 'section');
      if (before !== undefined) before.span += item.span; else carry += item.span;
      continue;
    }
    out.push({ ...item, span: item.span + carry });
    carry = 0;
  }
  return out;
}

/**
 * The regrouped placements for every way a row can be missing sections,
 * guarded by what the region holds: `:has(> [data-section])` for each section
 * present and `:not(:has(...))` for each absent, on the region itself. The
 * guard is more specific than the base `[data-section="x"]` rule and follows
 * it in source, so it wins where it applies and is inert where the row is
 * whole. "Draw a section-to-section rule only between two rendered
 * sections": the right rule is the regrouped row's, so no rule stands
 * against empty grid.
 */
function regroupRules(rows: readonly RegionRow[], important: boolean): string[] {
  const bang = important ? ' !important' : '';
  const out: string[] = [];
  for (const row of rows) {
    const sections = row.items.filter((i): i is RowItem & { kind: 'section' } => i.kind === 'section').map((i) => i.section);
    if (sections.length < 2) continue;
    for (let mask = 1; mask < (1 << sections.length) - 1; mask += 1) {
      const present = new Set(sections.filter((_, k) => (mask >> k) & 1));
      const absent = sections.filter((name) => !present.has(name));
      const guard = `[data-region="extended-grid"]${[...present].map((n) => `:has(> [data-section="${n}"])`).join('')}${absent.map((n) => `:not(:has(> [data-section="${n}"]))`).join('')}`;
      const regrouped = regroup(row.items, present);
      let column = 1;
      regrouped.forEach((item, k) => {
        if (item.kind === 'section') {
          const endsRow = k === regrouped.length - 1;
          out.push(`${guard} > [data-section="${item.section}"] { grid-column: ${column} / span ${item.span}${bang}; border-right-width: ${endsRow ? 0 : 1}px${bang}; }`);
        }
        column += item.span;
      });
    }
  }
  return out;
}

export function regionStylesheet(): string {
  const blocks: Array<{ width: RegionWidth; rules: string[] }> = [];

  for (const width of WIDTHS) {
    const columns = COLUMNS_AT[width];
    const rules: string[] = [
      `[data-region="extended-grid"] { grid-template-columns: repeat(${columns}, ${width === 1440 ? `${COLUMN_MIN}px` : '1fr'}); }`,
    ];
    /*
      The vertical between two sections is the stylesheet's alone: a 0-width
      solid rule on every section, widened below per breakpoint. Inline, the
      1440 width beat every narrower block's 0 and stood on the page's edge
      wherever a section ends its row only below the fork.

      `:where()` so the shorthand has one attribute's specificity, the same
      as `[data-section="name"]` below it, and source order widens it. As
      `[data-region] > [data-section]` it out-specified every width rule
      and no section was ruled at all -- caught by the rendering test, not
      by the one that read this string.
    */
    if (width === 1440) rules.push(`:where([data-region="extended-grid"]) > [data-section] { border-right: 0 solid ${SECTION_RULE}; }`);

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
    /*
      §33: every row is ruled. The grid renders MAX_ROWS rule elements at
      grid rows 1 to MAX_ROWS; this width shows as many as it lays. Before
      this the five elements sat at rows 1 to 5 whatever the width, so the
      sixth row at 8 (§34) and rows 6 to 8 at 4 and 1 column had no rule.
    */
    const laid = rowsAt(width).length;
    for (let i = 0; i < MAX_ROWS; i += 1) rules.push(`[data-row-rule="${i}"] { display: ${i < laid ? 'block' : 'none'}; }`);
    /*
      §37: the tint triangle is "moved, not added". Where the upper band's
      air carries it, the last row's air -- §26's "the left edge in the last
      row" -- keeps its 3 columns (§28's 3 + 5) and draws no flat. Measured
      before this: flats at three at eight columns, "that third flat is the
      defect".
    */
    if (upperAirAt(width) !== null) rules.push(`[data-air="${REGION_ROWS.length - 1}"] > [data-ornament="flat"] { display: none; }`);
    /* §38's guards go LAST in the block: nested in their own min-width query, and a reader (or a test) slicing on @media must find the block's own rules before it. */
    /*
      §38: the same rows, missing any of their sections. Under a min-width
      of this width's own: a guard out-specifies every base placement, so
      without the lower bound the 12-column guard reached below the fork
      and put the market at column 9 of an 8-column grid, opening four
      implicit tracks (measured at 1000). The block's max-width still caps
      it above.
    */
    const guarded = regroupRules(rowsAt(width), false);
    if (guarded.length > 0) rules.push(`@media (min-width: ${width}px) {\n${guarded.join('\n')}\n}`);

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

/**
 * §30: **above 1920 the page stays 1920 wide and centres.**
 *
 * "The current behaviour, 1440 centred at every wider width, was never ruled,
 * and it is withdrawn here." Below the ceiling the page takes the window, so
 * columns grow between breakpoints as §28 rules below 1440.
 */
export const PAGE_CEILING = 1920;
export function pageWidthAt(viewport: number): number {
  return Math.min(viewport, PAGE_CEILING);
}

/**
 * §30: which upper cells take the extra columns.
 *
 * "The construction takes five columns at 14 (600 wide) and six at 16 (720
 * wide), while the identity and cover cells keep four. The rule is which
 * cells grow. A cell whose content has a fixed measure keeps its width: the
 * identity cell holds the 412 title measure, and the cover holds a square
 * sleeve. The construction is fitted to its cell and scales with it, so it is
 * the one cell that uses more width."
 *
 * What is left is air that carries nothing — one column at 14, two at 16 —
 * and §30 keeps it narrower than one upper cell, which is where the ceiling
 * comes from.
 */
/**
 * The width of one upper track. Above §18's fork the tracks are the page's
 * columns (see `upperSpansAt`); from 960 to 1439 each is half the page (§41,
 * step 46); from 480 to 959 the cells stack in one 480 track (§28); below
 * 480 the one column is the page.
 */
export function upperTrackAt(viewport: number): number {
  if (viewport >= 1440) return (pageWidthAt(viewport) / columnsFor(viewport)) * 4;
  if (viewport >= 960) return viewport / 2;
  if (viewport >= 480) return 480;
  return viewport;
}

export function upperSpansAt(viewport: number): { identity: number; still: number; sleeve: number; air: number } {
  const columns = columnsFor(viewport);
  const still = columns >= 16 ? 6 : columns >= 14 ? 5 : 4;
  /*
    §39 (step 44): the cover takes the spare columns and the upper band
    carries no air -- 4 / 5 / 5 at fourteen, 4 / 6 / 6 at sixteen. §30 refused
    to widen cells because their content does not grow; that is false of the
    cover, which §33 makes the largest square its cell holds.
  */
  return { identity: 4, still, sleeve: still, air: 0 };
}

/**
 * The upper band's height: `max(547, 547/900 × viewport height)`.
 *
 * §5.5's floor is measured against the VIEWPORT (§28), and a wider screen is
 * also a taller one, so a band fixed at 547 makes the construction a smaller
 * share of a bigger screen. Holding the band's ratio to the reference
 * viewport keeps "one screen" meaning the same thing at every width, and the
 * whole extra height goes to the construction cell — the only upper cell
 * whose content is fitted rather than fixed.
 */
export function bandHeightAt(viewportHeight: number): number {
  return Math.max(BAND_AT_REFERENCE, Math.round((BAND_AT_REFERENCE / REFERENCE_HEIGHT) * viewportHeight));
}
/** §28's ruled band at the reference viewport, and the height it is a share of. */
export const BAND_AT_REFERENCE = 547;
export const REFERENCE_HEIGHT = 900;

/**
 * The construction's drawn scale at a viewport — §30's invariant is that this
 * never falls as the window widens.
 *
 * The drawing is §31's frame fitted into the still cell's inner box (§26's
 * 24px margin), by the smaller of the two ratios. Six columns at 1920 exist
 * to hold the invariant: at 1919 the 14 columns are 137 wide and a
 * five-column cell is 686, where keeping five at 1920 would drop it to 600.
 */
export function constructionScaleAt(viewport: number, viewportHeight = REFERENCE_HEIGHT): number {
  const page = pageWidthAt(viewport);
  const cellWidth = (page / columnsFor(viewport)) * upperSpansAt(viewport).still;
  const innerWidth = cellWidth - 2 * 24;
  const innerHeight = bandHeightAt(viewportHeight) - 2 * 24;
  /* §31's stated frame, as the ratio it is fitted by. */
  const FRAME_W = 296;
  const FRAME_H = 314;
  return Math.min(innerWidth / FRAME_W, innerHeight / FRAME_H);
}

/**
 * §30's wide page, as CSS.
 *
 * A stylesheet rather than a measurement, for §18's reason: the server has no
 * viewport, so a JavaScript fork renders the wrong composition first and
 * corrects it after hydration, and this page must be right on the first
 * paint.
 *
 * **`!important` on the upper spans, deliberately.** §23's 4/4/4 is set
 * inline on the cells, which is right at 1440 — the spans are the band's
 * ruling, not a width's — and an inline value beats a plain stylesheet rule.
 * Rather than move §23's spans out to CSS and make every width restate them,
 * the three widths that differ override the one that does not.
 *
 * Three things change above 1440 and nothing else does. The page takes the
 * window up to the 1920 ceiling; the grid gains columns at the same 120
 * module; and the upper band keeps its share of the viewport's height, with
 * the extra going to the construction cell — the one upper cell whose content
 * is fitted rather than fixed.
 */
export function widePageStylesheet(): string {
  const bandShare = ((BAND_AT_REFERENCE / REFERENCE_HEIGHT) * 100).toFixed(4);
  const band = `max(${BAND_AT_REFERENCE}px, ${bandShare}vh)`;

  const block = (min: number) => {
    const columns = columnsFor(min);
    const spans = upperSpansAt(min);
    /* §30's lower region: the extra columns become air, alternating sides. */
    const region: string[] = [`[data-region="extended-grid"] { grid-template-columns: repeat(${columns}, 1fr) !important; }`];
    wideRowsAt(min).forEach((row, rowIndex) => {
      let column = 1;
      let airIndex = 0;
      for (const item of row.items) {
        if (item.kind === 'section') {
          region.push(`[data-section="${item.section}"] { grid-column: ${column} / span ${item.span} !important; grid-row: ${rowIndex + 1} !important; }`);
        } else {
          /*
            A row's air keeps the index §26 gave it where it has one; a row
            that GAINS air above 1440 has no `data-air` of its own, so the
            surplus is carried by the section's own margin instead — §26's
            five air slots are the only ones the markup renders.
          */
          const owner = REGION_ROWS[rowIndex].air === null ? null : rowIndex;
          if (owner !== null && airIndex === 0) {
            region.push(`[data-air="${owner}"] { grid-column: ${column} / span ${item.span} !important; grid-row: ${rowIndex + 1} !important; display: block; }`);
          }
          airIndex += 1;
        }
        column += item.span;
      }
    });
    /* §38 above the fork too, with the !important this sheet's placements carry. */
    region.push(...regroupRules(wideRowsAt(min), true));
    return `@media (min-width: ${min}px) {
${region.join('\n')}
[data-testid="record-page-8a"] { max-width: ${PAGE_CEILING}px; }
[data-band] { grid-template-columns: repeat(${columns}, 1fr) !important; }
[data-band="identity"] { height: ${band}; }
[data-cell="identity"] { grid-column: span ${spans.identity} !important; }
[data-cell="still"] { grid-column: span ${spans.still} !important; }
[data-cell="sleeve"] { grid-column: span ${spans.sleeve} !important; }
}`;
  };

  return [
    /*
      **The page takes the window from 1440 up to the 1920 ceiling.** §30
      computes the floor at 1679 × 1050 from "twelve columns, so the
      construction is four columns of 139.9" — 1679 ÷ 12 — so columns grow
      through 1440–1679 exactly as §28 grows them below 1440. A flat 1440 cap
      in that range made a four-column cell 480 where §30 measures 559.7, and
      §18's fixed 120px module is the grid BELOW the fork, not a cap above it.
    */
    `[data-testid="record-page-8a"], [data-page-measure], [data-app-nav] > div { max-width: ${PAGE_CEILING}px; }`,
    /* And the twelve columns stretch with it rather than staying at the module. */
    `@media (min-width: 1440px) { [data-band], [data-region="extended-grid"] { grid-template-columns: repeat(12, 1fr) !important; } }`,
    block(1680),
    block(1920),
  ].join('\n');
}

/**
 * §30's lower region above 1440: **the extra columns become air, not wider
 * sections**, and the new air alternates sides down the page.
 *
 * "Section content has fixed measures, such as the 412 title measure, field
 * widths and list rows. A wider section is empty space hidden inside a box,
 * whereas an air column is where §26 puts its figures and flats. Each row's
 * existing air column absorbs the extra columns. A row with no air gains one
 * on the side its neighbour above leaves filled, so the air alternates down
 * the page rather than stacking into a margin at the right."
 *
 * The full-width strip stays full width, "because spanning is what it is
 * for". §25's cap is per section, so more air adds no figures.
 */
export function wideRowsAt(viewport: number): RegionRow[] {
  const columns = columnsFor(viewport);
  const base = rowsAt(1440);
  const surplus = columns - COLUMNS_AT[1440];
  if (surplus <= 0) return base;

  /* Row 1 has air on the right and row 5 on the left, so the alternation starts filled-right. */
  let lastSide: 'left' | 'right' = 'right';

  return base.map((row) => {
    const existing = row.items.find((item) => item.kind === 'air');
    if (existing !== undefined) {
      /* The row's own air absorbs the surplus; its side is unchanged. */
      lastSide = row.items[0].kind === 'air' ? 'left' : 'right';
      return { items: row.items.map((item) => (item === existing ? { ...item, span: item.span + surplus } : item)) };
    }

    /*
      A row with no air gains one on the side its neighbour above leaves
      filled — except the full-width strip, which stays full width and takes
      the surplus into its own span.
    */
    if (row.items.length === 1 && row.items[0].kind === 'section') {
      const only = row.items[0];
      if (only.span === COLUMNS_AT[1440]) {
        return { items: [{ ...only, span: columns }] };
      }
    }

    const side: 'left' | 'right' = lastSide === 'right' ? 'left' : 'right';
    lastSide = side;
    const air: RowItem = { kind: 'air', span: surplus };
    return { items: side === 'left' ? [air, ...row.items] : [...row.items, air] };
  });
}

/**
 * §26's placement, as **two rules keyed to the HOST** (step 28).
 *
 * "A figure in a full-width strip takes a two-column right inset; a figure in
 * an air column is centred in it. **Neither rule depends on solo or pair.**"
 *
 * Design's derivation is entirely about the host, which is why the figure's
 * own kind does no work here: a full-width strip has no air of its own, so
 * the figure is set against the page edge by a module; **an air column IS the
 * host**, so centring is what being in the air means.
 *
 * This replaces a single right-inset constant fitted across both.
 * Measured on §26's drawing: the air figure's host is 840..1440 (midpoint
 * 1140.0) and the figure spans 1043.4..1237.2 (midpoint 1140.3) — centred to
 * 0.3px, where the "203px inset" was centring seen from one side. The strip
 * figure is genuinely inset at 242.9 = 2.02 columns. One constant is right
 * for one and wrong for the other, and it put both figures on x = 1200 at
 * 1440 where the drawing has them 40px apart.
 *
 * **Keyed to the host rather than the figure because §21 applies this
 * vocabulary to six more screens**, where an air column may hold a solo and a
 * strip a pair. This drawing has one of each, so a rule written to the figure
 * type would encode that correlation.
 */
export const FIGURE_INSET_COLUMNS = 2;

export type FigureHost = 'strip' | 'air';

export function figurePlacement({
  host,
  hostWidth,
  columnWidth,
  figureWidth,
}: {
  host: FigureHost;
  hostWidth: number;
  columnWidth: number;
  figureWidth: number;
  /** Accepted and deliberately unused: the rule is the host's (step 28). */
  kind?: 'solo' | 'pair';
}): { left: number; right: number } {
  if (host === 'strip') {
    const right = FIGURE_INSET_COLUMNS * columnWidth;
    return { right, left: hostWidth - right - figureWidth };
  }
  const gap = (hostWidth - figureWidth) / 2;
  return { left: gap, right: gap };
}
