import { frontFace, rightFace, topFace, type PlacedSeat, type Point } from './geometry';
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
/**
 * §11.27's hover surface, and §11.28's hairline ON that surface. The hairline
 * is §5.5's shade step taken from 0.731 rather than from paper: left at
 * §3's 0.72 it reads 1.04:1 against the sunk run — worse than the 1.08:1
 * §11.27 refused 0.90 for — and erases the only channel separating one spine
 * from another, so the hover says one object at the moment it means a
 * shelf's worth of records. 0.588 gives 1.74:1, near the 1.99:1 the run has
 * at rest and deliberately not equal: matching rest needs ~0.556, a number
 * tuned to a target, where 0.588 is the step.
 */
const RUN_HOVER_SURFACE = 'oklch(0.731 0.004 80)';
const RUN_HOVER_RULE = 'oklch(0.588 0.004 80)';
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
  onSeatClick,
}: {
  seats: readonly NamedSeat[];
  pulledId: string | null;
  /**
   * §11.24's narrow shelf: each record an anchor to its own screen. A tap
   * goes there rather than to a pulled state — the pull needs a 560 cover
   * and a 420 panel side by side, which a narrow screen cannot hold.
   */
  linked?: boolean;
  /**
   * §11.12: where the pulled state DOES exist, a click on a seat is the way
   * in — the zoom to the near view, landing on that seat. The anchor stays,
   * so the route still works with JavaScript off; the click is intercepted.
   */
  onSeatClick?: (id: string) => void;
}) {
  const { placed, pieces, breaks, frame } = wallLayout(seats, [], 0);
  const emptied = new Set(seats.filter((seat) => seat.empty).map((seat) => seat.id));
  /* §11.12: an emptied seat is laid out and draws nothing — the filter is a shape on the fixture. */
  const seated = placed.filter((seat) => seat.id !== pulledId && !emptied.has(seat.id));

  return (
    <svg
      data-wall="overview"
      viewBox={frame.viewBox}
      /*
        The collection as an object, fitted whole to its region (§11.10):
        `meet` scales to whichever dimension binds, and the leftover space goes
        on BOTH sides — a portrait fixture in a landscape region fits the
        height, and pinned to xMin it sat in a narrow column with the region
        empty beside it.
      */
      preserveAspectRatio="xMidYMid meet"
      style={{ background: PAPER_CSS, width: '100%', height: '100%', maxHeight: '100%' }}
    >
      {breaks.map(([from, to], index) => (
        <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
      ))}
      {/*
        **One order over every object — pieces and records together (§11.23).**
        Painting all the furniture and then all the records is two passes, and
        it puts a shelf's front face down before the records standing on it:
        the spines then draw over the shelf and past the upright in front of
        them, which reads as a broken fixture rather than a paint-order fault.
        The near view has always interleaved; this is the same wall.
      */}
      {/*
        §11.28's hover: the run sinks, its hairlines are recomputed against
        that ground, and its count appears beside it. Two things at once —
        the sink says pressable in the vocabulary the chips already use, and
        the count says what is there, which is the one fact the far view
        withholds by design. No cursor-only signal, and no caption: a caption
        explaining a drawing is the admission that the drawing does not work.
      */}
      {onSeatClick === undefined ? null : (
        <style data-run-hover="">{`
[data-run]:hover polygon { fill: ${RUN_HOVER_SURFACE}; stroke: ${RUN_HOVER_RULE}; }
[data-run]:hover [data-run-label] { opacity: 1; }
[data-run] [data-run-label] { opacity: 0; }
[data-run] { cursor: pointer; }
`}</style>
      )}
      {paintOrder([
        ...pieces.map((piece) => ({ id: piece.id, ...piece.bounds })),
        ...seated.map((seat) => seatBounds(seat)),
      ]).map((object) => {
        const piece = pieces.find((p) => p.id === object.id);
        if (piece !== undefined) {
          return (
            <g key={piece.id} data-piece={piece.kind}>
              {piece.faces.map((face, index) => (
                <polygon key={index} data-furniture={face.kind} points={points(face.points)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
              ))}
            </g>
          );
        }
        const seat = seated.find((s) => s.id === object.id);
        if (seat === undefined) return null;
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
          <a
            key={seat.id}
            href={`/records/${seat.id}`}
            aria-label={name}
            data-far-seat={seat.id}
            style={onSeatClick === undefined ? undefined : { cursor: 'pointer' }}
            onClick={
              onSeatClick === undefined
                ? undefined
                : (event) => {
                    event.preventDefault();
                    onSeatClick(seat.id);
                  }
            }
          >
            {faces}
          </a>
        ) : (
          <g key={seat.id}>{faces}</g>
        );
      })}
      {/*
        §11.28's click target: the OCCUPIED RUN, drawn as its own layer over
        the sorted drawing. It cannot wrap the records — they paint
        interleaved with the furniture by the separating-plane sort (§11.23),
        so grouping them would break that order — so the run is a transparent
        hull over the seats of one shelf, carrying the hover and the count.
      */}
      {onSeatClick === undefined
        ? null
        : runsOf(seated).map((run) => {
            const xs = run.seats.flatMap((s) => [...topFace(s), ...frontFace(s), ...rightFace(s)]);
            const maxX = Math.max(...xs.map(([x]) => x));
            const minY = Math.min(...xs.map(([, y]) => y));
            const maxY = Math.max(...xs.map(([, y]) => y));
            return (
              <g
                key={`run-${run.row}`}
                data-run={run.row}
                data-run-count={run.seats.length}
                onClick={() => onSeatClick(run.seats[0].id)}
              >
                {run.seats.map((s) => (
                  <g key={s.id}>
                    <polygon points={points(topFace(s))} fill="transparent" stroke="none" />
                    <polygon points={points(rightFace(s))} fill="transparent" stroke="none" />
                    <polygon points={points(frontFace(s))} fill="transparent" stroke="none" />
                  </g>
                ))}
                {/* The count beside the run, in §11.27's 11px mono. Not a caption: what is there, not what to do. */}
                <text
                  data-run-label=""
                  x={maxX + 14}
                  y={(minY + maxY) / 2}
                  fontSize="11"
                  fontFamily="var(--font-geist-mono), monospace"
                  fill={INK}
                  dominantBaseline="middle"
                >
                  {run.seats.length} RECORDS →
                </text>
                <title>{`${run.seats.length} records`}</title>
              </g>
            );
          })}
    </svg>
  );
}

/** The occupied runs — one per shelf that holds records (§11.28). */
function runsOf(seated: readonly PlacedSeat[]): Array<{ row: number; seats: PlacedSeat[] }> {
  const byZ = new Map<number, PlacedSeat[]>();
  for (const seat of seated) {
    const row = byZ.get(seat.z);
    if (row === undefined) byZ.set(seat.z, [seat]);
    else row.push(seat);
  }
  return [...byZ.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, seats], index) => ({ row: index, seats }));
}
