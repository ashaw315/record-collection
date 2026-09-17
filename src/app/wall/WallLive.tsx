'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PullState } from './WallLabelled';
import { WallStage } from './WallStage';
import type { RecordSummary } from './summary';
import type { WallSeat } from './shelf-runs';
import { PULL_DURATION_MS } from './pull-curve';
import { labelsFit } from './geometry';

/**
 * The 1:1 wall with its pull driven against the clock.
 *
 * `WallLabelled` draws a pose; this owns WHICH record is moving and how far,
 * by `requestAnimationFrame` rather than `<animate>` — the same reason as the
 * probe: a declarative animation is smoother to write and impossible to sample
 * from outside, and §11.2's claims are all about when.
 *
 * Click a spine to pull it; click the pulled record (or press Escape) to send
 * it back. A click on another spine while one is out sends the first back
 * first — one record moves at a time, which is what the shelf's runs assume.
 */
export function WallLive({
  seats,
  summaries = {},
}: {
  seats: readonly WallSeat[];
  summaries?: Record<string, RecordSummary>;
}) {
  const [pull, setPull] = useState<PullState | null>(null);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const started = useRef<number | null>(null);

  /*
    §5's guard, measured (D1): labels are removed only when the container
    cannot hold one record. Rendered with labels first — the server has no
    width — and re-measured on resize.
  */
  const container = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(true);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    const el = container.current;
    if (el === null) return;
    const measure = () => {
      setLabels(labelsFit(el.clientWidth));
      setWidth(el.clientWidth);
      /* A32's fork is measured on the page: at 1280 the wall's column is 819px, one short of it. */
      setViewport(window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const begin = useCallback((id: string, direction: PullState['direction']) => {
    started.current = null;
    if (direction === 'out') setSide('front');
    setPull({ id, direction, progress: 0 });
  }, []);

  useEffect(() => {
    if (pull === null || pull.progress >= 1) return;

    let handle = 0;
    const frame = (now: number) => {
      if (started.current === null) started.current = now;
      const progress = Math.min(1, (now - started.current) / PULL_DURATION_MS);

      if (pull.direction === 'back' && progress >= 1) {
        /* Landed: the seated outline is drawn again by the ordinary path. */
        setPull(null);
        return;
      }
      setPull({ ...pull, progress });
      if (progress < 1) handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
    /* Re-armed on id/direction, not on every progress tick. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull?.id, pull?.direction]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pull !== null && pull.direction === 'out') begin(pull.id, 'back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pull, begin]);

  return (
    <div ref={container} data-wall-container="">
      <WallStage
        seats={seats}
        summaries={summaries}
        pull={pull}
        side={side}
        width={width}
        viewport={viewport}
        labels={labels}
        onSeatClick={(id) => {
          if (pull === null) begin(id, 'out');
        }}
        onPulledClick={() => {
          if (pull !== null && pull.direction === 'out' && pull.progress >= 1) begin(pull.id, 'back');
        }}
        onTurnOver={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
        onPutBack={() => {
          if (pull !== null && pull.direction === 'out') begin(pull.id, 'back');
        }}
      />
    </div>
  );
}
