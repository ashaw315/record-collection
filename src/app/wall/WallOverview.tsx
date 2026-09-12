import {
  SHELF_GAP,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  shelfPolygon,
  spinePolygon,
  spineWidth,
  type Point,
} from './geometry';
import { shelfRuns, type ShelfSeat } from './shelf-runs';

/**
 * The wall, zoomed out (The Wall 5b §5).
 *
 * **Polygons only — no text, no interaction.** §5: labels render at 1:1 and are
 * REMOVED below it, never shrunk. A 9px label is an absolute floor rather than
 * a proportion, so a wall scaled to about 0.41 to fit a 1440px viewport would
 * render it at 3.7px and violate the floor silently. Which gives the wall two
 * states rather than one degrading one — this is the unlabelled state.
 *
 * Zoomed out the wall is colour, thickness, section gaps and the shape of the
 * collection: **encounter rather than retrieval**, which is what NOTES records
 * the wall is for.
 *
 * **The threshold between this component and the labelled one is not here.**
 * The rule is settled; how the switch is expressed is its own decision.
 */

/** How many records sit on one shelf before the wall wraps to the next. */
const PER_SHELF = 40;

const points = (polygon: readonly Point[]) =>
  polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

export function WallOverview({
  seats,
  pulledId,
}: {
  seats: readonly ShelfSeat[];
  pulledId: string | null;
}) {
  /* Split into shelves first: a run is a section's stretch WITHIN one shelf. */
  const shelves: ShelfSeat[][] = [];
  for (let index = 0; index < seats.length; index += PER_SHELF) {
    shelves.push(seats.slice(index, index + PER_SHELF));
  }

  const pitch = 400 + SPINE_HEIGHT + SHELF_GAP;

  return (
    <svg
      viewBox={`0 0 ${PER_SHELF * SPINE_WIDTH_MAX + 80} ${Math.max(1, shelves.length) * pitch}`}
      style={{ background: '#f9f7f4', width: '100%', height: 'auto' }}
    >
      {shelves.map((shelf, shelfIndex) => {
        const runs = shelfRuns(shelf, pulledId);
        const originY = shelfIndex * pitch;

        /* Runs lay out left to right, each starting where the last ended. */
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

                /*
                  The pulled record's SEAT is still spanned by its run — that is
                  what keeps the outline whole — but no spine is drawn on it.
                */
                if (seat.id === pulledId) return null;

                return (
                  <polygon
                    key={seat.id}
                    points={points(spinePolygon(x, originY, spineWidth(seat.id)))}
                    fill="#8a8079"
                    stroke="#161412"
                    strokeWidth="1"
                  />
                );
              });
            })()}
          </g>
        );
      })}
    </svg>
  );
}
