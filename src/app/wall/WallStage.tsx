import { WallLabelled, type PullState } from './WallLabelled';
import { RecordPanel } from './RecordPanel';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { hasAdjacentSeat, type Direction } from './adjacent-seat';
import { ARROW_LANE, LANDING_PAD } from './landing';
import type { View } from './view';
import { OUT_MS, ROTATION_START, SWING_MS, gestureFaces, outTime, poseAt, settled } from './gesture';
import { wallLayout } from './wall-layout';
import { clearanceShift } from './pan';
import { LABEL, LABEL_INK } from '../records/[id]/grid-type';
import { DRAWN_PAPER } from './WallComposition';
import { WallOverview } from './WallOverview';

/**
 * The stage: two columns — facts left at 420px, drawing right with the rest
 * (8a §11.9, §11.13's figures in page pixels).
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
  far = false,
  onZoomIn,
  onZoomOut,
  framed,
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
  /** The viewport's width in px. The fork on it is `far`, decided by whoever measures (view-fork.ts). */
  viewport: number;
  /** The visible drawing region in the svg's px, frozen when the pull began: where the record lands. */
  view?: View | null;
  /** The filter-aware line under the count — "34 of 312 records" — when a filter is on. */
  countLine?: string | null;
  /** The drawing region, for whoever measures it. */
  regionRef?: React.Ref<HTMLDivElement>;
  labels?: boolean;
  /**
   * §11.24: the narrow shelf is the far view — the count, then the collection
   * as an object, each record a link to its screen. `null` is unmeasured:
   * the server has no width, so both views render and the composition's
   * media query shows the right one on the first paint (§11.26 records the
   * flash of the near view as a build concern; this is its handling).
   */
  far?: boolean | null;
  /**
   * §11.12: the way in and the way out — a click on a far seat zooms to the
   * near view on that seat, and a click on the COUNT zooms back out. The same
   * input in both directions, never a continuous one: a wheel or a pinch
   * snapping to a target is an intermediate the reader can see. Absent below
   * §11.24's fork, where the far view is the only view and a tap opens the
   * record screen.
   */
  onZoomIn?: (id: string) => void;
  onZoomOut?: () => void;
  /** §11.22: the records whose landings the frame holds, until the wall is at rest. */
  framed?: readonly string[];
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
  onTurnOver?: () => void;
  onPutBack?: () => void;
  onNavigate?: (direction: Direction) => void;
}) {
  void viewport;
  const moving: readonly PullState[] = pulls ?? (pull === null ? [] : [pull]);
  /*
    The panel arrives with the rotation (§11.14, §11.19): the record becomes
    a subject when it turns to face the reader, which is 42% into the swing
    — and leaves with it on the return, the whole gesture reversed.
  */
  const arriving = moving.find((state) => state.direction === 'out');
  const arrived = arriving !== undefined && outTime(arriving) >= ROTATION_START * SWING_MS;
  const summary = arrived ? summaries[arriving.id] : undefined;
  /* §11.12: the arrows walk the seated records; an empty seat is not somewhere to go. */
  const seated = seats.filter((seat) => !seat.empty);
  const order = seated.map((seat) => seat.id);

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
  if (arriving !== undefined && settled(arriving)) {
    /* Beside the landed cover's own extent (§11.9 with §11.21's landing), in the region's px: the svg's frame origin taken out. */
    const { placed, frame } = wallLayout(seats, (framed ?? moving.map((m) => m.id)).map((id) => ({ id })), width, view?.height ?? 0);
    const seat = placed.find((p) => p.id === arriving.id);
    const [frameX, frameY] = frame.viewBox.split(' ').map(Number);
    const cover = seat === undefined ? [] : gestureFaces(seat, poseAt(OUT_MS)).cover;
    /* Where the cover LANDS: the gesture's position plus the pan's clearance (§11.26). */
    const shift = seat === undefined ? 0 : clearanceShift(seat);
    const xs = cover.map(([x]) => x + shift - frameX);
    const ys = cover.map(([, y]) => y - frameY);
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
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

  /*
    Both views carry the count, and while unmeasured both are in the document
    (§11.26): the far view's markers are its own so nothing resolves to both.
  */
  const count = (far: boolean) => (
    <div data-region={far ? 'count-far' : 'count'}>
      <div className={LABEL}>COLLECTION</div>
      {far && onZoomOut !== undefined ? (
        /* §11.12: the way out is the collection's identity, which is what the zoom-out arrives at. */
        <button
          type="button"
          data-testid="wall-zoom-out"
          onClick={onZoomOut}
          aria-label="Show the whole collection"
          className="block cursor-pointer border-0 bg-transparent p-0 text-left text-display leading-[0.86] font-extrabold"
          style={{ marginTop: 6, color: 'inherit' }}
        >
          <span data-testid="wall-count-far">{seated.length}</span>
        </button>
      ) : (
        <div data-testid={far ? 'wall-count-far' : 'wall-count'} className="text-display leading-[0.86] font-extrabold" style={{ marginTop: 6 }}>
          {seated.length}
        </div>
      )}
      {countLine === null ? null : (
        <p className="mt-[10px] text-meta" style={{ color: LABEL_INK }}>
          {countLine}
        </p>
      )}
    </div>
  );

  /*
    §11.24: below the fork the near view holds about two seats, which is not a
    fixture; the far view has no width floor. One column — the count, then the
    collection as an object — and no panel region, because the pulled state
    does not exist at this width: a tap goes to the record screen.
  */
  /*
    §11.10: the far view is the collection AS AN OBJECT, so it fits the
    region — labels are absent rather than shrunk, which is what lets it
    scale at all (§11.24). The near view is the one that renders at 1:1 and
    pans; a far view that scrolled would be the near view's job done badly.
  */
  const farView = (
    <div data-region="far" className="flex h-[calc(100vh-var(--app-nav-height,0px))] flex-col overflow-hidden p-[34px]">
      {count(true)}
      <div className="mt-[34px] min-h-0 flex-1">
        <WallOverview seats={seats} pulledId={null} linked onSeatClick={onZoomIn} />
      </div>
    </div>
  );
  if (far === true) return farView;

  const nearView = (
    <div data-region="near" className="grid grid-cols-[420px_1fr] gap-0">
      <div data-region="facts" className="flex flex-col p-[34px]">
        {count(false)}
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
        className="h-[calc(100vh-var(--app-nav-height,0px))] overflow-auto p-[34px] pl-0"
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
            framed={framed}
            onSeatClick={onSeatClick}
            onPulledClick={onPulledClick}
          />
          {arrows}
        </div>
      </div>
    </div>
  );
  if (far === false) return nearView;
  return (
    <>
      {nearView}
      {farView}
    </>
  );
}
