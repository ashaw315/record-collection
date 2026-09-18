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

/** The same frame, at least `minWidth` × `minHeight` — the drawing is never smaller than the region that shows it, so a record landing in the region lands inside the svg. */
export function widened(
  frame: { viewBox: string; width: number; height: number },
  minWidth: number,
  minHeight = 0,
): { viewBox: string; width: number; height: number } {
  const width = Math.max(frame.width, minWidth);
  const height = Math.max(frame.height, minHeight);
  if (width === frame.width && height === frame.height) return frame;
  const [minX, minY] = frame.viewBox.split(' ').map(Number);
  return { viewBox: `${minX} ${minY} ${width} ${height}`, width, height };
}

/**
 * The frame grown to hold `extents` as well — its origin moving up or left
 * as needed, its size the union. The seated frame (already widened to the
 * region) keeps every pixel it had, so a region that shows all of it still
 * does; the growth is overflow the region can scroll to (§11.22).
 */
export function unionFrame(
  frame: { viewBox: string; width: number; height: number },
  extents: ReadonlyArray<{ minX: number; maxX: number; minY: number; maxY: number }>,
): { viewBox: string; width: number; height: number } {
  if (extents.length === 0) return frame;
  const [x, y] = frame.viewBox.split(' ').map(Number);
  let minX = x;
  let minY = y;
  let maxX = x + frame.width;
  let maxY = y + frame.height;
  for (const e of extents) {
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
  }
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  return { viewBox: `${minX.toFixed(0)} ${minY.toFixed(0)} ${width} ${height}`, width, height };
}
