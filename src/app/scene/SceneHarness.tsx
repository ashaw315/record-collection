'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { WallScene, type ShelfTreatment } from '../plane/WallScene';
import { RETURN_DEFAULT_MS, RETURN_SETTLES_BY_DEFAULT, RISE_DEFAULT_MS } from '../plane/motion-tuning';
import { sceneFixtures, SCENE_COUNTS } from './fixtures';

/**
 * **The wall, with no app around it.**
 *
 * Every geometry defect in this project was invisible to arithmetic and obvious
 * in an image — the perspective slant, the depthless shelf, the per-row lean.
 * Reaching the wall previously meant logging in and manipulating a real
 * collection into each state, which is why nobody was looking.
 *
 * The counts are the ones §10b's reasoning turns on: ONE record (does a short
 * collection read as short rather than broken?), SEVENTEEN (the real
 * collection), and ONE HUNDRED AND TWENTY-FIVE (where wrapping, camera distance
 * and edge compression all become visible).
 *
 * The width control constrains the wall's own container rather than resizing
 * the browser, so both layouts can be compared without leaving the page. That
 * is a real difference from a device emulator and worth stating: it changes the
 * canvas width, which is what the camera's aspect is built from, so it exercises
 * the same arithmetic — but it does NOT change `window.innerHeight`, so
 * anything keyed to the viewport's height behaves as the desktop case.
 */
/**
 * The four shelf treatments, as a comparison rather than a proposal.
 *
 * `depth` is what ships today: real BoxGeometry depth that is invisible from
 * square-on. The other three are the ways out — one honest (tilt the camera so
 * the top face is actually seen) and two cues (draw something that suggests a
 * surface). Adam picks by looking.
 */
const TREATMENTS: { key: ShelfTreatment; label: string }[] = [
  { key: 'depth', label: 'A · depth (current)' },
  { key: 'tilt', label: 'B · tilt 6°' },
  { key: 'tilt-12', label: 'B2 · tilt 12°' },
  { key: 'tilt-20', label: 'B3 · tilt 20°' },
  { key: 'shadow', label: 'C · cast shadow' },
  { key: 'gradient', label: 'D · lit gradient' },
];

const WIDTHS = [
  { label: '390 — phone', px: 390 },
  { label: '820 — panel threshold', px: 820 },
  { label: '1280 — desktop', px: 1280 },
  { label: 'Full width', px: 0 },
] as const;

export function SceneHarness() {
  const [count, setCount] = useState<number>(17);
  const [width, setWidth] = useState<number>(1280);
  const [treatment, setTreatment] = useState<ShelfTreatment>('depth');
  const [diagnostic, setDiagnostic] = useState(false);
  const [orbit, setOrbit] = useState<'off' | 'three-quarter' | 'high' | 'low'>('off');
  const [riseMs, setRiseMs] = useState(RISE_DEFAULT_MS);
  const [returnMs, setReturnMs] = useState(RETURN_DEFAULT_MS);
  const [returnSettle, setReturnSettle] = useState(RETURN_SETTLES_BY_DEFAULT);
  const [looping, setLooping] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);

  /**
   * **Pull, wait, put back, wait, repeat** — so the motion can be watched
   * dozens of times rather than reloaded and re-clicked for each candidate.
   *
   * Driven off the scene's own `data-phase` rather than a fixed schedule: the
   * durations are the thing being tuned, so a timer would drift out of step
   * with exactly the change under test.
   */
  useEffect(() => {
    if (!looping) return;
    let stopped = false;

    const host = () => frame.current?.querySelector('[data-testid="wall-scene"]');
    const canvas = () => frame.current?.querySelector('canvas');

    const clickAt = (xFraction: number) => {
      const el = canvas();
      if (!el) return;
      const box = el.getBoundingClientRect();
      const x = box.left + box.width * xFraction;
      const y = box.top + 120;
      for (const type of ['pointerdown', 'pointerup', 'click']) {
        el.dispatchEvent(
          new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
        );
      }
    };

    const tick = async () => {
      while (!stopped) {
        const phase = host()?.getAttribute('data-phase');
        if (phase === 'idle') {
          clickAt(0.04); // a spine near the left edge
        } else if (phase === 'settled') {
          await new Promise((r) => setTimeout(r, 700));
          if (stopped) return;
          clickAt(0.75); // empty wall — dismisses
        }
        await new Promise((r) => setTimeout(r, 160));
      }
    };
    void tick();

    return () => {
      stopped = true;
    };
  }, [looping]);

  const records = sceneFixtures(count);

  return (
    <div style={{ minHeight: '100vh', background: '#f4efe6' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'center',
          padding: '14px 18px',
          borderBottom: '1px solid #ddd4c6',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          position: 'sticky',
          top: 0,
          background: '#fbf8f3',
          zIndex: 10,
        }}
      >
        <strong>Scene harness</strong>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          records:
          {SCENE_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              style={{
                padding: '4px 10px',
                border: '1px solid #ddd4c6',
                borderRadius: 3,
                background: count === n ? '#4d3b2b' : '#fff',
                color: count === n ? '#fff' : '#1c1917',
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </span>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          width:
          {WIDTHS.map((w) => (
            <button
              key={w.px}
              type="button"
              onClick={() => setWidth(w.px)}
              aria-pressed={width === w.px}
              style={{
                padding: '4px 10px',
                border: '1px solid #ddd4c6',
                borderRadius: 3,
                background: width === w.px ? '#4d3b2b' : '#fff',
                color: width === w.px ? '#fff' : '#1c1917',
                cursor: 'pointer',
              }}
            >
              {w.label}
            </button>
          ))}
        </span>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          shelf:
          {TREATMENTS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTreatment(t.key)}
              aria-pressed={treatment === t.key}
              style={{
                padding: '4px 10px',
                border: '1px solid #ddd4c6',
                borderRadius: 3,
                background: treatment === t.key ? '#4d3b2b' : '#fff',
                color: treatment === t.key ? '#fff' : '#1c1917',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={() => setDiagnostic((d) => !d)}
          aria-pressed={diagnostic}
          title="White spines and a hard cast shadow — for reading geometry, not for judging looks"
          style={{
            padding: '4px 10px',
            border: '1px solid #ddd4c6',
            borderRadius: 3,
            background: diagnostic ? '#1c1917' : '#fff',
            color: diagnostic ? '#fff' : '#1c1917',
            cursor: 'pointer',
          }}
        >
          {diagnostic ? '◼ diagnostic ON' : '◻ diagnostic'}
        </button>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          orbit:
          {([
            ['off', 'off'],
            ['three-quarter', '3/4'],
            ['high', 'high'],
            ['low', 'low'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrbit(key)}
              aria-pressed={orbit === key}
              title="Harness only — the app's camera is fixed square-on. Drag to rotate, scroll to zoom."
              style={{
                padding: '4px 10px',
                border: '1px solid #ddd4c6',
                borderRadius: 3,
                background: orbit === key ? '#1c1917' : '#fff',
                color: orbit === key ? '#fff' : '#1c1917',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </span>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          rise
          <input
            type="range"
            min={300}
            max={2000}
            step={20}
            value={riseMs}
            onChange={(e) => setRiseMs(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <span style={{ width: 42, fontVariantNumeric: 'tabular-nums' }}>{riseMs}</span>
          return
          <input
            type="range"
            min={200}
            max={2000}
            step={20}
            value={returnMs}
            onChange={(e) => setReturnMs(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <span style={{ width: 42, fontVariantNumeric: 'tabular-nums' }}>{returnMs}</span>
        </span>

        <button
          type="button"
          onClick={() => setReturnSettle((v) => !v)}
          aria-pressed={returnSettle}
          title="Ease the return's last quarter instead of arriving at full speed"
          style={{
            padding: '4px 10px',
            border: '1px solid #ddd4c6',
            borderRadius: 3,
            background: returnSettle ? '#4d3b2b' : '#fff',
            color: returnSettle ? '#fff' : '#1c1917',
            cursor: 'pointer',
          }}
        >
          {returnSettle ? 'return: settles' : 'return: lands'}
        </button>

        <button
          type="button"
          onClick={() => setLooping((v) => !v)}
          aria-pressed={looping}
          title="Pull, pause, put back, repeat — so the motion can be watched rather than re-clicked"
          style={{
            padding: '4px 10px',
            border: '1px solid #ddd4c6',
            borderRadius: 3,
            background: looping ? '#7a2e33' : '#fff',
            color: looping ? '#fff' : '#1c1917',
            cursor: 'pointer',
          }}
        >
          {looping ? '■ stop loop' : '▶ loop pull'}
        </button>

        <span style={{ color: '#8a8078' }} data-testid="scene-state">
          {count} records · {width === 0 ? 'full' : `${width}px`} · {treatment}{diagnostic ? ' · diagnostic' : ''}{orbit !== 'off' ? ` · orbit ${orbit}` : ''}
        </span>
      </div>

      <div
        ref={frame}
        data-testid="scene-frame"
        style={{
          width: width === 0 ? '100%' : width,
          margin: '0 auto',
          outline: width === 0 ? 'none' : '1px dashed #ddd4c6',
        }}
      >
        <WallScene
          key={`${treatment}-${diagnostic}-${orbit}`}
          records={records}
          treatment={treatment}
          diagnostic={diagnostic}
          orbit={orbit}
          motion={{ riseMs, returnMs, returnSettle }}
        />
      </div>
    </div>
  );
}
