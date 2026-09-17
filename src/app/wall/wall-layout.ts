import {
  frontFace,
  layoutRow,
  planeSpan,
  rightFace,
  rowBreaks,
  shelfPlane,
  topFace,
  type PlacedSeat,
  type Point,
} from './geometry';
import { intoShelves } from './shelf-rows';
import type { PullPose } from './pull-curve';
import type { ShelfSeat } from './shelf-runs';
import { frameRange, wallFrame, widened } from './wall-frame';

/**
 * The wall's layout, computed once for whoever draws against it — the
 * labelled renderer, and the stage that places the panel against the pulled
 * record's cover. Two callers deriving the same placement separately is the
 * two-producers shape this project keeps finding.
 */
export type WallLayout = {
  placed: PlacedSeat[];
  planes: (readonly Point[])[];
  breaks: (readonly [Point, Point])[];
  frame: { viewBox: string; width: number; height: number };
};

export type Moving = { id: string; pose: PullPose };

export function wallLayout(
  seats: readonly ShelfSeat[],
  moving: readonly Moving[],
  minWidth: number,
  minHeight = 0,
): WallLayout {
  /* A pulled record keeps its seat: its faces fade there as the cover lifts off (landing.ts). */
  void moving;
  const placed: PlacedSeat[] = [];
  const breaks: (readonly [Point, Point])[] = [];
  const rowZ: number[] = [];
  intoShelves(seats).forEach((shelf, row) => {
    const rowSeats = layoutRow(shelf, row);
    breaks.push(...rowBreaks(shelf, rowSeats));
    rowZ.push(rowSeats[0]?.z ?? 0);
    placed.push(...rowSeats);
  });
  /*
    Framed on the faces, at least as wide as the container; the planes span
    that frame and run off both of its edges (§11.8): the plane is the wall,
    and the wall is the pan extent.
  */
  const frame = widened(
    wallFrame(placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)])),
    minWidth,
    minHeight,
  );
  const span = planeSpan(frameRange(frame));
  return { placed, breaks, frame, planes: rowZ.map((z) => shelfPlane(z, span)) };
}
