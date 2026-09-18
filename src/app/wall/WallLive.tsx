'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PullState } from './WallLabelled';
import { WallStage } from './WallStage';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { PULL_DURATION_MS } from './pull-curve';
import { labelsFit } from './geometry';
import { navigate, type Direction } from './adjacent-seat';
import { PERCEIVED_END } from './pull-colour';
import { LANDING_PAD, type View } from './landing';
import { turnEase, type TurnConfig } from './turn';

/**
 * The 1:1 wall with its pull driven against the clock.
 *
 * `WallStage` draws poses; this owns WHICH records are moving and how far,
 * by `requestAnimationFrame` rather than `<animate>` — a declarative
 * animation is smoother to write and impossible to sample from outside, and
 * §11.2's claims are all about when.
 *
 * Click a spine to pull it; click the field, press Escape or Put back to
 * send it back. The arrows (and ← →) slide along the collection: the held
 * record goes back and its neighbour comes out on one clock (§11.8). One
 * gesture at a time, which is what the shelf's planes assume.
 */
export function WallLive({
  seats,
  summaries = {},
  countLine = null,
  turn = null,
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  countLine?: string | null;
  /**
   * §11.14's second phase — out, then round — switched on by the probe and
   * off on the wall as shipped until the probe is ruled on. With it, a
   * record that has landed turns onto the page's plane over `ms`, and put
   * back is both phases reversed in reverse order.
   */
  turn?: TurnConfig | null;
}) {
  const [pulls, setPulls] = useState<readonly PullState[]>([]);
  /*
    The clock reads the moving set from here: a state updater runs at render
    time, not when it is queued, so nothing can be decided inside one. Synced
    after each commit; a frame that reads it a commit early recomputes from
    elapsed time anyway, since nothing a gesture depends on changes mid-way.
  */
  const pullsRef = useRef<readonly PullState[]>([]);
  useEffect(() => {
    pullsRef.current = pulls;
  }, [pulls]);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const held = pulls.find((state) => state.direction === 'out') ?? null;
  const started = useRef<number | null>(null);
  /* Where each returning record's turn stood when it was sent back: round from there, then in. */
  const turnFrom = useRef(new Map<string, number>());

  /*
    §5's guard, measured (D1): labels are removed only when the container
    cannot hold one record. Rendered with labels first — the server has no
    width — and re-measured on resize. A32's fork is measured on the PAGE:
    at 1280 the wall's column is 819px, one short of it.
  */
  const region = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(true);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  /* The visible region when the pull began: the record lands there and stays, whatever is panned after. */
  const [view, setView] = useState<View | null>(null);
  useEffect(() => {
    const el = region.current;
    if (el === null) return;
    const measure = () => {
      setLabels(labelsFit(el.clientWidth));
      setWidth(el.clientWidth);
      setHeight(el.clientHeight - LANDING_PAD);
      setViewport(window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** The region's visible box in the svg's px: the svg sits LANDING_PAD below the region's content top, at its left. */
  const visible = useCallback((): View | null => {
    const el = region.current;
    if (el === null) return null;
    /* The svg sits LANDING_PAD below the region's content top; the visible box in the svg's px is the client box less that offset. */
    return { x: el.scrollLeft, y: el.scrollTop - LANDING_PAD, width: el.clientWidth, height: el.clientHeight - LANDING_PAD };
  }, []);

  const begin = useCallback(
    (id: string, direction: PullState['direction']) => {
      started.current = null;
      if (direction === 'out') {
        setSide('front');
        setView(visible());
      } else {
        turnFrom.current.set(id, held?.turn ?? 0);
      }
      setPulls([{ id, direction, progress: 0, ...(direction === 'back' && held?.turn !== undefined ? { turn: held.turn } : {}) }]);
    },
    [visible, held],
  );

  /* The arrows: the held record goes back and its neighbour comes out, on one clock. */
  const go = useCallback(
    (direction: Direction) => {
      const next = navigate(pulls, seats.map((seat) => seat.id), direction);
      if (next === null) return;
      started.current = null;
      setSide('front');
      setView((current) => current ?? visible());
      for (const state of next) {
        if (state.direction === 'back') turnFrom.current.set(state.id, held?.id === state.id ? (held.turn ?? 0) : 0);
      }
      setPulls(next);
    },
    [pulls, seats, visible, held],
  );

  /*
    One clock drives every moving record; a returned record drops out when it
    lands. With §11.14's phase two: out runs the pull's 1000ms and then the
    turn's `ms`, abutting with no hold; back runs the turn in reverse from
    wherever it stood (over a proportionate slice of `ms`) and then the pull
    in reverse — round, then in.
  */
  const settled = (state: PullState) =>
    state.progress >= 1 && (state.direction === 'back' || turn === null || (state.turn ?? 0) >= 1);
  const clockKey = pulls.map((state) => `${state.id}:${state.direction}`).join('|');
  useEffect(() => {
    if (pulls.length === 0 || pulls.every(settled)) return;

    const at = (state: PullState, elapsed: number): PullState => {
      if (state.direction === 'out') {
        const progress = Math.min(1, elapsed / PULL_DURATION_MS);
        if (turn === null || elapsed <= PULL_DURATION_MS) return { id: state.id, direction: 'out', progress };
        return { id: state.id, direction: 'out', progress, turn: turnEase((elapsed - PULL_DURATION_MS) / turn.ms) };
      }
      const from = turnFrom.current.get(state.id) ?? 0;
      const roundMs = turn === null ? 0 : turn.ms * from;
      if (elapsed < roundMs) return { id: state.id, direction: 'back', progress: 0, turn: from * turnEase(1 - elapsed / roundMs) };
      return { id: state.id, direction: 'back', progress: Math.min(1, (elapsed - roundMs) / PULL_DURATION_MS) };
    };

    let handle = 0;
    const frame = (now: number) => {
      if (started.current === null) started.current = now;
      const elapsed = now - started.current;
      const next = pullsRef.current.map((state) => at(state, elapsed));
      /* Landed: the seated anchor is drawn again by the ordinary path. */
      setPulls(next.filter((state) => !(state.direction === 'back' && state.progress >= 1)));
      if (!next.every(settled)) handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
    /* Re-armed when the SET of moving records changes, not on every progress tick. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && held !== null) begin(held.id, 'back');
      if (event.key === 'ArrowRight') go('next');
      if (event.key === 'ArrowLeft') go('previous');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [held, begin, go]);

  /* The gesture's phase, for whoever watches the probe: rest · pull · turn · landed · round · return. */
  const phase =
    held !== null
      ? held.progress < 1
        ? 'pull'
        : turn !== null && (held.turn ?? 0) < 1
          ? 'turn'
          : 'landed'
      : pulls.length === 0
        ? 'rest'
        : pulls[0].turn !== undefined
          ? 'round'
          : 'return';

  return (
    <div data-wall-container="" data-phase={phase}>
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
        turn={turn}
        onSeatClick={(id) => {
          if (pulls.length === 0) begin(id, 'out');
        }}
        onPulledClick={() => {
          /* Settled to the eye: the field is clickable once the panel is up. */
          if (held !== null && held.progress >= PERCEIVED_END) begin(held.id, 'back');
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
