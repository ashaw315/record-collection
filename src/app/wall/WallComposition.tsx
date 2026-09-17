import { WallLive } from './WallLive';
import type { WallSeat } from './shelf-runs';
import { LABEL } from '../records/[id]/grid-type';

/**
 * The wall as a screen (D2, from the reference): the collection on shelves
 * in the right two-thirds, `COLLECTION` and the count at 72 on the left
 * third, in the record screen's vocabulary — the page around the wall takes
 * the record screen's system; the wall keeps its own geometry.
 *
 * **No carcass.** The reference draws a case around the whole thing — top,
 * sides and bottom — and it reads as furniture in a room rather than as a
 * wall. Shelves, records, and paper.
 *
 * **The ground is the drawn paper, `oklch(0.925 0.004 80)`.** The faces are
 * paper in three steps and the top step has to sit above the ground; on the
 * app's lighter `--background` there is no room for it. That is the
 * drawing-versus-build paper divergence NOTES records, made visible here
 * against the app's chrome rather than resolved.
 */
export const DRAWN_PAPER = 'oklch(0.925 0.004 80)';

export function WallComposition({ seats }: { seats: readonly WallSeat[] }) {
  return (
    <section
      data-composition=""
      className="grid min-h-[calc(100vh-var(--header-height,0px))] grid-cols-3 gap-0"
      style={{ background: DRAWN_PAPER }}
    >
      <div data-region="count" className="flex flex-col p-[34px]">
        <div className={LABEL}>COLLECTION</div>
        <div className="text-display leading-[0.86] font-extrabold" style={{ marginTop: 6 }}>
          {seats.length}
        </div>
      </div>
      <div data-region="wall" className="col-span-2 p-[34px] pl-0">
        <WallLive seats={seats} />
      </div>
    </section>
  );
}
