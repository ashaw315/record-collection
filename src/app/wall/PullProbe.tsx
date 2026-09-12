'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PULL_DURATION_MS, pullPose } from './pull-curve';

/**
 * **The animated pull, which is the artefact rather than a proxy for it.**
 *
 * The wall is SVG in the DOM, so animating an SVG polygon *is* the thing being
 * judged — unlike the three.js harness, which was always a stand-in. The Wall
 * 5b names this as the one question a drawing cannot settle and recommends it
 * be built first, before the surface around it: **does the eye track THIS
 * record from slot to inset, or read a new object appearing while the old one
 * leaves?**
 *
 * A still sequence cannot ask that, because the sequence supplies the answer —
 * a reader matches shapes across the page at leisure, which is exactly the
 * correspondence motion has to earn in the first few hundred milliseconds.
 *
 * **One element, transformed.** Frame 0 and frame 100 are the same polygon
 * under different transforms, so the record is never cross-faded or swapped:
 * if identity fails to carry, it fails for a reason other than the DOM losing
 * track of the node.
 */

/** The isometric basis, read off the drawing rather than assumed. */
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Seated geometry, from §1 of the drawing: 240 tall, 17–24 thick. */
const SPINE_HEIGHT = 240;

type Sample = { t: number; ms: number; width: number; height: number; x: number; y: number };

export function PullProbe({
  spineWidth = 17,
  colour = '#3b5259',
  onSamples,
}: {
  spineWidth?: number;
  colour?: string;
  onSamples?: (samples: Sample[]) => void;
}) {
  const record = useRef<SVGPolygonElement>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const samples = useRef<Sample[]>([]);

  /**
   * The seated spine's front face, and the pulled record's front face, in the
   * same coordinate space — so one polygon can be driven between them.
   *
   * Seated: a sheared parallelogram, `spineWidth` across at 30°.
   * Pulled: axis-aligned, square, filling its share of the frame.
   */
  const seated = { x: 120, y: 120, w: spineWidth, h: SPINE_HEIGHT };
  const finalSize = 232;

  const points = useCallback(
    (p: number) => {
      const pose = pullPose(p, 1, finalSize / spineWidth);
      const w = seated.w * pose.scale;
      const h = seated.h + (finalSize - seated.h) * pose.eased;

      /* Travel: out of the row and toward the frame's centre, on the same
         eased value as the scale — one curve, three properties. */
      const x = seated.x + (300 - seated.x) * pose.eased;
      const y = seated.y + (120 - seated.y) * pose.eased;

      /*
        **The shear resolving to zero.** At rest the top edge rises to the right
        by `w * SIN30 / COS30`; at the end it is flat. The record never rotates
        — the shear simply goes away, which is the read this probe exists to
        judge.
      */
      const lift = (w * SIN30) / COS30 * pose.shear;

      return [
        [x, y + lift],
        [x + w, y],
        [x + w, y + h],
        [x, y + h + lift],
      ]
        .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
        .join(' ');
    },
    [seated.h, seated.w, seated.x, seated.y, spineWidth],
  );

  /**
   * Driven by rAF rather than by `<animate>`, so `getScreenCTM()` can be
   * sampled at known times against the curve. A declarative SMIL animation
   * would be smoother to write and impossible to measure from the outside.
   */
  useEffect(() => {
    if (!running) return;

    const started = performance.now();
    samples.current = [];
    let handle = 0;
    let nextSample = 0;

    const frame = (now: number) => {
      const ms = now - started;
      const p = Math.min(1, ms / PULL_DURATION_MS);
      setProgress(p);

      /* Sample at 100ms boundaries — what a viewer sees at those moments. */
      if (ms >= nextSample && record.current !== null) {
        const box = record.current.getBBox();
        const ctm = record.current.getScreenCTM();
        samples.current.push({
          t: p,
          ms: Math.round(ms),
          width: box.width,
          height: box.height,
          x: ctm === null ? box.x : box.x * ctm.a + ctm.e,
          y: ctm === null ? box.y : box.y * ctm.d + ctm.f,
        });
        nextSample += 100;
      }

      if (p < 1) {
        handle = requestAnimationFrame(frame);
      } else {
        setRunning(false);
        onSamples?.(samples.current);
      }
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [running, onSamples]);

  return (
    <div>
      <svg viewBox="0 0 620 420" width="620" height="420" style={{ background: '#f9f7f4' }}>
        {/* The shelf outline — unbroken beneath the empty slot, which is §2's
            collision: the shelf is still there and the record is not on it. */}
        <polygon
          points="40,380 260,253 320,288 100,415"
          fill="none"
          stroke="#161412"
          strokeWidth="1.6"
        />

        {/* Neighbours, seated. The slot the record left stays empty. */}
        {[0, 1, 3, 4].map((index) => {
          const x = 60 + index * 22;
          const y = 140 + index * 12;
          const lift = (17 * SIN30) / COS30;
          return (
            <polygon
              key={index}
              points={`${x},${y + lift} ${x + 17},${y} ${x + 17},${y + SPINE_HEIGHT} ${x},${y + SPINE_HEIGHT + lift}`}
              fill="#8a8079"
              stroke="#161412"
              strokeWidth="1"
            />
          );
        })}

        {/* ONE polygon, transformed. Never swapped, never cross-faded. */}
        <polygon
          ref={record}
          data-testid="pulled-record"
          points={points(progress)}
          fill={colour}
          stroke="#161412"
          strokeWidth="1.8"
        />
      </svg>

      <div style={{ marginTop: 8, font: "500 11px 'Geist Mono', monospace" }}>
        <button type="button" data-testid="run-pull" onClick={() => setRunning(true)}>
          Pull ({PULL_DURATION_MS}ms)
        </button>{' '}
        <button type="button" data-testid="reset-pull" onClick={() => setProgress(0)}>
          Reset
        </button>{' '}
        <span data-testid="pull-progress">{(progress * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
