import { shelfRuns, type WallSeat } from './shelf-runs';
import { pullPose, returnPose } from './pull-curve';
import { pullFill, returnFill } from './pull-colour';
import { PULLED_SIZE, pullFace } from './pull-geometry';
import { recordLadder } from '@/lib/colour/record-ladder';
import { MICRO_PX } from '../type-scale';
import {
  COS30,
  SIN30,
  SHELF_GAP,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  shelfPolygon,
  spinePolygon,
  spineWidth,
  type Point,
} from './geometry';

/**
 * The wall at 1:1 — polygons plus labels (The Wall 5b §1, §4; 8a §11).
 *
 * **Same geometry as the overview, by import.** `geometry.ts` exists so this
 * component inherits the overview's decisions rather than re-making them: a
 * projection settled inside either renderer is one the other cannot reuse, and
 * two renderers that each decide a spine's width give a record that changes
 * thickness when labels appear. So the polygons here are the overview's
 * polygons, and the only thing this adds is what §5 removes below 1:1.
 *
 * **Labels at `micro` / cos 30° — 9px read through the shear**, Geist Mono
 * 500, rotated to run up the spine from an 8px baseline inset — the drawing's
 * own transform. Truncated at the 37-character budget. The size is derived
 * from the scale's `micro` by name (§11): the wall's sizes are the projection's
 * units, and a floor matched by value is a coincidence waiting for a margin.
 *
 * **At rest the wall is line, ink and paper (§11): no derived colour anywhere
 * in the drawing.** A record on the shelf is one of seventeen outlines;
 * pulled, it becomes itself and takes its own colour. So no spine is filled
 * and every label is set in ink — 5b's four-candidate pick had nothing left
 * to choose against and is withdrawn with the fills. What distinguishes a
 * spine at rest is position, width and the label (§11.1), and the coverless
 * record is no longer distinguishable from the rest — an outline among
 * outlines, which is what §11 makes of every record.
 */

/** The one ink, for outline and label alike. */
const INK = '#161412';

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

const PER_SHELF = 40;
const LABEL_FONT_PX = Number((MICRO_PX / COS30).toFixed(2));
const BASELINE_INSET = 8;

const points = (polygon: readonly Point[]) => polygon.map(([x, y]) => `${x},${y}`).join(' ');

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
  const shelves: WallSeat[][] = [];
  for (let index = 0; index < seats.length; index += PER_SHELF) {
    shelves.push(seats.slice(index, index + PER_SHELF));
  }

  const pitch = 400 + SPINE_HEIGHT + SHELF_GAP;

  return (
    <svg
      data-wall="labelled"
      viewBox={`0 0 ${PER_SHELF * SPINE_WIDTH_MAX + 80} ${Math.max(1, shelves.length) * pitch}`}
      style={{ background: '#f9f7f4', width: '100%', height: 'auto' }}
    >
      {shelves.map((shelf, shelfIndex) => {
        const runs = shelfRuns(shelf, pulledId);
        const originY = shelfIndex * pitch;
        let cursor = 0;
        return (
          <g key={shelfIndex}>
            {runs.map((run) => {
              const runX = cursor;
              cursor += run.seatCount * SPINE_WIDTH_MAX;
              return (
                <polygon
                  key={`${run.section}-${runX}`}
                  points={points(shelfPolygon(run, runX, originY))}
                  fill="none"
                  stroke="#161412"
                  strokeWidth="1.6"
                />
              );
            })}
            {(() => {
              let seatX = 0;
              const seated = shelf.map((seat) => {
                const x = seatX;
                seatX += SPINE_WIDTH_MAX;
                const width = spineWidth(seat.id);

                if (seat.id === pulledId) return null;

                return (
                  <g key={seat.id} data-seat={seat.id}>
                    <polygon
                      data-spine=""
                      points={points(spinePolygon(x, originY, width))}
                      fill="none"
                      stroke={INK}
                      strokeWidth="1"
                      /*
                        An unfilled polygon is hit only on its stroke — the
                        first pull spec timed out clicking the centre of a
                        spine. The whole face takes the pointer.
                      */
                      pointerEvents="all"
                      style={{ cursor: onSeatClick === undefined ? undefined : 'pointer' }}
                      onClick={onSeatClick === undefined ? undefined : () => onSeatClick(seat.id)}
                    />
                    <text
                      data-label=""
                      /*
                        The drawing's transform: baseline right of the spine's
                        centre by half the cap height, 8px up from the bottom,
                        rotated to run up the spine.
                      */
                      transform={`translate(${(x + width / 2 + LABEL_FONT_PX * 0.35).toFixed(1)},${(
                        originY +
                        SPINE_HEIGHT -
                        BASELINE_INSET
                      ).toFixed(1)}) rotate(-90)`}
                      fontFamily="Geist Mono, monospace"
                      fontSize={LABEL_FONT_PX}
                      fontWeight="500"
                      fill={INK}
                      xmlSpace="preserve"
                    >
                      {seat.label}
                    </text>
                  </g>
                );
              });

              /*
                **Drawn last, so it is in front.** A record pulled toward the
                viewer sits over its neighbours — the frames show it — and a
                polygon drawn in seat order sat UNDER the spines to its right,
                which now take the pointer over their whole face: the first
                return click landed on `collection-11` instead.

                **The same polygon, transformed** (5b §3): the seated spine is
                not drawn and this one starts on its exact four points. Fill
                and pose read the ONE eased value — colour arrives across the
                gesture, not at either end (§11.2).
              */
              const pulledIndex = pull === null ? -1 : shelf.findIndex((seat) => seat.id === pull.id);
              const moving = pull !== null && pulledIndex >= 0 ? shelf[pulledIndex] : null;
              let pulled = null;
              if (moving !== null && pull !== null) {
                const width = spineWidth(moving.id);
                const finalScale = PULLED_SIZE / width;
                const pose =
                  pull.direction === 'out'
                    ? pullPose(pull.progress, 1, finalScale)
                    : returnPose(pull.progress, 1, finalScale);
                const ladder = recordLadder(moving.spineColour);
                const fill =
                  pull.direction === 'out'
                    ? pullFill(pull.progress, ladder)
                    : returnFill(pull.progress, ladder);
                const seat = { x: pulledIndex * SPINE_WIDTH_MAX, y: originY, width };

                const face = pullFace(seat, pose);
                const [tl, tr, br] = face;
                /*
                  §11.3: the cover, at its own aspect and uncropped, on the
                  field — never a wash over it. It arrives with the colour, on
                  the same eased value, and rides the face's shear so it stays
                  inside the record while the record is still tilted: the
                  image's box is the face's axis-aligned box, skewed about the
                  top-right corner by the rise that remains.
                */
                const shearDeg = (Math.atan((SIN30 / COS30) * pose.shear) * 180) / Math.PI;
                const cover =
                  moving.coverUrl === null ? null : (
                    <image
                      data-cover={moving.id}
                      href={moving.coverUrl}
                      x={tl[0]}
                      y={tr[1]}
                      width={tr[0] - tl[0]}
                      height={br[1] - tr[1]}
                      preserveAspectRatio="xMidYMid meet"
                      opacity={pose.eased}
                      transform={`translate(${tr[0]} ${tr[1]}) skewY(${-shearDeg}) translate(${-tr[0]} ${-tr[1]})`}
                      pointerEvents="none"
                    />
                  );

                pulled = (
                  <>
                    <polygon
                      data-pulled={moving.id}
                      points={points(face)}
                      fill={fill}
                      stroke={INK}
                      strokeWidth="1"
                      pointerEvents="all"
                      style={{ cursor: onPulledClick === undefined ? undefined : 'pointer' }}
                      onClick={onPulledClick}
                    />
                    {cover}
                  </>
                );
              }

              return (
                <>
                  {seated}
                  {pulled}
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
