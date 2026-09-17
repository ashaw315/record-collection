import {
  COS30,
  frontFace,
  labelTransform,
  layoutRow,
  paintOrder,
  rowPlanes,
  type PlacedSeat,
  type Point,
} from './geometry';
import { PER_SHELF, points } from './WallOverview';
import type { WallSeat } from './shelf-runs';
import { pullPose, returnPose } from './pull-curve';
import { pullFill, returnFill } from './pull-colour';
import { slideY } from './pull-geometry';
import { wallViewBox } from './wall-frame';
import { recordLadder } from '@/lib/colour/record-ladder';
import { MICRO_PX } from '../type-scale';

/**
 * The wall at 1:1 — faces plus labels (The Wall 5b §4, D2; 8a §11).
 *
 * **Same geometry as the overview, by import.** `geometry.ts` exists so this
 * component inherits the overview's decisions rather than re-making them: one
 * projection, rows on the axis, planes per run, painter's order across the
 * whole wall. What this adds is what §5 removes below 1:1 — the labels — and
 * the pull.
 *
 * **Labels at `micro` / cos 30° — 9px read through the shear**, Geist Mono
 * 500, on the front face's own plane (D2's matrix, entered at the face's
 * bottom-left) from an 8px baseline inset. Truncated at the 37-character
 * budget. The size is derived from the scale's `micro` by name (§11).
 *
 * **At rest the wall is line, ink and paper (§11): no derived colour anywhere
 * in the drawing.** Pulled, a record slides forward along the depth axis (D2)
 * and its colour arrives across the slide (§11.2).
 */

/** The one ink, for outline and label alike. */
const INK = '#161412';
const RULE = 'oklch(0.44 0.008 70)';
const LABEL_FONT_PX = Number((MICRO_PX / COS30).toFixed(2));
const BASELINE_INSET = 8;

/**
 * Where a record is on its way out or back.
 *
 * `progress` is 0 → 1 in the gesture's own direction, so `back` at 0 is the
 * fully pulled record and at 1 the seated one. The component draws the pose;
 * driving `progress` against the clock is `WallLive`'s job.
 */
export type PullState = {
  id: string;
  direction: 'out' | 'back';
  progress: number;
};

export function WallLabelled({
  seats,
  pull = null,
  onSeatClick,
  onPulledClick,
}: {
  seats: readonly WallSeat[];
  pull?: PullState | null;
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
}) {
  const pulledId = pull?.id ?? null;
  const pose =
    pull === null
      ? null
      : pull.direction === 'out'
        ? pullPose(pull.progress, 1, 1)
        : returnPose(pull.progress, 1, 1);

  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const planes: (readonly Point[])[] = [];
  const placed: PlacedSeat[] = [];
  for (let index = 0, row = 0; index < seats.length; index += PER_SHELF, row += 1) {
    const shelf = seats.slice(index, index + PER_SHELF);
    /* The plane spans the pulled SEAT (5b §2); the record itself is placed where the slide has it. */
    const rowSeats = layoutRow(shelf, row, pulledId);
    planes.push(...rowPlanes(shelf, rowSeats, pulledId));
    placed.push(
      ...rowSeats.map((seat) =>
        seat.id === pulledId && pose !== null ? { ...seat, y: slideY(pose) } : seat,
      ),
    );
  }

  return (
    <svg
      data-wall="labelled"
      viewBox={wallViewBox(planes, placed.map(frontFace))}
      style={{ background: 'oklch(0.925 0.004 80)', width: '100%', height: 'auto' }}
    >
      {planes.map((plane, index) => (
        <polygon key={`plane-${index}`} data-plane="" points={points(plane)} fill="none" stroke={RULE} strokeWidth="1" />
      ))}
      {paintOrder(placed).map((seat) => {
        const record = byId.get(seat.id);
        if (record === undefined) return null;
        const face = frontFace(seat);

        if (seat.id === pulledId && pull !== null) {
          /*
            **The same object, moved** (D2): the pulled record is the seated
            one at a different y, and its fill reads the ONE eased value the
            slide reads — colour arrives across the gesture, not at either end
            (§11.2). The cover moves onto the right face with 5b's faces.
          */
          const ladder = recordLadder(record.spineColour);
          const fill =
            pull.direction === 'out'
              ? pullFill(pull.progress, ladder)
              : returnFill(pull.progress, ladder);
          return (
            <polygon
              key={seat.id}
              data-pulled={seat.id}
              points={points(face)}
              fill={fill}
              stroke={INK}
              strokeWidth="1"
              pointerEvents="all"
              style={{ cursor: onPulledClick === undefined ? undefined : 'pointer' }}
              onClick={onPulledClick}
            />
          );
        }

        return (
          <g key={seat.id} data-seat={seat.id}>
            <polygon
              data-spine=""
              points={points(face)}
              fill="none"
              stroke={INK}
              strokeWidth="1"
              /* An unfilled polygon is hit only on its stroke; the whole face takes the pointer. */
              pointerEvents="all"
              style={{ cursor: onSeatClick === undefined ? undefined : 'pointer' }}
              onClick={onSeatClick === undefined ? undefined : () => onSeatClick(seat.id)}
            />
            {/*
              On the face's plane: local x runs up the spine from the bottom
              inset, the baseline sits across the thickness at its centre plus
              half a cap height.
            */}
            <text
              data-label=""
              transform={labelTransform(seat)}
              x={BASELINE_INSET}
              y={(seat.width / 2 + LABEL_FONT_PX * 0.35).toFixed(1)}
              fontFamily="Geist Mono, monospace"
              fontSize={LABEL_FONT_PX}
              fontWeight="500"
              fill={INK}
              xmlSpace="preserve"
            >
              {record.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
