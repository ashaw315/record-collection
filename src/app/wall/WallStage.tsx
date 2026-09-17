import { WallLabelled, type PullState } from './WallLabelled';
import { RecordPanel } from './RecordPanel';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { PERCEIVED_END } from './pull-colour';
import { pullPose, returnPose } from './pull-curve';
import { wallLayout } from './wall-layout';
import { FORK_PX, panelAnchor } from './panel-anchor';

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
  pull,
  side,
  width,
  viewport,
  labels = true,
  onSeatClick,
  onPulledClick,
  onTurnOver,
  onPutBack,
}: {
  seats: readonly WallSeat[];
  summaries: Record<string, RecordSummary>;
  pull: PullState | null;
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
}) {
  const arrived = pull !== null && pull.direction === 'out' && pull.progress >= PERCEIVED_END;
  const summary = arrived ? summaries[pull.id] : undefined;

  let chrome = null;
  if (arrived && summary !== undefined) {
    const pose = pullPose(pull.progress, 1, 1);
    const layout = wallLayout(seats, pull.id, pose, width);
    const seat = layout.placed.find((placed) => placed.id === pull.id);
    const wide = viewport >= FORK_PX;
    const panel = (
      <RecordPanel
        summary={summary}
        alwaysExpanded={wide}
        onTurnOver={onTurnOver ?? (() => undefined)}
        onPutBack={onPutBack ?? (() => undefined)}
      />
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
  /* returnPose is the stage's other pose; referenced so the pair stays in one module's view. */
  void returnPose;

  return (
    <div className="relative">
      <WallLabelled
        seats={seats}
        pull={pull}
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
