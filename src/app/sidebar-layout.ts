/**
 * Step 113, §T.1 and §T.6: Adam's wireframe as arithmetic. The table and
 * the grid take a sidebar above a fork; everything that follows from its
 * width is derived here once, so the stylesheet, the page and the specs
 * cannot hold different figures.
 */

/** "Its content runs from 18 to 318, its rule is at 336, and the content column's elements start at 377." */
export const SIDEBAR = {
  width: 336,
  /** The full-height 1px rule that closes it. */
  rule: 1,
  /** §G.3's 18, the header's inset, so the wordmark stands over SEARCH. */
  inset: 18,
  /** "40 from the sidebar's rule... and 40 from the window's right." */
  gap: 40,
  /** What the sidebar, its rule and the two 40s take from the window: §T.5's 417. */
  taken: 417,
} as const;

/** "Above that the content column stops growing, its right edge at 1,400, where a 1440 window puts it." */
export const CAP = 1440;

/**
 * "The Record column's minimum is a stated figure, measured once on today's
 * collection as the measure at which its longest title sets in two lines,
 * and then held." Measured 10 Oct 2026 on the real collection: "On The
 * Radio: Greatest Hits Vol. 1 & 2", 210.5 on one line. Never recomputed.
 */
export const RECORD_MINIMUM = 128;

/** Label, Format, Year, Cond. and Paid at their content's own widths with their 16 of padding, measured with it: 136.6, 62.2, 52.4, 54.5, 61.9. */
export const OTHER_COLUMNS = 367.6;

/**
 * What the fork is set from, on the coordinator's ruling of 10 Oct: the
 * width Record has at a 768 window with no sidebar, which Adam has judged
 * from step 98's capture. At the 128 floor the fork would be 913 and Record
 * would fall from about 505 to 128 across it, narrower than on the window
 * the fork exists to keep the sidebar out of.
 */
export const RECORD_AT_FORK = 269;

/** The narrowest window that takes the sidebar. Below it the two-row band and the filters above the table stand. */
export const FORK = Math.ceil(RECORD_AT_FORK + OTHER_COLUMNS + SIDEBAR.taken);

/** Below the fork, §T.1's measure for search and the filter lines. Above it they take the sidebar's own width, whatever that is. */
const BAND_MEASURE = 443;

/** "The head figure is the fraction of the content column's width that it is in the wireframe": 394 of 1,202, measured 10 Oct. */
export const FIGURE_FRACTION = 0.328;

/** The fragment is drawn larger than the head's figure and half of it is off the window's left. Not ruled; Code's, for Adam's capture. */
const FRAGMENT_SCALE = 1.5;

const INK = 'oklch(0.19 0.008 60)';

/** The content column's width in a window: the window less 417, to the cap. */
export function contentColumn(windowWidth: number): number {
  return Math.min(windowWidth, CAP) - SIDEBAR.taken;
}

/** §T.5: covers of 160 or wider, 24 apart, at least two to a row. "A column needs 184n − 24." */
export function gridColumns(width: number): number {
  return Math.max(2, Math.floor((width + 24) / 184));
}

export type FigureShape = { /** The construction's clearing height (§29's 6px on its narrowest face). */ clearing: number; /** Its own width over its height. */ aspect: number };

/**
 * §T.6, step 117: the head figure's box as fractions of the content column.
 * "Where the source's aspect is below 1, set the head figure's height to
 * 0.328 of the content column and its width to height × aspect." A wider
 * construction is 0.328 wide at its own ratio, as step 113 built every
 * one; so the fraction is the figure's longer side and neither side
 * passes it. Nothing reserves the square: the box is the drawing's.
 */
export function figureBox(aspect: number): { width: number; height: number } {
  return aspect < 1 ? { width: FIGURE_FRACTION * aspect, height: FIGURE_FRACTION } : { width: FIGURE_FRACTION, height: FIGURE_FRACTION / aspect };
}

/** The narrowest content column whose figure is as tall as its clearing height: "below the clearing height there is no figure." The height is the capped one, so a tall construction clears no sooner for being narrow. */
export function figureColumnMinimum(figure: FigureShape): number {
  return figure.clearing / figureBox(figure.aspect).height;
}

/**
 * The band's own rules above the fork, to follow `bandRules` in the band's
 * stylesheet: search over the view names, both the sidebar's width, and Add
 * record gone from it, since it stands at the content column's top right.
 */
export function bandForkRules(): string {
  const rail = '[data-collection-band] [data-testid="wall-rail"]';
  return `
  [data-collection-band] [data-search-box] { max-width: ${BAND_MEASURE}px; }
  @media (min-width: ${FORK}px) {
    ${rail} { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 34px; padding: 34px 0 0 !important; }
    ${rail} form { flex: none; }
    ${rail} > a { display: none; }
    [data-collection-band] [data-search-box] { max-width: none; }
  }`;
}

/**
 * The page's rules. Sizes that follow the window are container units of
 * `main`, so the figure is the fraction of the column that is actually
 * there and not of a viewport a scrollbar has narrowed.
 */
export function sidebarRules(figure: FigureShape | null): string {
  const column = `(100cqw - ${SIDEBAR.taken}px)`;
  const figureRules =
    figure === null
      ? ''
      : `
    [data-collection-sidebar], [data-collection-content] { ${figure.aspect < 1 ? `--figure-height: calc(${column} * ${FIGURE_FRACTION}); --figure-width: calc(var(--figure-height) * ${figure.aspect});` : `--figure-width: calc(${column} * ${FIGURE_FRACTION}); --figure-height: calc(var(--figure-width) / ${figure.aspect});`} }
    [data-head-figure] { position: relative; width: var(--figure-width); height: var(--figure-height); margin: 24px auto; }
    [data-diagonal] { display: block; position: absolute; height: 0; border-top: 1px solid ${INK}; transform-origin: 0 0; pointer-events: none; }
    /* Down and to the left from inside the figure, ending in air 6 above the head's foot. */
    [data-diagonal="head-air"] { left: calc(50% - var(--figure-width) * 0.05); top: calc(24px + var(--figure-height) * 0.55); width: calc(var(--figure-height) * 0.9 + 36px); transform: rotate(150deg); }
    /* Up and to the right from inside the figure, ending on the header's rule. */
    [data-diagonal="head-rule"] { left: calc(50% + var(--figure-width) * 0.05); top: calc(24px + var(--figure-height) * 0.2); width: calc(48px + var(--figure-height) * 0.4); transform: rotate(-30deg); }
    [data-sidebar-fragment] { display: block; position: relative; margin: 24px -${SIDEBAR.inset}px 0; height: calc(var(--figure-height) * ${FRAGMENT_SCALE}); overflow: hidden; }
    [data-fragment-figure] { position: absolute; top: 0; left: calc(var(--figure-width) * ${-FRAGMENT_SCALE / 2}); width: calc(var(--figure-width) * ${FRAGMENT_SCALE}); height: 100%; }
    /* From the window's left edge up to the sidebar's rule. */
    [data-diagonal="fragment-rule"] { left: 0; top: calc(var(--figure-height) * ${FRAGMENT_SCALE * 0.15} + ${(SIDEBAR.width * Math.tan(Math.PI / 6)).toFixed(2)}px); width: ${(SIDEBAR.width / Math.cos(Math.PI / 6)).toFixed(2)}px; transform: rotate(-30deg); }
    [data-diagonal="fragment-air"] { left: 96px; top: calc(var(--figure-height) * ${FRAGMENT_SCALE} - 12px); width: 150px; transform: rotate(-30deg); }
    @container collection (width < ${figureColumnMinimum(figure) + SIDEBAR.taken}px) {
      [data-head-figure], [data-sidebar-fragment], [data-diagonal] { display: none; }
    }`;

  return `
  [data-collection-lines] { max-width: ${BAND_MEASURE}px; }
  [data-collection-head], [data-sidebar-fragment], [data-diagonal], [data-sort-chevron], [data-undated-figure] { display: none; }
  @media (min-width: ${FORK}px) {
    [data-collection-views] { display: grid; grid-template-columns: ${SIDEBAR.width + SIDEBAR.rule}px minmax(0, 1fr); max-width: ${CAP}px; min-height: calc(100vh - var(--app-nav-height, 0px)); container: collection / inline-size; }
    [data-collection-sidebar] { box-sizing: border-box; min-width: 0; padding: 0 ${SIDEBAR.inset}px; border-right: ${SIDEBAR.rule}px solid ${INK}; }
    [data-collection-content] { min-width: 0; padding: 0 ${SIDEBAR.gap}px 24px; }
    /* Record's stated floor, beside the sidebar only: below the fork a 320 window's table is 280 and the column is whatever that leaves. */
    [data-collection-table] thead th:first-child { min-width: ${RECORD_MINIMUM}px; }
    [data-collection-controls] { padding: 34px 0 0; }
    [data-collection-heading] { margin-bottom: 34px; }
    [data-collection-filters] { margin-bottom: 0; }
    [data-sort-row] { border-top: 1px solid ${INK}; border-bottom: 1px solid ${INK}; padding: 9px 0; margin-bottom: 12px; }
    [data-sort-control] { width: 100%; justify-content: space-between; border-bottom-width: 0; }
    [data-sort-chevron] { display: block; }
    [data-collection-lines] { max-width: none; }
    [data-filter-after] { border-top: 1px solid ${INK}; margin-top: 12px; }
    [data-filter-after] > * { margin-top: 0; }
    [data-filter-undated-row] { min-height: 44px; flex-wrap: nowrap; justify-content: space-between; }
    [data-undated-sentence] { display: none; }
    [data-undated-figure] { display: inline; }
    [data-filter-clear] { display: flex; align-items: center; height: 44px; font-family: var(--font-geist-mono); text-transform: uppercase; letter-spacing: 0.1em; color: ${INK}; text-decoration: none; }
    /* A flow root, so the figure's 24 stays inside the head and does not move the head's own top, which ADD RECORD and the diagonals are placed from. */
    [data-collection-head] { display: flow-root; position: relative; min-height: 124px; }${figureRules}
  }`;
}
