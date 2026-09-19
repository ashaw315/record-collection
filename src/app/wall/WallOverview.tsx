import { frontFace, rightFace, topFace, type Point } from './geometry';
import { PAPER_CSS } from '@/lib/colour/paper';
import { paintOrder, seatBounds } from './paint-sort';
import type { ShelfSeat } from './shelf-runs';
import { wallLayout } from './wall-layout';

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
export const FACE_FILL = PAPER_CSS;
export const TOP_FILL = 'oklch(0.948 0.004 80)';

export const points = (polygon: readonly Point[]) =>
  polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** A seat that can be named: the far view draws no text, so a linked record's name is its anchor's attribute. */
type NamedSeat = ShelfSeat & { artist?: string; title?: string };

export function WallOverview({
  seats,
  pulledId,
  linked = false,
}: {
  seats: readonly NamedSeat[];
  pulledId: string | null;
  /**
   * §11.24's narrow shelf: each record an anchor to its own screen. A tap
   * goes there rather than to a pulled state — the pull needs a 560 cover
   * and a 420 panel side by side, which a narrow screen cannot hold.
   */
  linked?: boolean;
}) {
  const { placed, furniture, breaks, frame } = wallLayout(seats, [], 0);
  const emptied = new Set(seats.filter((seat) => seat.empty).map((seat) => seat.id));
  /* §11.12: an emptied seat is laid out and draws nothing — the filter is a shape on the fixture. */
  const seated = placed.filter((seat) => seat.id !== pulledId && !emptied.has(seat.id));

  return (
    <svg data-wall="overview" viewBox={frame.viewBox} style={{ background: PAPER_CSS, width: '100%', height: 'auto' }}>
      {/* The unit's furniture first, as §11.11 draws it; the records stand on it. */}
      {furniture.map((face, index) => (
        <polygon key={`f-${index}`} data-furniture={face.kind} points={points(face.points)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
      ))}
      {breaks.map(([from, to], index) => (
        <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
      ))}
      {paintOrder(seated.map((seat) => seatBounds(seat))).map((bounds) => seated.find((seat) => seat.id === bounds.id) as (typeof seated)[number]).map((seat) => {
        const faces = (
          <>
            <polygon points={points(topFace(seat))} fill={TOP_FILL} stroke={INK} strokeWidth="1" />
            <polygon points={points(rightFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
            <polygon points={points(frontFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
          </>
        );
        const named = seats.find((s) => s.id === seat.id);
        const name = named?.artist !== undefined && named.title !== undefined ? `${named.artist} · ${named.title}` : undefined;
        return linked ? (
          <a key={seat.id} href={`/records/${seat.id}`} aria-label={name} data-far-seat={seat.id}>
            {faces}
          </a>
        ) : (
          <g key={seat.id}>{faces}</g>
        );
      })}
    </svg>
  );
}
