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
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
  countLine?: string | null;
}) {
  const [pulls, setPulls] = useState<readonly PullState[]>([]);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const held = pulls.find((state) => state.direction === 'out') ?? null;
  const started = useRef<number | null>(null);

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
      }
      setPulls([{ id, direction, progress: 0 }]);
    },
    [visible],
  );

  /* The arrows: the held record goes back and its neighbour comes out, on one clock. */
  const go = useCallback(
    (direction: Direction) => {
      const next = navigate(pulls, seats.map((seat) => seat.id), direction);
      if (next === null) return;
      started.current = null;
      setSide('front');
      setView((current) => current ?? visible());
      setPulls(next);
    },
    [pulls, seats, visible],
  );

  /* One clock drives every moving record; a returned record drops out when it lands. */
  const clockKey = pulls.map((state) => `${state.id}:${state.direction}`).join('|');
  useEffect(() => {
    if (pulls.length === 0 || pulls.every((state) => state.progress >= 1)) return;

    let handle = 0;
    const frame = (now: number) => {
      if (started.current === null) started.current = now;
      const progress = Math.min(1, (now - started.current) / PULL_DURATION_MS);

      setPulls((current) =>
        current
          .map((state) => ({ ...state, progress }))
          /* Landed: the seated anchor is drawn again by the ordinary path. */
          .filter((state) => !(state.direction === 'back' && progress >= 1)),
      );
      if (progress < 1) handle = requestAnimationFrame(frame);
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

  return (
    <div data-wall-container="">
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
