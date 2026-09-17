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
import { slideY } from './pull-geometry';
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

export function wallLayout(
  seats: readonly ShelfSeat[],
  pulledId: string | null,
  pose: PullPose | null,
  minWidth: number,
): WallLayout {
  const placed: PlacedSeat[] = [];
  const breaks: (readonly [Point, Point])[] = [];
  const rowZ: number[] = [];
  intoShelves(seats).forEach((shelf, row) => {
    /* The plane spans the pulled SEAT (5b §2); the record itself is placed where the slide has it. */
    const rowSeats = layoutRow(shelf, row, pulledId);
    breaks.push(...rowBreaks(shelf, rowSeats));
    rowZ.push(rowSeats[0]?.z ?? 0);
    placed.push(
      ...rowSeats.map((seat) =>
        seat.id === pulledId && pose !== null ? { ...seat, y: slideY(pose) } : seat,
      ),
    );
  });
  /*
    Framed on the faces, at least as wide as the container; the planes span
    that frame and run off both of its edges (§11.8): the plane is the wall,
    and the wall is the pan extent.
  */
  const frame = widened(
    wallFrame(placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)])),
    minWidth,
  );
  const span = planeSpan(frameRange(frame));
  return { placed, breaks, frame, planes: rowZ.map((z) => shelfPlane(z, span)) };
}
