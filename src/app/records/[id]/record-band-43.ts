import metrics from './font-metrics.json';
import { RECORD_BAND_QUARTERS, fillRows, packRecordBand, packedRules } from './record-band-41';

/**
 * §43 (step 51): "The server renders the record band already packed, from
 * each cell's content, so first paint is the packed layout and nothing below
 * the band moves." Step 47's packer measured after paint, so the page painted
 * the stacked layout and repacked: on Bridge at 1000 the band painted at 591,
 * held for 10 to 22 frames, and settled at 317 between 165 and 485ms.
 *
 * Candidate 2 of the three §43 costed: the server estimates each cell's
 * width from the runs of text it is about to render, with every glyph's
 * advance taken from the page's own fonts (`font-metrics.json`, generated
 * with the fonts loaded) rather than one average coefficient. The band's
 * width is the viewport's, which the server does not know, so the estimate
 * is stated per width range: a cell's quarters change only where its width
 * crosses a multiple of a quarter, and those crossings are computable from
 * the estimate alone. The stylesheet sets the same custom properties the
 * after-paint packer set, so the fork's rules read either the same way.
 */

export type Register = keyof typeof metrics.registers;

export type Run = {
  text: string;
  register: Register;
  /** A block of prose that wraps at the cell's width, so its widest line is at most the cell's measure. */
  wraps?: boolean;
};

export type CellRuns = { name: string; runs: Run[] };

/** The label register's tracking (§4: 0.09em), added after every glyph as the browser does. */
const LABEL_TRACKING_EM = 0.09;
/** The cell's padding on each side (`p-[18px]`). */
export const CELL_PADDING = 18;
export const PACK_FLOOR = 960;
export const PACK_CEILING = 1440;

/** The width a run of text sets to in a register: the sum of its glyphs' advances, uppercased and tracked for a label. */
export function estimateWidth(text: string, register: Register): number {
  const { advances, size } = metrics.registers[register] as { advances: Record<string, number>; size?: number };
  const upper = register === 'label';
  const source = upper ? text.toUpperCase() : text;
  let width = 0;
  for (const ch of source) {
    const advance = advances[ch] ?? advances['n'] ?? 0;
    width += advance;
    if (upper) width += LABEL_TRACKING_EM * (size ?? 11);
  }
  return width;
}

/** A cell's ink at a band width: the widest of its runs, a wrapping run at most the cell's measure. */
const inkAt = (cell: CellRuns, width: number): number =>
  Math.max(0, ...cell.runs.map((r) => (r.wraps ? Math.min(estimateWidth(r.text, r.register), width - 2 * CELL_PADDING) : estimateWidth(r.text, r.register))));

/** The label the cell can never narrow below (§34): its widest label-register run. */
const labelAt = (cell: CellRuns): number => Math.max(0, ...cell.runs.filter((r) => r.register === 'label').map((r) => estimateWidth(r.text, r.register)));

/** Each cell's quarters at a band width, rows filled (§42). */
export function spansAt(cells: ReadonlyArray<CellRuns>, width: number): number[] {
  return fillRows(packRecordBand({ quarter: width / RECORD_BAND_QUARTERS, padding: CELL_PADDING, cells: cells.map((c) => ({ ink: inkAt(c, width), label: labelAt(c) })) }));
}

/**
 * The widths at which any cell's quarters can change: for a run of width r
 * needing k quarters, the band width 4 (r + 2p) / k. Between two such
 * widths every cell's quarters are constant, so one rule block serves the
 * whole range.
 */
function crossings(cells: ReadonlyArray<CellRuns>): number[] {
  const out = new Set<number>();
  for (const cell of cells) {
    const widths = cell.runs.map((r) => estimateWidth(r.text, r.register));
    for (const w of [...widths, labelAt(cell)]) {
      for (let k = 1; k <= RECORD_BAND_QUARTERS; k += 1) {
        const at = Math.ceil((RECORD_BAND_QUARTERS * (w + 2 * CELL_PADDING)) / k);
        if (at > PACK_FLOOR && at < PACK_CEILING) out.add(at);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The per-record stylesheet: for every width range from 960 to 1439, each cell's quarters and rules. */
export function recordBandStylesheet(cells: ReadonlyArray<CellRuns>): string {
  const bounds = [PACK_FLOOR, ...crossings(cells), PACK_CEILING];
  const blocks: string[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const from = bounds[i];
    const to = bounds[i + 1] - 1;
    const spans = spansAt(cells, from);
    const rules = packedRules(spans);
    const lines = cells.map((c, k) => `[data-band="record"] > [data-cell="${c.name}"] { --packed: ${spans[k]}; --rule-right: ${rules[k].right}px; --rule-top: ${rules[k].top}px; }`);
    blocks.push(`@media (min-width: ${from}px) and (max-width: ${to}px) {\n${lines.join('\n')}\n}`);
  }
  return blocks.join('\n');
}
