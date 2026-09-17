import { WallLabelled, type PullState } from './WallLabelled';
import { RecordPanel } from './RecordPanel';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { PERCEIVED_END } from './pull-colour';
import { pullPose, returnPose } from './pull-curve';
import { wallLayout } from './wall-layout';
import { FORK_PX, panelAnchor } from './panel-anchor';
import { hasAdjacentSeat, type Direction } from './adjacent-seat';

/**
 * The stage: the drawing, and what the gesture arrives at.
 *
 * **§11.7's panel sits in the plane of the page, not the projection** —
 * flat, on paper, at the record screen's type, right of the pulled record,
 * top-aligned to the cover's far-top corner and as wide as the cover's
 * projected width, so the composition reads as two columns rather than an
 * object with a caption. It APPEARS at the slide's perceived end
 * (`PERCEIVED_END`, where 97% of travel is behind the eye) rather than
 * tracking the face: something in the page's plane moving with something in
 * the projection is the two planes collapsing into one.
 *
 * **§11.8's fork at 820 is an overlay, not a narrower panel.** The wall does
 * not reflow — a narrow viewport shows fewer records, not smaller ones — and
 * the overlay is the panel arriving over a wall that has not changed.
 */
export function WallStage({
  seats,
  summaries,
  pull = null,
  pulls,
  side,
  width,
  viewport,
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
  /** The container's width in px — the pan extent's floor. */
  width: number;
  /** The VIEWPORT's width in px — A32's fork is a measure of the page, not of the wall's column. */
  viewport: number;
  labels?: boolean;
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
  onTurnOver?: () => void;
  onPutBack?: () => void;
  onNavigate?: (direction: Direction) => void;
}) {
  const moving: readonly PullState[] = pulls ?? (pull === null ? [] : [pull]);
  /* The panel follows the record coming OUT, once 97% of its travel is behind the eye. */
  const arriving = moving.find((state) => state.direction === 'out');
  const arrived = arriving !== undefined && arriving.progress >= PERCEIVED_END;
  const summary = arrived ? summaries[arriving.id] : undefined;
  const order = seats.map((seat) => seat.id);

  let chrome = null;
  if (arrived && summary !== undefined) {
    const layout = wallLayout(
      seats,
      moving.map((state) => ({
        id: state.id,
        pose: state.direction === 'out' ? pullPose(state.progress, 1, 1) : returnPose(state.progress, 1, 1),
      })),
      width,
    );
    const seat = layout.placed.find((placed) => placed.id === arriving.id);
    const wide = viewport >= FORK_PX;
    const arrow = (direction: Direction) =>
      hasAdjacentSeat(order, arriving.id, direction) ? (
        <button
          type="button"
          data-testid={direction === 'next' ? 'nav-next' : 'nav-previous'}
          aria-label={direction === 'next' ? 'Next record' : 'Previous record'}
          onClick={() => onNavigate?.(direction)}
          className="min-h-11 min-w-11 border text-prose"
          style={{ borderColor: 'oklch(0.19 0.008 60)' }}
        >
          {direction === 'next' ? '→' : '←'}
        </button>
      ) : null;
    const panel = (
      <>
        {/* §11.8: along the collection — present only where there is somewhere to go. */}
        <div className="mb-[10px] flex justify-between">
          {arrow('previous') ?? <span />}
          {arrow('next') ?? <span />}
        </div>
        <RecordPanel
          summary={summary}
          alwaysExpanded={wide}
          onTurnOver={onTurnOver ?? (() => undefined)}
          onPutBack={onPutBack ?? (() => undefined)}
        />
      </>
    );
    if (wide && seat !== undefined) {
      const anchor = panelAnchor(seat, layout.frame);
      chrome = (
        <div
          data-testid="record-chrome"
          className="absolute"
          style={{ left: `${anchor.left}px`, top: `${anchor.top}px`, width: `${anchor.width}px` }}
        >
          <div data-testid="record-chrome-facts">{panel}</div>
        </div>
      );
    } else {
      chrome = (
        <div data-testid="record-chrome" className="fixed inset-x-0 bottom-0 z-10" style={{ background: 'oklch(0.925 0.004 80)' }}>
          <div data-testid="record-chrome-stacked">{panel}</div>
        </div>
      );
    }
  }
  return (
    <div className="relative">
      <WallLabelled
        seats={seats}
        pulls={moving}
        labels={labels}
        minWidth={width}
        side={side}
        onSeatClick={onSeatClick}
        onPulledClick={onPulledClick}
      />
      {chrome}
    </div>
  );
}
