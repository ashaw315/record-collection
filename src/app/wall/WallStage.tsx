import { WallLabelled, type PullState } from './WallLabelled';
import { RecordPanel } from './RecordPanel';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { PERCEIVED_END } from './pull-colour';
import { hasAdjacentSeat, type Direction } from './adjacent-seat';
import { ARROW_LANE, LANDING_PAD, landedBox, projectedBox, type View } from './landing';
import { LABEL, LABEL_INK } from '../records/[id]/grid-type';
import { DRAWN_PAPER } from './WallComposition';

/**
 * The stage: two columns — facts left, drawing right (8a §11.9).
 *
 * The facts column carries COLLECTION and the count at its head (the
 * collection's identity, not the record's — the wall is still behind the
 * pulled record) and, below them, **the panel's region: fixed, empty at
 * rest, filled when a record is pulled.** Every earlier placement answered
 * where the object is now and needed a new rule each time; a destination
 * does not move. The record lands in the drawing's region as the largest
 * square it holds, unsheared (landing.ts), and the arrows go with it.
 */
export function WallStage({
  seats,
  summaries,
  pull = null,
  pulls,
  side,
  width,
  viewport,
  view = null,
  countLine = null,
  regionRef,
  labels = true,
  onSeatClick,
  onPulledClick,
  onTurnOver,
  onPutBack,
  onNavigate,
}: {
  seats: readonly WallSeat[];
  summaries: Record<string, RecordSummary>;
  pull?: PullState | null;
  /** The arrows' slide: two records moving at once. The panel follows the ARRIVING one. */
  pulls?: readonly PullState[];
  side: 'front' | 'back';
  /** The drawing region's width in px — the pan extent's floor. */
  width: number;
  /** The viewport's width in px. Kept for the deferred narrow-viewport ruling; nothing forks on it. */
  viewport: number;
  /** The visible drawing region in the svg's px, frozen when the pull began: where the record lands. */
  view?: View | null;
  /** The filter-aware line under the count — "34 of 312 records" — when a filter is on. */
  countLine?: string | null;
  /** The drawing region, for whoever measures it. */
  regionRef?: React.Ref<HTMLDivElement>;
  labels?: boolean;
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
  onTurnOver?: () => void;
  onPutBack?: () => void;
  onNavigate?: (direction: Direction) => void;
}) {
  void viewport;
  const moving: readonly PullState[] = pulls ?? (pull === null ? [] : [pull]);
  /* The panel follows the record coming OUT, once 97% of its travel is behind the eye. */
  const arriving = moving.find((state) => state.direction === 'out');
  const arrived = arriving !== undefined && arriving.progress >= PERCEIVED_END;
  const summary = arrived ? summaries[arriving.id] : undefined;
  const order = seats.map((seat) => seat.id);

  /*
    §11.9: the panel's region is FIXED in the facts column below the count,
    empty at rest, filled when a record is pulled. A destination does not
    move — so no scrim, no lightness step, no overlap rule, no fork at 820.
  */
  const panel =
    arrived && summary !== undefined ? (
      <div data-testid="record-chrome">
        <RecordPanel
          summary={summary}
          alwaysExpanded
          onTurnOver={onTurnOver ?? (() => undefined)}
          onPutBack={onPutBack ?? (() => undefined)}
        />
      </div>
    ) : null;

  /*
    The arrows go with the record (§11.9): beside the landed box, in the
    drawing's region, present only where there is somewhere to go.
  */
  let arrows = null;
  if (arrived && arriving !== undefined) {
    const region: View = view ?? { x: 0, y: 0, width, height: width };
    const bounds = projectedBox(landedBox(arriving.id, region));
    const top = (bounds.minY + bounds.maxY) / 2 - 22 + LANDING_PAD;
    const arrow = (direction: Direction, left: number) =>
      hasAdjacentSeat(order, arriving.id, direction) ? (
        <button
          type="button"
          data-testid={direction === 'next' ? 'nav-next' : 'nav-previous'}
          aria-label={direction === 'next' ? 'Next record' : 'Previous record'}
          onClick={() => onNavigate?.(direction)}
          className="absolute flex h-11 w-11 items-center justify-center border text-prose"
          style={{ left: `${left}px`, top: `${top}px`, borderColor: 'oklch(0.19 0.008 60)', background: DRAWN_PAPER }}
        >
          {direction === 'next' ? '→' : '←'}
        </button>
      ) : null;
    arrows = (
      <>
        {arrow('previous', bounds.minX - ARROW_LANE)}
        {arrow('next', bounds.maxX + ARROW_LANE - 44)}
      </>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0">
      <div data-region="facts" className="flex flex-col p-[34px]">
        <div data-region="count">
          <div className={LABEL}>COLLECTION</div>
          <div data-testid="wall-count" className="text-display leading-[0.86] font-extrabold" style={{ marginTop: 6 }}>
            {seats.length}
          </div>
          {countLine === null ? null : (
            <p className="mt-[10px] text-meta" style={{ color: LABEL_INK }}>
              {countLine}
            </p>
          )}
        </div>
        <div data-testid="panel-region" className="mt-[34px]">{panel}</div>
      </div>
      {/*
        D1: 1:1 and pans — the region scrolls the drawing rather than scaling it,
        in BOTH axes: it is the viewport's height, not its content's. Left to
        grow with the svg, and the svg's floor taken from it, the two grew each
        other by the padding on every resize tick until the region was 6000px
        tall and the record landed in the middle of that.
      */}
      <div
        ref={regionRef}
        data-region="wall"
        className="col-span-2 h-[calc(100vh-var(--header-height,0px))] overflow-auto p-[34px] pl-0"
      >
        <div className="relative">
          <WallLabelled
            seats={seats}
            pulls={moving}
            labels={labels}
            minWidth={width}
            minHeight={view?.height ?? 0}
            side={side}
            view={view}
            onSeatClick={onSeatClick}
            onPulledClick={onPulledClick}
          />
          {arrows}
        </div>
      </div>
    </div>
  );
}
