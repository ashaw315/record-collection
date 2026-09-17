import {
  frontFace,
  layoutRow,
  paintOrder,
  planeSpan,
  rightFace,
  rowBreaks,
  shelfPlane,
  topFace,
  type PlacedSeat,
  type Point,
} from './geometry';
import type { ShelfSeat } from './shelf-runs';
import { intoShelves } from './shelf-rows';
import { frameRange, wallFrame } from './wall-frame';

/**
 * The wall, zoomed out (The Wall 5b §5, D2).
 *
 * **Polygons only — no text, no interaction.** §5: labels render at 1:1 and are
 * REMOVED below it, never shrunk. A 9px label is an absolute floor rather than
 * a proportion, so a wall scaled to fit a 1440px viewport would render it at
 * 3.7px and violate the floor silently. Which gives the wall two states rather
 * than one degrading one — this is the unlabelled state.
 *
 * Zoomed out the wall is thickness, section gaps and the shape of the
 * collection: **encounter rather than retrieval**. Not colour: §11 makes the
 * wall at rest line, ink and paper.
 *
 * Drawn on the shared geometry by import: rows laid on the axis, one plane
 * per run, three faces per record — 5b's top face is what makes a spine an
 * object rather than a bar — painted back to front across the whole wall.
 */

const INK = '#161412';
const RULE = 'oklch(0.44 0.008 70)';

/**
 * **Paper, in three steps — not none.** §11 rules out derived colour at rest,
 * not fill: a painter's order can only hide the lines behind a face if the
 * face is opaque, and an outline row shows every edge through. D2's values:
 * the plane a step below paper, the faces at paper, the top a step above.
 */
export const PLANE_FILL = 'oklch(0.905 0.004 80)';
export const FACE_FILL = 'oklch(0.925 0.004 80)';
export const TOP_FILL = 'oklch(0.948 0.004 80)';

export const points = (polygon: readonly Point[]) =>
  polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

export function WallOverview({
  seats,
  pulledId,
}: {
  seats: readonly ShelfSeat[];
  pulledId: string | null;
}) {
  const placed: PlacedSeat[] = [];
  const breaks: (readonly [Point, Point])[] = [];
  const rowZ: number[] = [];
  intoShelves(seats).forEach((shelf, row) => {
    const rowSeats = layoutRow(shelf, row);
    breaks.push(...rowBreaks(shelf, rowSeats));
    rowZ.push(rowSeats[0]?.z ?? 0);
    /* The pulled record's SEAT is still spanned by its plane; no spine is drawn on it. */
    placed.push(...rowSeats.filter((seat) => seat.id !== pulledId));
  });
  /* Framed on the faces; the planes then span the frame and run off both of its edges (§11.8). */
  const frame = wallFrame(placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)]));
  const span = planeSpan(frameRange(frame));
  const planes = rowZ.map((z) => shelfPlane(z, span));

  return (
    <svg
      viewBox={frame.viewBox}
      style={{ background: 'oklch(0.925 0.004 80)', width: '100%', height: 'auto' }}
    >
      {planes.map((plane, index) => (
        <polygon key={`plane-${index}`} data-plane="" points={points(plane)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
      ))}
      {/* §2's breaks: a rule across the plane at the seat boundary; the plane runs on past it. */}
      {breaks.map(([from, to], index) => (
        <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
      ))}
      {paintOrder(placed).map((seat) => (
        <g key={seat.id}>
          <polygon points={points(topFace(seat))} fill={TOP_FILL} stroke={INK} strokeWidth="1" />
          <polygon points={points(rightFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
          <polygon points={points(frontFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
        </g>
      ))}
    </svg>
  );
}
