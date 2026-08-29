'use client';

import { useState } from 'react';
import { WallScene, type ShelfTreatment } from '../plane/WallScene';
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

        <span style={{ color: '#8a8078' }} data-testid="scene-state">
          {count} records · {width === 0 ? 'full' : `${width}px`} · {treatment}
        </span>
      </div>

      <div
        data-testid="scene-frame"
        style={{
          width: width === 0 ? '100%' : width,
          margin: '0 auto',
          outline: width === 0 ? 'none' : '1px dashed #ddd4c6',
        }}
      >
        <WallScene key={treatment} records={records} treatment={treatment} />
      </div>
    </div>
  );
}
