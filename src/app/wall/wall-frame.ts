import type { Point } from './geometry';

/**
 * The viewBox that frames whatever the wall drew, with a margin.
 *
 * Computed from the projected points rather than from the layout constants:
 * a row on the axis descends as it goes, so the wall's extent is a property
 * of the projection and not of a count times a pitch.
 */
export function wallFrame(
  ...groups: ReadonlyArray<ReadonlyArray<readonly Point[]>>
): { viewBox: string; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const group of groups) {
    for (const polygon of group) {
      for (const [x, y] of polygon) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return { viewBox: '0 0 1 1', width: 1, height: 1 };
  const pad = 30;
  const width = Math.round(maxX - minX + pad * 2);
  const height = Math.round(maxY - minY + pad * 2);
  return {
    viewBox: `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${width} ${height}`,
    width,
    height,
  };
}

export function wallViewBox(...groups: ReadonlyArray<ReadonlyArray<readonly Point[]>>): string {
  return wallFrame(...groups).viewBox;
}

/** The frame's screen-x range, for a plane that must run past both of its edges. */
export function frameRange(frame: { viewBox: string; width: number }): { minX: number; maxX: number } {
  const minX = Number(frame.viewBox.split(' ')[0]);
  return { minX, maxX: minX + frame.width };
}

/** The same frame, at least `minWidth` wide — the pan extent is never narrower than the view. */
export function widened(
  frame: { viewBox: string; width: number; height: number },
  minWidth: number,
): { viewBox: string; width: number; height: number } {
  if (minWidth <= frame.width) return frame;
  const [minX, minY, , height] = frame.viewBox.split(' ').map(Number);
  return { viewBox: `${minX} ${minY} ${minWidth} ${height}`, width: minWidth, height: frame.height };
}
