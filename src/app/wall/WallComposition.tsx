import { WallLive } from "./WallLive";
import { PAPER_CSS } from '@/lib/colour/paper';
import type { WallSeat } from "./shelf-runs";
import type { RecordSummary } from "./summary";
import { nearViewMinWidth } from "./view-fork";

/**
 * The wall as a screen (D2, from the reference): the collection on shelves
 * in the right two-thirds, `COLLECTION` and the count at 72 on the left
 * third, in the record screen's vocabulary — the page around the wall takes
 * the record screen's system; the wall keeps its own geometry.
 *
 * **At 1:1, panning (D1).** A sub-1:1 wall is a shelf of anonymous outlines
 * once the label is the only identifying channel; the region scrolls the
 * drawing. The 200-record overview is a different view with a different job.
 *
 * **No carcass.** The reference draws a case around the whole thing — top,
 * sides and bottom — and it reads as furniture in a room rather than as a
 * wall. Shelves, records, and paper.
 *
 * **The ground is the drawn paper — `PAPER`, the one token (§W.5).** The faces
 * are paper in three steps and the top step has to sit above the ground,
 * which is why the app's `--background` is this same value now: while it was
 * lighter there was no room for the step, and every ratio in the system was
 * being measured on a ground the page did not paint.
 */
export const DRAWN_PAPER = PAPER_CSS;

export function WallComposition({
  seats,
  summaries = {},
  countLine = null,
  rail = null,
  opens,
  opensShelf,
  onView,
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  /** §W.12: which view the route opens in. The collection page opens far; probes about the near view ask for it. */
  opens?: 'far' | 'near';
  /** §W.29: the run the near view opens on, from the URL. */
  opensShelf?: number;
  /** §W.29: told when the reader zooms, so the page can put it in the URL. */
  onView?: (wall: 'near' | 'far', shelf?: number) => void;
  /** The filter-aware line under the count — "34 of 312 records" — when a filter is on. */
  countLine?: string | null;
  /** §W.13's rail, in a 148px column left of the facts; the page supplies it, the probes do not. */
  rail?: React.ReactNode;
}) {
  return (
    <section
      data-composition=""
      data-testid="wall"
      className={rail === null ? undefined : "grid grid-cols-[148px_1fr]"}
      /* §W.13: the wall starts directly under the app nav and takes the full height. */
      style={{
        background: DRAWN_PAPER,
        minHeight: "calc(100vh - var(--app-nav-height, 0px))",
      }}
    >
      {rail !== null && (
        /*
          §W.24: below the fork the far view is bounded by width, not height,
          so §W.13's argument for the column does not hold and the band is
          correct there; the filter lines and the rule withdrawn.

          **Two rows, by Adam's ruling, superseding §W.24's one**: "search
          and the rest of the record page items should be on separate lines,
          it reads awkward." Search has the band's width; the three views and
          Add record are the row beneath, the views from the left inset and
          Add record to the right one, still a row item beside them (§W.26).

          Two things the one row did, measured before it went. The rule
          between the form and the views stayed a flex item with no width
          and its column's negative side margins, which drew the views 4px
          over the search field: it is not drawn here at all now. And the
          row could not fit a 320 window: its fixed items need 274.8 and the
          SEARCH label will not go under 46.2, which is 321, so the band and
          the page were one pixel wider than the window. Nothing here clamps
          a width; on two rows nothing needs more than the window has.

          **Step 96: each link is tappable over 44**, by the overlay the
          header's links use (§G.3): an empty box centred on the link, 44
          tall, reaching 9 either side, which is halfway across the 18
          between view names, so neighbours' areas meet and none takes
          another's. Measured first, as the step requires: the overlay
          starts 10 below the search field's foot and ends inside the
          band, so nothing grew. And the row is aligned on its baseline:
          Add record is a block and the view names are inline in their
          list items, and aligned by their feet their texts stood apart.
          The bar that marks the current view lies inside its link's
          overlay and is not part of the link, so it took the taps on the
          lower 7 of SHELF's 44; it is a mark, and taps pass through it. The number is the fork's own (view-fork.ts), so the band
          and the far view cannot disagree. The same query decides the
          unmeasured first paint, so the server's paint, the client's first
          paint and the settled view are all the same view.
        */
        <style data-narrow-shelf="">{`@media (max-width: ${nearViewMinWidth() - 1}px) {
  [data-composition] { grid-template-columns: 1fr; }
  [data-testid="wall-rail"] { flex-direction: row; align-items: flex-end; flex-wrap: wrap; gap: 18px; width: auto !important; padding: 12px 20px 16px !important; }
  [data-testid="wall-rail"] form { margin-bottom: 0; flex: 1 1 100%; min-width: 0; }
  [data-testid="wall-rail"] ul { flex-direction: row; flex: none; }
  [data-testid="wall-rail"] a { margin-top: 0; white-space: nowrap; }
  [data-testid="wall-rail"] > a { margin-left: auto; }
  [data-testid="wall-rail"] > hr { display: none; }
  [data-testid="wall-rail"] { align-items: baseline; }
  [data-testid="wall-rail"] a { position: relative; }
  [data-testid="wall-rail"] a::before { content: ''; position: absolute; left: -9px; right: -9px; top: 50%; height: 44px; transform: translateY(-50%); }
  [data-testid="wall-rail"] li > span { pointer-events: none; }
  [data-rail-filter] { display: none; }
  [data-rail-rule] { display: none; }
}
/*
  **The fork is decided in CSS, so the first paint is already correct**
  (§W.26, §W.29). The server cannot measure a viewport; a media query can
  answer the same question with no measurement at all, so both regions are
  rendered and the stylesheet shows one. Nothing swaps after hydration, and
  the JS measurement is left to drive only the route's own state — which is
  also what keeps it out of the circular dependency it fell into once, where
  the measurement lived inside the view it was selecting.

  Above the fork the route's default is the near view (§W.29); below it the
  shelf IS the far view (§W.24). Once the client has measured, one region
  renders and these rules have nothing to hide.
*/
@media (max-width: ${nearViewMinWidth() - 1}px) {
  [data-unmeasured] [data-region="near"] { display: none; }
}
@media (min-width: ${nearViewMinWidth()}px) {
  [data-unmeasured] [data-region="far"] { display: none; }
}`}</style>
      )}
      {/*
        §W.31: the vertical between the rail and the facts column, full-bleed
        from the nav to the page foot. A rule that stops short of the foot
        draws a box, and §W.13's argument is that a column is a region.
      */}
      {rail === null ? null : (
        <div className="relative">
          {rail}
          <div
            data-line="rail-facts"
            aria-hidden="true"
            className="absolute inset-y-0 right-0 h-full w-px"
            style={{ background: "oklch(0.72 0.004 80)" }}
          />
        </div>
      )}
      <WallLive seats={seats} summaries={summaries} countLine={countLine} opens={opens} opensShelf={opensShelf} onView={onView} />
    </section>
  );
}
