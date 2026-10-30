/**
 * **The production measurement of §W.8's window: its recorder and its
 * judgement (NOTES, 29 Oct 18:30, amended 19:55).** The stopping rule was
 * fixed before any load: 8 cells of 30 loads, round-robin, no early stop
 * either way; the window occurs in a load where a frame with spines is
 * painted while the document is still `loading`, and its width is that frame
 * to interactive. The CLI is `scripts/measure-window.mts`, which Adam runs;
 * the recorder is shown able to see the window by `e2e/window-measure.spec.ts`,
 * against the proxy that holds it open.
 */
import type { Page } from '@playwright/test';

export type Marks = {
  spineAt: number | null;
  frameAt: number | null;
  frameReadyState: string | null;
  interactiveAt: number | null;
  hydratedAt: number | null;
};

export type Window = { kind: 'occurred'; widthMs: number } | { kind: 'none' } | { kind: 'broken'; reason: string };

export type Cell = { cache: 'cold' | 'warm'; network: 'none' | 'fast-3g' | 'slow-3g' | 'slow-3g-cpu4' };

export type Load = { cell: string; window: Window };

/** The presets of the 29 Oct 15:30 local measurement, so the two can be read side by side. */
export const NETWORK: Record<Cell['network'], { latency: number; kbps: number | null; cpu: number }> = {
  none: { latency: 0, kbps: null, cpu: 1 },
  'fast-3g': { latency: 150, kbps: 1600, cpu: 1 },
  'slow-3g': { latency: 400, kbps: 400, cpu: 1 },
  'slow-3g-cpu4': { latency: 400, kbps: 400, cpu: 4 },
};

export const CELLS: Cell[] = (['cold', 'warm'] as const).flatMap((cache) => (['none', 'fast-3g', 'slow-3g', 'slow-3g-cpu4'] as const).map((network) => ({ cache, network })));

export const cellName = (cell: Cell) => `${cell.cache}/${cell.network}`;

/** Every cell once per round, so time of day and Vercel's state fall across the cells and not on one. */
export function schedule<T>(cells: T[], perCell: number): T[] {
  return Array.from({ length: perCell }, () => cells).flat();
}

/**
 * Three states. A load that never showed a spine or never reached
 * interactive is broken: it is not a load in which the window did not
 * occur, and counting it as one would pad a null.
 */
export function windowOf(m: Marks): Window {
  if (m.spineAt === null || m.frameAt === null) return { kind: 'broken', reason: 'no spine was painted' };
  if (m.interactiveAt === null) return { kind: 'broken', reason: 'the document never reached interactive' };
  if (m.frameReadyState !== 'loading') return { kind: 'none' };
  return { kind: 'occurred', widthMs: Math.max(0, m.interactiveAt - m.frameAt) };
}

/** The verdict in the stopping rule's words. A null is the counted claim and its bound, never "does not occur". */
export function verdict(loads: Load[]): { occurred: boolean; sentence: string; broken: number } {
  const counted = loads.filter((l) => l.window.kind !== 'broken');
  const broken = loads.length - counted.length;
  const hits = counted.flatMap((l) => (l.window.kind === 'occurred' ? [{ cell: l.cell, widthMs: l.window.widthMs }] : []));
  if (hits.length > 0) {
    const widest = hits.reduce((a, b) => (b.widthMs > a.widthMs ? b : a));
    return { occurred: true, broken, sentence: `The window occurred in ${hits.length} of ${counted.length} loads; the widest run was ${Math.round(widest.widthMs)}ms, in ${widest.cell}.` };
  }
  const perCell = new Map<string, number>();
  for (const l of counted) perCell.set(l.cell, (perCell.get(l.cell) ?? 0) + 1);
  const smallest = Math.min(...perCell.values());
  const cells = [...perCell].map(([cell, n]) => `${cell} ${n}`).join(', ');
  return {
    occurred: false,
    broken,
    sentence: `In ${counted.length} loads across ${perCell.size} conditions (${cells}), no frame with spines was painted while the document was loading; per condition, below ${Math.round(300 / smallest)}% of loads at 95% (3/${smallest}).`,
  };
}

/**
 * Runs before the document exists. Marks the first spine inside the wall's
 * container, then the frame that paints it, with readyState in that frame;
 * interactive; and the wall's hydrated mark. A requestAnimationFrame
 * callback runs in the frame about to be painted, so readyState read there
 * is the document's state while the spines are drawn.
 */
export const RECORDER = `(() => {
  const marks = { spineAt: null, frameAt: null, frameReadyState: null, interactiveAt: null, hydratedAt: null };
  window.__windowMarks = marks;
  const interactive = () => { if (marks.interactiveAt === null && document.readyState !== 'loading') marks.interactiveAt = performance.now(); };
  document.addEventListener('readystatechange', interactive);
  const look = () => {
    if (marks.spineAt === null && document.querySelector('[data-wall-container] [data-spine]')) {
      marks.spineAt = performance.now();
      requestAnimationFrame(() => { marks.frameAt = performance.now(); marks.frameReadyState = document.readyState; });
    }
    if (marks.hydratedAt === null && document.querySelector('[data-wall-container][data-hydrated="true"]')) marks.hydratedAt = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-hydrated'] });
})();`;

export async function readMarks(page: Page): Promise<Marks> {
  return page.evaluate(() => (window as unknown as { __windowMarks: Marks }).__windowMarks);
}
