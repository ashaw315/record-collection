'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PullState } from './WallLabelled';
import { WallStage } from './WallStage';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { labelsFit } from './geometry';
import { navigate, type Direction } from './adjacent-seat';
import { LANDING_PAD } from './landing';
import type { View } from './view';
import { OUT_MS, RETURN_MS, SWING_MS, outTime, settled } from './gesture';
import { frameView, landedExtent, panFraction, panView, type Pan } from './pan';
import { wallLayout } from './wall-layout';
import { isFarView } from './view-fork';
import { DEFAULT_ROUTE_VIEW, arrivalSeat, nearView, type RouteView } from './route-view';

/** The view's top-left in the svg's px, from the region's scroll against the frame's originRef; the svg sits LANDING_PAD below the region's content top. */
function readView(el: HTMLDivElement, [frameX, frameY]: readonly [number, number]): [number, number] {
  return [frameX + el.scrollLeft, frameY + el.scrollTop - LANDING_PAD];
}

function writeView(el: HTMLDivElement, [frameX, frameY]: readonly [number, number], v: readonly [number, number]): void {
  el.scrollLeft = v[0] - frameX;
  el.scrollTop = v[1] - frameY + LANDING_PAD;
}

/**
 * The 1:1 wall with its gesture driven against the clock.
 *
 * `WallStage` draws states; this owns WHICH records are moving and how far
 * along their own clocks, by `requestAnimationFrame` rather than `<animate>`
 * — a declarative animation is smoother to write and impossible to sample
 * from outside, and §11.19's claims are all about when.
 *
 * Click a spine to pull it (1600ms out: the 1300ms swing and the 300ms
 * finish); click the field, press Escape or Put back to send it back (860ms,
 * the whole gesture reversed on one clock — from wherever it stood). The
 * arrows (and ← →) slide along the collection: the held record goes back
 * and its neighbour comes out on one clock (§11.8).
 */
export function WallLive({
  seats,
  summaries = {},
  countLine = null,
  opens = DEFAULT_ROUTE_VIEW,
  opensShelf,
  onView,
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  countLine?: string | null;
  /** §11.29: the run the near view opens on, from the URL. Absent means the arrival's own choice. */
  opensShelf?: number;
  /** §11.29: told when the reader zooms, so the page can put it in the URL and Back can return. */
  onView?: (wall: 'near' | 'far', shelf?: number) => void;
  /**
   * Which view the route opens in (§11.12: `/` opens far). A probe or a
   * harness that is about the near view asks for it directly — the opening
   * view is the ROUTE's, so a component that is not the route must not
   * inherit it.
   */
  opens?: RouteView;
}) {
  /*
    §11.12: the route opens FAR and has two named targets. Above §11.24's fork
    both views exist and this says which is showing; below it the fork decides
    and this is not consulted. `landOn` carries the seat a zoom-in must land
    the near view on, applied once the region has been measured.
  */
  const [routeView, setRouteView] = useState<RouteView>(opens);
  /*
    §11.29: the ADDRESS is authoritative when it changes under a mounted wall.
    `useState(opens)` reads the prop once, so a Back or a Forward — which
    swap the URL without remounting this component — left the view showing
    whatever the last click had set while the URL said otherwise. The wall
    owns the view's immediate state, and the two zoom handlers still set it
    before the push lands; this only reconciles the two when the route moves
    on its own. Comparing against the last `opens` SEEN — React's documented
    adjust-state-during-render pattern, not an effect — is what keeps a
    zoom's own optimistic change from being reverted by the render that
    precedes the push: syncing on every render would fight the handler, and
    an effect would show the wrong view for a frame first.
  */
  const [lastOpens, setLastOpens] = useState<RouteView>(opens);
  if (lastOpens !== opens) {
    setLastOpens(opens);
    if (routeView !== opens) setRouteView(opens);
  }
  /*
    §11.29's arrival script can only do work at parse time, so it is rendered
    for the first client render — hydration must match the server's HTML —
    and dropped once mounted. Left in, React logs its script warning on every
    later commit, which is every return to rest.
  */
  /*
    The script is rendered while the viewport is unmeasured — the server's
    state and the first client render, so hydration matches — and gone from
    the commit the measurement triggers. That is one render later, by which
    time the parser has long finished, and it needs no flag of its own:
    `viewport` is already the thing that changes on mount.
  */
  /*
    **The pending landing** (§11.12): the seat a zoom-in must put at the
    region's left, with its shelf at the region's top.
    
    It is consumed by the pan effect rather than applied where it is set,
    because that effect is the one place that runs with the frame the drawing
    COMMITTED. The measuring effect sets `width`, and the drawing lays its
    frame out from that state — so a write issued from inside the commit that
    produces the new frame is a frame ahead of itself: it computes against the
    frame about to exist and writes against the one still on screen. The pan
    effect already owns where the view sits; a pending landing is a second
    instruction to that owner, not a new responsibility.
  */
  const landOn = useRef<string | null>(null);
/**
   * The scroll position the app's own landing write intends, or `null` when
   * the next scroll is the reader's. The listener ignores a scroll only when
   * what it sees MATCHES that intent — see `onScroll`.
   */
  const landingWriteRef = useRef<{ left: number; top: number } | null>(null);
  /* §11.29: the desktop opens near and ARRIVES on the occupied shelf, through the same landing a zoom-in uses. */
  const arrived = useRef(false);
  const [pulls, setPulls] = useState<readonly PullState[]>([]);
  /* §11.22: every record that has moved since the wall was last at rest — its landing stays in the frame until then. */
  const [framed, setFramed] = useState<readonly string[]>([]);
  /*
    The clock reads the moving set from here: a state updater runs at render
    time, not when it is queued, so nothing can be decided inside one. Synced
    after each commit; a frame that reads it a commit early recomputes from
    elapsed time anyway.
  */
  const pullsRef = useRef<readonly PullState[]>([]);
  useEffect(() => {
    pullsRef.current = pulls;
  }, [pulls]);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const held = pulls.find((state) => state.direction === 'out') ?? null;
  const started = useRef<number | null>(null);
  /* Where each moving record's own clock stood when the current run began: a return starts from wherever the out had got to. */
  const base = useRef(new Map<string, number>());

  /*
    §5's guard, measured (D1): labels are removed only when the container
    cannot hold one record. Rendered with labels first — the server has no
    width — and re-measured on resize.
  */
  const region = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(true);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  /* The visible region when the pull began. */
  const [view, setView] = useState<View | null>(null);
  /*
    Re-attached when the route's view changes (§11.12): the drawing region
    belongs to the NEAR view, so on the far view there is nothing to observe
    and the first measurement has to wait for the zoom in. The viewport is
    measured either way — §11.24's fork needs it before a region exists.
  */
  useEffect(() => {
    const measureViewport = () => setViewport(window.innerWidth);
    measureViewport();
    window.addEventListener('resize', measureViewport);
    return () => window.removeEventListener('resize', measureViewport);
  }, []);

  /** The region's visible box in the svg's px: the svg sits LANDING_PAD below the region's content top, at its left. */
  const visible = useCallback((): View | null => {
    const el = region.current;
    if (el === null) return null;
    return { x: el.scrollLeft, y: el.scrollTop - LANDING_PAD, width: el.clientWidth, height: el.clientHeight - LANDING_PAD };
  }, []);

  /*
    §11.22: the view pans; the gesture does not move. The view is tracked in
    the svg's own px — its top-left, `viewNowRef` — and the scroll is derived
    from it against the frame's originRef, so the frame growing to hold a
    landing (which moves the svg's originRef) never moves the wall on screen.
    Every landing stays in the frame until the wall is at rest again, so the
    view is always representable as a scroll. A pull pans from the view where
    it began to the landing's framing; put back retraces to the view before
    the first pull; the arrows' neighbour pans on from the previous framing.
  */
  const viewNowRef = useRef<[number, number] | null>(null);
  const restViewRef = useRef<[number, number] | null>(null);
  const panRef = useRef<Pan | null>(null);
  /* The frame's originRef as last committed, for the scroll listener that tracks the view at rest. */
  const originRef = useRef<[number, number]>([0, 0]);
  const gestureOnRef = useRef(false);
  const pullKey = pulls.map((p) => `${p.id}:${p.direction}`).join('|');
  useLayoutEffect(() => {
    const el = region.current;
    if (el === null) return;
    /* The same layout the drawing committed, for its frame's origin. */
    const layout = wallLayout(seats, framed.map((id) => ({ id })), width, view === null ? 0 : Math.max(view.height, height));
    const [frameX, frameY] = layout.frame.viewBox.split(' ').map(Number);
    /*
      §11.12's landing, consumed here and exactly once: it is where the reader
      is GOING, so it replaces the tracked view rather than being restored
      after it. The seat comes from this layout — the committed frame's own —
      so the target and the origin it is written against are the same frame.
    */
    /*
      §11.29's arrival: the first frame of a near-opening route lands on the
      occupied shelf rather than the fixture's top corner, by setting the same
      pending landing a zoom-in sets. Once only — a reader who has scrolled
      away is not dragged back by a later commit.
    */
    /*
      §11.29's arrival: the first frame of a near-opening route lands on the
      occupied shelf rather than the fixture's top corner, by setting the same
      pending landing a zoom-in sets. Once only — a reader who has scrolled
      away is not dragged back by a later commit.

      KNOWN, and asserted as failing by wall-first-paint.spec.ts: this is a
      layout effect, so the browser has already painted the server's markup
      at 0,0 and the wall visibly scrolls up into position. The position has
      to be right in what the SERVER sends; that is the next unit.
    */
    if (!arrived.current && routeView === 'near' && width > 0) {
      arrived.current = true;
      if (landOn.current === null && pulls.length === 0) {
        /* §11.29: the URL's shelf if it names one, else the arrival's own — the first occupied run. */
        const addressed =
          opensShelf === undefined
            ? null
            : ([...new Set(layout.placed.map((p) => p.z))].sort((a, b) => b - a)[opensShelf] ?? null);
        const first =
          addressed === null
            ? arrivalSeat(layout.placed)
            : (layout.placed.find((p) => p.z === addressed) ?? arrivalSeat(layout.placed));
        if (first !== null) landOn.current = first.id;
      }
    }
    const landing = landOn.current;
    /*
      Consumed only on a commit whose frame is the region's OWN: after a zoom
      the first commit still carries the previous view's measured width, and a
      landing written against that frame is written against a layout the
      drawing is about to replace. Waiting for the widths to agree is what
      makes "exactly once" also mean "on the right frame".
    */
    if (landing !== null && width === el.clientWidth) {
      const seat = layout.placed.find((p) => p.id === landing);
      if (seat !== undefined) {
        landOn.current = null;
        /* Counted so the ordering can be asserted: consumed exactly once, on the commit whose frame is the region's own (§11.12). */
        const counter = window as unknown as { __landings?: number };
        counter.__landings = (counter.__landings ?? 0) + 1;
        /* The addressed seat's whole ROW, so the target takes in every top face the arrival shows (§11.28). */
        const row = layout.placed.filter((p) => p.z === seat.z);
        const target = nearView(seat, { width: el.clientWidth, height: el.clientHeight - LANDING_PAD }, row);
        /*
          The scroller clamps: a seat late in the row cannot reach the region's
          left edge, so the landing is min(target, scrollWidth − clientWidth)
          — as far left as the wall allows (§11.12).
        */
        writeView(el, [frameX, frameY], target);
        /* What this write actually landed on, clamped: the listener ignores exactly this and nothing else. */
        landingWriteRef.current = { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) };
        originRef.current = [frameX, frameY];
        /* Clamped by the scroller: near the wall's left or top edge the region cannot pan that far. */
        viewNowRef.current = readView(el, [frameX, frameY]);
        gestureOnRef.current = pulls.length > 0;
        return;
      }
    }
    /* The frame may have moved its origin in this commit: hold the view where it was — on the way into a gesture and out of it. */
    if (viewNowRef.current !== null) writeView(el, [frameX, frameY], viewNowRef.current);
    originRef.current = [frameX, frameY];
    gestureOnRef.current = pulls.length > 0;
    if (pulls.length === 0) {
      viewNowRef.current = readView(el, [frameX, frameY]);
      restViewRef.current = null;
      panRef.current = null;
      return;
    }
    const current = readView(el, [frameX, frameY]);
    if (restViewRef.current === null) restViewRef.current = current;
    const arriving = pulls.find((state) => state.direction === 'out');
    if (arriving !== undefined) {
      if (panRef.current?.forId !== arriving.id) {
        const seat = layout.placed.find((p) => p.id === arriving.id);
        if (seat !== undefined) {
          panRef.current = { forId: arriving.id, from: current, to: frameView(landedExtent(seat), { width: el.clientWidth, height: el.clientHeight - LANDING_PAD }), at0: 1 };
        }
      }
    } else if (pulls[0] !== undefined && panRef.current?.forId !== `back:${pulls[0].id}`) {
      panRef.current = { forId: `back:${pulls[0].id}`, from: current, to: restViewRef.current, at0: panFraction(pulls[0]) };
    }
    viewNowRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats, framed, width, height, view, pullKey, routeView]);
  /* At rest the reader pans (§11.6): the view follows, so a gesture begins from where the reader left it. */
  useEffect(() => {
    const el = region.current;
    if (el === null) return;
    const onScroll = () => {
      /*
        The landing's own write fires this, and it has already recorded where
        it put the view (§11.12). What distinguishes it from the reader's
        scroll is the POSITION, not the timing: the write records where it
        intends to land, and this ignores a scroll only when it sees exactly
        that. A write that moves nothing therefore needs no clearing — it
        fires no event and the record is dropped on the next scroll of any
        kind — where a flag cleared by this handler stayed armed and
        swallowed the reader's next genuine scroll: the tracked view stayed
        at the arrival, the pull began from there, and put back returned
        there instead of to where the reader was (593 scrolled, 75 returned).
      */
      const intended = landingWriteRef.current;
      landingWriteRef.current = null;
      if (intended !== null && Math.round(el.scrollLeft) === intended.left && Math.round(el.scrollTop) === intended.top) return;
      if (!gestureOnRef.current) viewNowRef.current = readView(el, originRef.current);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = region.current;
    if (el === null) return;
    const measure = () => {
      const regionWidth = el.clientWidth;
      const regionHeight = el.clientHeight - LANDING_PAD;
      setLabels(labelsFit(regionWidth));
      setWidth(regionWidth);
      setHeight(regionHeight);

    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [routeView]);
  const begin = useCallback(
    (id: string, direction: PullState['direction']) => {
      started.current = null;
      if (direction === 'out') {
        setSide('front');
        setView(visible());
        base.current.set(id, 0);
        setFramed((current) => (current.includes(id) ? current : [...current, id]));
        setPulls([{ id, direction, ms: 0 }]);
      } else {
        /* The return begins at the time that mirrors where the out had got to: the whole gesture reversed (§11.21). */
        const from = held !== null && held.id === id ? RETURN_MS * (1 - outTime(held) / OUT_MS) : 0;
        base.current.set(id, from);
        setPulls([{ id, direction, ms: from }]);
      }
    },
    [visible, held],
  );

  /* The arrows: the held record goes back and its neighbour comes out, on one clock. */
  const go = useCallback(
    (direction: Direction) => {
      const next = navigate(pulls, seats.filter((seat) => !seat.empty).map((seat) => seat.id), direction);
      if (next === null) return;
      started.current = null;
      setSide('front');
      setView((current) => current ?? visible());
      for (const state of next) base.current.set(state.id, state.ms);
      setFramed((current) => [...current, ...next.map((state) => state.id).filter((id) => !current.includes(id))]);
      setPulls(next);
    },
    [pulls, seats, visible],
  );

  /* One clock drives every moving record; a returned record drops out when it lands. */
  const clockKey = pulls.map((state) => `${state.id}:${state.direction}`).join('|');
  useEffect(() => {
    if (pulls.length === 0 || pulls.every(settled)) return;

    let handle = 0;
    const frame = (now: number) => {
      if (started.current === null) started.current = now;
      const elapsed = now - started.current;
      const next = pullsRef.current.map((state) => ({ ...state, ms: (base.current.get(state.id) ?? 0) + elapsed }));
      /* The pan, on the same clock: the view follows the record coming out, or the one going back. */
      const el = region.current;
      const driver = next.find((state) => state.direction === 'out') ?? next[0];
      if (el !== null && panRef.current !== null && driver !== undefined) {
        const v = panView(panRef.current, driver);
        viewNowRef.current = v;
        writeView(el, originRef.current, v);
      }
      /* Landed: the seated anchor is drawn again by the ordinary path; at rest, the frame lets the landings go. */
      const remaining = next.filter((state) => !(state.direction === 'back' && settled(state)));
      setPulls(remaining);
      if (remaining.length === 0) setFramed([]);
      if (!next.every(settled)) handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
    /* Re-armed when the SET of moving records changes, not on every tick. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockKey]);

  /* §11.12's two targets. In: the near view lands on the seat. Out: back to the whole collection. */
  /*
    §11.29: a zoom is a place, so it goes in the URL — pushed, so Back returns
    to where the reader was. The view's own state changes immediately; the URL
    follows, and a reload reads it back.
  */
  const zoomIn = useCallback(
    (id: string) => {
      landOn.current = id;
      setRouteView('near');
      const row = seats.findIndex((seat) => seat.id === id);
      onView?.('near', row < 0 ? undefined : row);
    },
    [onView, seats],
  );
  const zoomOut = useCallback(() => {
    landOn.current = null;
    setRouteView('far');
    onView?.('far');
  }, [onView]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /* Escape dismisses the pulled state; with nothing out it is the way back to the collection (§11.12). */
      if (event.key === 'Escape' && held === null && routeView === 'near') zoomOut();
      if (event.key === 'Escape' && held !== null) begin(held.id, 'back');
      if (event.key === 'ArrowRight') go('next');
      if (event.key === 'ArrowLeft') go('previous');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [held, begin, go, routeView, zoomOut]);

  /* The gesture's phase, for whoever watches: rest · swing · finish · landed · return. */
  const phase =
    held !== null
      ? held.ms < SWING_MS
        ? 'swing'
        : held.ms < OUT_MS
          ? 'finish'
          : 'landed'
      : pulls.length === 0
        ? 'rest'
        : 'return';

  return (
    <div data-wall-container="" data-phase={phase} {...(viewport === 0 ? { 'data-unmeasured': '' } : {})}>
      <WallStage
        seats={seats}
        summaries={summaries}
        pulls={pulls}
        side={side}
        width={width}
        viewport={viewport}
        view={view === null ? null : { ...view, height: Math.max(view.height, height) }}
        countLine={countLine}
        regionRef={region}
        labels={labels}
        /*
          Unmeasured on the server, so both render and CSS shows the right one
          (§11.26); once measured the fork decides below §11.24's width and
          the route's own view decides above it (§11.12).
        */
        /*
          Unmeasured, BOTH regions render and the composition's media query
          shows the right one — the first paint is already correct (§11.29).
          Once measured, the fork and the route's own state decide.
        */
        far={viewport === 0 ? null : isFarView(viewport) || routeView === 'far'}
        arrivalScript={viewport === 0}
        onZoomIn={viewport > 0 && !isFarView(viewport) ? zoomIn : undefined}
        onZoomOut={viewport > 0 && !isFarView(viewport) ? zoomOut : undefined}
        framed={framed}
        onSeatClick={(id) => {
          if (pulls.length === 0) begin(id, 'out');
        }}
        onPulledClick={() => {
          /* The field is clickable once the record has settled. */
          if (held !== null && settled(held)) begin(held.id, 'back');
        }}
        onTurnOver={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
        onPutBack={() => {
          if (held !== null) begin(held.id, 'back');
        }}
        onNavigate={go}
      />
    </div>
  );
}
