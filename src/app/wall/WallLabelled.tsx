import { shelfRuns, type WallSeat } from './shelf-runs';
import {
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
 * **Labels at 10.39px reading 9px through the shear**, Geist Mono 500, rotated
 * to run up the spine from an 8px baseline inset — the drawing's own transform.
 * Truncated at the 37-character budget.
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

const PER_SHELF = 40;
const LABEL_FONT_PX = 10.39;
const BASELINE_INSET = 8;

const points = (polygon: readonly Point[]) => polygon.map(([x, y]) => `${x},${y}`).join(' ');

export function WallLabelled({
  seats,
  pulledId,
}: {
  seats: readonly WallSeat[];
  pulledId: string | null;
}) {
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
              return shelf.map((seat) => {
                const x = seatX;
                seatX += SPINE_WIDTH_MAX;
                if (seat.id === pulledId) return null;

                const width = spineWidth(seat.id);

                return (
                  <g key={seat.id} data-seat={seat.id}>
                    <polygon
                      data-spine=""
                      points={points(spinePolygon(x, originY, width))}
                      fill="none"
                      stroke={INK}
                      strokeWidth="1"
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
            })()}
          </g>
        );
      })}
    </svg>
  );
}
