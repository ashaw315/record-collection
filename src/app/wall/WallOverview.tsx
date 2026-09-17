import { frontFace, layoutRow, paintOrder, rowPlanes, type PlacedSeat, type Point } from './geometry';
import type { ShelfSeat } from './shelf-runs';
import { wallViewBox } from './wall-frame';

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
 * per run, faces painted back to front across the whole wall.
 */

/** How many records sit on one shelf before the wall wraps to the next. */
export const PER_SHELF = 40;

const INK = '#161412';
const RULE = 'oklch(0.44 0.008 70)';

export const points = (polygon: readonly Point[]) =>
  polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

export function WallOverview({
  seats,
  pulledId,
}: {
  seats: readonly ShelfSeat[];
  pulledId: string | null;
}) {
  const planes: (readonly Point[])[] = [];
  const placed: PlacedSeat[] = [];
  for (let index = 0, row = 0; index < seats.length; index += PER_SHELF, row += 1) {
    const shelf = seats.slice(index, index + PER_SHELF);
    const rowSeats = layoutRow(shelf, row, pulledId);
    planes.push(...rowPlanes(shelf, rowSeats, pulledId));
    /* The pulled record's SEAT is still spanned by its plane; no spine is drawn on it. */
    placed.push(...rowSeats.filter((seat) => seat.id !== pulledId));
  }

  return (
    <svg
      viewBox={wallViewBox(planes, placed.map(frontFace))}
      style={{ background: 'oklch(0.925 0.004 80)', width: '100%', height: 'auto' }}
    >
      {planes.map((plane, index) => (
        <polygon key={`plane-${index}`} data-plane="" points={points(plane)} fill="none" stroke={RULE} strokeWidth="1" />
      ))}
      {paintOrder(placed).map((seat) => (
        <polygon key={seat.id} points={points(frontFace(seat))} fill="none" stroke={INK} strokeWidth="1" />
      ))}
    </svg>
  );
}
