/**
 * The pure geometry behind the §8.1 canvas, separated from the component so it
 * can be tested directly.
 *
 * Both functions here fix defects found by looking at the rendered graph rather
 * than by reasoning about it — the first screenshot reported "7 nodes" while
 * showing four, because the rest had been pushed outside a fixed viewBox.
 */

export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 560;

/**
 * Radius scales with `ownedCount` (§8.1) on a SQUARE ROOT, so area rather than
 * radius tracks the count. A linear radius would draw a 9-record artist at 81
 * times the area of a 1-record artist, which overstates the difference as badly
 * as a flat circle understates it.
 */
export function radiusFor(ownedCount: number): number {
  return 6 + Math.sqrt(ownedCount) * 7;
}

export type Positioned = { x?: number; y?: number };

export type Bounds = { x: number; y: number; w: number; h: number };

/**
 * The box that actually contains the settled layout.
 *
 * **Not layout tuning.** §8.1 forbids a layout that implies structure the data
 * does not have; this moves no node. The simulation result is untouched and the
 * camera is pointed at where it landed, which is the difference between framing
 * a photograph and staging one.
 */
export function boundsFor(nodes: Positioned[]): Bounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  }

  const pad = 60;
  const xs = nodes.map((node) => node.x ?? 0);
  const ys = nodes.map((node) => node.y ?? 0);

  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  /**
   * Never zoom PAST 1:1 for a small graph. Two nodes stretched across a
   * wall-sized canvas reads as a much larger collection than it is, which is
   * the same confidently-misleading failure §8.1 names, arrived at from the
   * opposite direction.
   */
  return {
    x: minX,
    y: minY,
    w: Math.max(maxX - minX, CANVAS_WIDTH),
    h: Math.max(maxY - minY, CANVAS_HEIGHT),
  };
}
