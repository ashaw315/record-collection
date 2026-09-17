import { COS30, DEPTH, SPINE_HEIGHT, project, type PlacedSeat } from './geometry';

/**
 * Where §11.7's panel sits: in the plane of the page — flat, on paper, at
 * the record screen's type — to the right of the pulled record, vertically
 * aligned to the cover's top edge, as wide as the cover's projected width.
 * The projection is what the collection is drawn in; the record's facts are
 * read, and §4.1's split already says reading matter is set flat. Nothing in
 * the panel is sheared.
 */

/** The record screen's cell padding, between the cover's edge and the panel. */
export const PANEL_GAP = 34;

/**
 * A32's fork, a measurement rather than a breakpoint: below it there is no
 * room for a panel beside a record that still reads as an object, so the
 * panel OVERLAYS the projection rather than competing with it for width
 * (§11.8). The wall does not reflow — fewer records, not smaller ones.
 */
export const FORK_PX = 820;

export function panelAnchor(
  seat: PlacedSeat,
  frame: { viewBox: string },
): { left: number; top: number; width: number } {
  /* The cover's far-top corner: the right face's highest, rightmost point. */
  const [cx, cy] = project(seat.x + seat.width, seat.y, seat.z + SPINE_HEIGHT);
  const [minX, minY] = frame.viewBox.split(' ').map(Number);
  /* Whole pixels: the panel is laid out in the page's plane, not drawn in the projection. */
  return { left: Math.round(cx - minX + PANEL_GAP), top: Math.round(cy - minY), width: Math.round(DEPTH * COS30) };
}
