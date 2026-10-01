import { type Page } from '@playwright/test';
import { GRID_COLUMN, GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';
import { FIGURE_INSET_COLUMNS } from '../src/app/records/[id]/region-rows';

/**
 * §57's reading of the lower region's figures, shared by the step's spec
 * (`figures-type-57.spec.ts`, seeded records) and the real-collection report
 * (`sheet/figures-57.sheet.ts`, read-only): every figure against its host's
 * type, measured the way the component measures it.
 */
export const WIDTHS: ReadonlyArray<[number, number]> = [[390, 844], [480, 844], [1000, NO_SCROLL_HEIGHT], [GRID_FORK, NO_SCROLL_HEIGHT], [1920, NO_SCROLL_HEIGHT]];

export type FigureReading = {
  /** The section the figure is in, and the cell it is hosted by ('section' when the section itself is the host). */
  host: string; cell: string; kind: string | null; state: string | null; shown: boolean;
  /** §58: the host column's inner width (inside both insets) and the component's own terms as it reported them. */
  columnWidth: number; terms: { free: number | null; heightTerm: number | null; widthTerm: number | null; binds: string | null };
  hostHeight: number; hostTop: number; hostBottom: number; hostLeft: number; hostRight: number;
  top: number; bottom: number; left: number; right: number; height: number; width: number;
  /** The bottom of the lowest text in the figure's own column, from the host's top; 0 when the column holds none. */
  textBottom: number; columnLeft: number;
  covered: string[]; cutEdges: number;
};

/** Every figure in the lower region, read against its host's text the way the component reads it. */
export const MEASURE = `(() => {
  const R = (el) => el.getBoundingClientRect();
  /* Type by its GLYPHS: the section label's box spans the strip while its letters stop early, and a box test finds every solo under "Price history". */
  const glyphs = (t) => { const out = []; for (const n of Array.from(t.childNodes)) { if (n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() === '') continue; const r = document.createRange(); r.selectNodeContents(n); for (const x of Array.from(r.getClientRects())) if (x.width > 0 && x.height > 0) out.push(x); } if (out.length > 0) return out; const b = R(t); return b.width > 0 && b.height > 0 ? [b] : []; };
  /* Hidden-from-readers counts only INSIDE the host: an air column is aria-hidden as a whole and type placed in it is still painted. */
  const hiddenInside = (root, t) => { for (let a = t; a !== null && a !== root; a = a.parentElement) if (a.getAttribute('aria-hidden') === 'true') return true; return false; };
  const typeIn = (root, skip) => Array.from(root.querySelectorAll('*')).filter((t) => t !== skip && !skip.contains(t) && !hiddenInside(root, t) && Array.from(t.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim() !== '')).flatMap((t) => glyphs(t).map((b) => ({ text: (t.textContent || '').trim().slice(0, 40), b })));
  return Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).map((f) => {
    const host = f.parentElement; const h = R(host); const b = R(f);
    const shown = getComputedStyle(f).display !== 'none';
    const text = typeIn(host, f);
    /* §58: a figure hosted by a content cell is bounded by that cell; a strip-hosted one by the content cell under its right edge (§57). */
    const hostedByCell = (host.getAttribute('data-cell') || '').startsWith('content-');
    const xRight = hostedByCell ? h.right - ${CELL_PADDING} : h.right - ${FIGURE_INSET_COLUMNS * GRID_COLUMN};
    const column = hostedByCell ? host : (Array.from(host.querySelectorAll('[data-cell^="content-"]')).find((c) => { const cb = R(c); return cb.left <= xRight - 1 && xRight - 1 <= cb.right && cb.top <= h.bottom - ${CELL_PADDING} - 1 && h.bottom - ${CELL_PADDING} - 1 <= cb.bottom; }) || null);
    const columnText = column === null ? text : typeIn(column, f);
    const num = (k) => (f.getAttribute(k) === null ? null : Number(f.getAttribute(k)));
    const terms = { free: num('data-free-height'), heightTerm: num('data-height-term'), widthTerm: num('data-width-term'), binds: f.getAttribute('data-binds') };
    const textBottom = Math.max(0, ...columnText.map((t) => t.b.bottom - h.top));
    const clip = { left: Math.max(b.left, h.left), right: Math.min(b.right, h.right), top: Math.max(b.top, h.top), bottom: Math.min(b.bottom, h.bottom) };
    const covered = shown ? text.filter((t) => t.b.left < clip.right && clip.left < t.b.right && t.b.top < clip.bottom && clip.top < t.b.bottom).map((t) => t.text) : [];
    const section = f.closest('[data-section]');
    return { host: section === null ? (host.getAttribute('data-cell') || 'air') : section.getAttribute('data-section'), cell: hostedByCell ? host.getAttribute('data-cell') : 'section', columnWidth: column === null ? h.width - 2 * ${CELL_PADDING} : column.clientWidth - 2 * ${CELL_PADDING}, terms, kind: f.getAttribute('data-figure'), state: f.getAttribute('data-figure-state'), shown, hostHeight: h.height, hostTop: h.top, hostBottom: h.bottom, hostLeft: h.left, hostRight: h.right, top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width, textBottom, columnLeft: column === null ? h.left : R(column).left, covered, cutEdges: [b.top < h.top - 0.5, b.bottom > h.bottom + 0.5, b.left < h.left - 0.5, b.right > h.right + 0.5].filter(Boolean).length };
  });
})()`;

export const SETTLED = `Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).every((f) => f.getAttribute('data-figure-state') !== null && f.getAttribute('data-figure-state') !== 'measuring')`;

export async function readFigures(page: Page): Promise<FigureReading[]> {
  await page.locator('[data-region="extended-grid"]').waitFor({ timeout: 20_000 });
  await page.waitForFunction(SETTLED, undefined, { timeout: 10_000 });
  await page.waitForTimeout(250);
  return page.evaluate(MEASURE) as Promise<FigureReading[]>;
}
