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
import { pickInk } from './spine-ink';

/**
 * The wall at 1:1 — polygons plus labels (The Wall 5b §1, §4).
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
 * Truncated at the 37-character budget. Ink picked per fill from 5b's four
 * candidates, re-run on today's fills rather than copied from the drawing's.
 *
 * **Fills are the stored value**, as the wall has always taken them. The record
 * screen draws the same record at the ladder's clamped base; the two disagree
 * today and D3 decides which moves. Measured in `wall-clamp.test.ts`.
 */

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
                const ink = seat.spineColour === null ? '#161412' : pickInk(seat.spineColour).ink;

                return (
                  <g key={seat.id} data-seat={seat.id}>
                    <polygon
                      data-spine=""
                      points={points(spinePolygon(x, originY, width))}
                      /* One unfilled where no cover exists (5b §1): an honest
                         absence, never a default colour. */
                      fill={seat.spineColour ?? 'none'}
                      stroke="#161412"
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
                      fill={ink}
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
