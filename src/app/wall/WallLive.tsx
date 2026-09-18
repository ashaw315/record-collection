'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PullState } from './WallLabelled';
import { WallStage } from './WallStage';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { labelsFit } from './geometry';
import { navigate, type Direction } from './adjacent-seat';
import { LANDING_PAD } from './landing';
import type { View } from './view';
import { OUT_MS, RETURN_MS, SWING_MS, outTime, settled } from './gesture';

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
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  countLine?: string | null;
}) {
  const [pulls, setPulls] = useState<readonly PullState[]>([]);
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
    return { x: el.scrollLeft, y: el.scrollTop - LANDING_PAD, width: el.clientWidth, height: el.clientHeight - LANDING_PAD };
  }, []);

  const begin = useCallback(
    (id: string, direction: PullState['direction']) => {
      started.current = null;
      if (direction === 'out') {
        setSide('front');
        setView(visible());
        base.current.set(id, 0);
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
      const next = navigate(pulls, seats.map((seat) => seat.id), direction);
      if (next === null) return;
      started.current = null;
      setSide('front');
      setView((current) => current ?? visible());
      for (const state of next) base.current.set(state.id, state.ms);
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
      /* Landed: the seated anchor is drawn again by the ordinary path. */
      setPulls(next.filter((state) => !(state.direction === 'back' && settled(state))));
      if (!next.every(settled)) handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
    /* Re-armed when the SET of moving records changes, not on every tick. */
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
