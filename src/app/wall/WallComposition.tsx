import { WallLive } from "./WallLive";
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
 * **The ground is the drawn paper, `oklch(0.925 0.004 80)`.** The faces are
 * paper in three steps and the top step has to sit above the ground; on the
 * app's lighter `--background` there is no room for it. That is the
 * drawing-versus-build paper divergence NOTES records, made visible here
 * against the app's chrome rather than resolved.
 */
export const DRAWN_PAPER = "oklch(0.925 0.004 80)";

export function WallComposition({
  seats,
  summaries = {},
  countLine = null,
  rail = null,
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  /** The filter-aware line under the count — "34 of 312 records" — when a filter is on. */
  countLine?: string | null;
  /** §11.13's rail, in a 148px column left of the facts; the page supplies it, the probes do not. */
  rail?: React.ReactNode;
}) {
  return (
    <section
      data-composition=""
      data-testid="wall"
      className={rail === null ? undefined : "grid grid-cols-[148px_1fr]"}
      /* §11.13: the wall starts directly under the app nav and takes the full height. */
      style={{
        background: DRAWN_PAPER,
        minHeight: "calc(100vh - var(--app-nav-height, 0px))",
      }}
    >
      {rail !== null && (
        /*
          §11.24: below the fork the far view is bounded by width, not height,
          so §11.13's argument for the column does not hold and the band is
          correct there — one row of search, the three views and Add record;
          the filter lines and the rule withdrawn. Add record is a row item
          (§11.26): the wrap was a column's width rule arriving in a layout
          with horizontal room and no vertical room, so the search yields
          instead. The number is the fork's own (view-fork.ts), so the band
          and the far view cannot disagree — and the same query gates the
          unmeasured first paint, which renders both views (WallStage), so a
          phone never paints the near view first.
        */
        <style data-narrow-shelf="">{`@media (max-width: ${nearViewMinWidth() - 1}px) {
  [data-composition] { grid-template-columns: 1fr; }
  [data-testid="wall-rail"] { flex-direction: row; align-items: flex-end; flex-wrap: nowrap; gap: 18px; width: auto !important; padding: 12px 20px 16px !important; }
  [data-testid="wall-rail"] form { margin-bottom: 0; flex: 1 1 0; min-width: 0; }
  [data-testid="wall-rail"] ul { flex-direction: row; flex: none; }
  [data-testid="wall-rail"] a { margin-top: 0; white-space: nowrap; }
  [data-rail-filter] { display: none; }
  [data-rail-rule] { display: none; }
  [data-region="near"] { display: none; }
}
@media (min-width: ${nearViewMinWidth()}px) {
  [data-region="far"] { display: none; }
}`}</style>
      )}
      {rail}
      <WallLive seats={seats} summaries={summaries} countLine={countLine} />
    </section>
  );
}
