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
import { arrivalSeat, nearView as arrivalView } from './route-view';
import { nearViewMinWidth } from './view-fork';
import { HAIRLINE, LABEL, LABEL_INK } from '../records/[id]/grid-type';
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
  arrivalScript = true,
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
  /**
   * §11.29: whether to render the parse-time arrival script. True on the
   * server and for the first client render, so hydration matches; false once
   * mounted, since the tag can only do work at parse time and React logs a
   * warning for every later commit that renders it.
   */
  arrivalScript?: boolean;
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
  /*
    Where the near view arrives (§11.29): the occupied shelf, by the same
    `nearView` the client lands with. Only at rest — a pull owns the view
    while it is out (§11.22) — and only in the near view, which is the one
    that scrolls.
  */
  const arrival: [number, number] | null = (() => {
    if (far === true || moving.length > 0) return null;
    const { placed, frame } = wallLayout(seats, [], width, view?.height ?? 0);
    const seat = arrivalSeat(placed);
    if (seat === null) return null;
    const [fx, fy] = frame.viewBox.split(' ').map(Number);
    const [x, y] = arrivalView(seat, { width, height: view?.height ?? 0 }, placed.filter((p) => p.z === seat.z));
    return [Math.round(x - fx), Math.round(y - fy + LANDING_PAD)];
  })();
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
      {onZoomOut !== undefined ? (
        /*
        §11.12: the way out is the collection's identity, which is what the
        zoom-out arrives at — so it is the COUNT, in whichever view is
        showing. Rendered only in the far view, the near view had no way back
        but Escape.
      */
        <button
          type="button"
          data-testid="wall-zoom-out"
          onClick={onZoomOut}
          aria-label="Show the whole collection"
          className="block cursor-pointer border-0 bg-transparent p-0 text-left text-display leading-[0.86] font-extrabold"
          style={{ marginTop: 6, color: 'inherit' }}
        >
          <span data-testid={far ? 'wall-count-far' : 'wall-count'}>{seated.length}</span>
          {/*
            §11.35: the count's departure mark. A pointer cursor and an
            accessible name are not marks — 72px of ink that does nothing else
            on this page is a display figure until something says otherwise,
            which is why the far view was reported as missing. The arrow is
            already this page's departure mark (§11.19's OPEN THE FULL RECORD
            →, §11.28's run hover), so the mark is the same in both views and
            only its timing differs: at rest on the near view's count, on
            hover on the far view's run.

            NOT the rail's set bar: that mark means "this is the current
            state", and on a control it would read as an answer rather than
            an offer. And not the caption §11.28 refused — a label on a
            control is the control's name, not a gloss on a picture.

            The far view's own count carries nothing: there is nowhere to go
            from the whole collection.
          */}
          {far ? null : (
            <span data-zoom-mark="" className={`mt-[6px] block ${LABEL}`}>
              THE WHOLE COLLECTION →
            </span>
          )}
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
  /*
    §11.28: the count sits BESIDE the drawing, not above it. The band was
    eating 281px of the 847 available — which is why the region measured
    1240 × 566 and the fixture drew 239px wide — and moving it into a column
    returns that height to the fit: 311px at 17 records and 531 at 200, the
    figures Design gives less the region's own 34px padding. The fixture is
    unchanged; the region is what grows.

    BELOW §11.26's fork the column stacks above the drawing again, because
    there is no width to put it beside: §11.24 makes the far view the whole
    shelf at 390px, and a 420px column beside it leaves nothing to draw in.
  */
  const farView = (
    <div data-region="far" className={`flex h-[calc(100vh-var(--app-nav-height,0px))] flex-col overflow-hidden p-[34px] [@media(min-width:${nearViewMinWidth()}px)]:flex-row`}>
      {/* §11.31: the count column, and the vertical between it and the drawing — the far view's second line. */}
      <div className={`relative shrink-0 [@media(min-width:${nearViewMinWidth()}px)]:w-[420px]`}>
        {count(true)}
        <div
          data-line="facts-drawing"
          aria-hidden="true"
          className={`absolute inset-y-0 right-0 hidden h-full w-px [@media(min-width:${nearViewMinWidth()}px)]:block`}
          style={{ background: "oklch(0.72 0.004 80)" }}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <WallOverview seats={seats} pulledId={null} linked onSeatClick={onZoomIn} />
      </div>
    </div>
  );
  if (far === true) return farView;

  const nearView = (
    <div data-region="near" className="grid grid-cols-[420px_1fr] gap-0">
      {/*
        §11.31's facts column. Its two horizontals exist only when the PANEL
        does — a rule under the count with nothing below it separates nothing
        — so the far view carries four lines and the landed state six. Both
        bleed across the column rather than stopping at the type's measure:
        the type has a measure and the rules have a region (§3).
      */}
      <div data-region="facts" className="relative flex flex-col p-[34px]">
        {count(false)}
        {panel === null ? null : (
          <hr data-line="facts-count" className={`border-t ${HAIRLINE}`} style={{ margin: "18px -34px 0" }} />
        )}
        <div data-testid="panel-region" className="mt-[34px]">{panel}</div>
        {/* §11.31: the vertical between the facts column and the drawing region, nav to foot. */}
        <div
          data-line="facts-drawing"
          aria-hidden="true"
          className="absolute inset-y-0 right-0 h-full w-px"
          style={{ background: "oklch(0.72 0.004 80)" }}
        />
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
        {/*
          §11.29's arrival, applied at PARSE time. The browser paints the
          server's markup before any client script runs, so a scroll issued
          from a layout effect is always a paint late — the wall appeared at
          0,0 and visibly travelled into place. The server's svg carries real
          dimensions inside this overflow-auto region, so the region is
          already scrollable here, and a script immediately after it runs
          before the first paint. Two lines, no framework state; the numbers
          come from the same layout the client lands with, so the two cannot
          drift.

          React warns that a component-rendered script never executes on the
          client, which is true and harmless here: the tag's job is the
          server's markup. A client navigation has no server paint to be late
          for, and WallLive's landing effect already supplies the arrival
          there — measured at the landing on the first sampled frame of a
          navigation from the table, and on Back and Forward. Rendering the
          tag only on the server silences the warning but changes the markup
          between server and client, which is a hydration mismatch: worse
          than the warning. It is dropped once mounted instead
          (`arrivalScript`), so the warning fires once at hydration rather
          than on every return to rest.
        */}
        {arrival === null || !arrivalScript ? null : (
          <script
            data-arrival-scroll=""
            dangerouslySetInnerHTML={{
              __html: `(function(){var e=document.currentScript.previousElementSibling.parentElement;e.scrollLeft=${arrival[0]};e.scrollTop=${arrival[1]};})();`,
            }}
          />
        )}
      </div>
    </div>
  );
  if (far === false) return nearView;
  /*
    Unmeasured, both views are in the document and CSS shows one (§11.26).
    The hidden one needs nothing further: the media query hides it with
    `display: none`, which takes its contents out of the tab order and the
    accessibility tree already. An `inert` attribute was added here and
    removed — served by the SERVER it is permanent with JavaScript off, so
    the spine link rendered unclickable, which is exactly what §11.8's
    no-JavaScript test protects. A state that exists only after a script
    runs is the wrong tool for a view the server can hide.
  */
  return (
    <>
      {nearView}
      {farView}
    </>
  );
}
