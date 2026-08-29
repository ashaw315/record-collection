'use client';

import { useState } from 'react';
import { WallScene } from '../plane/WallScene';
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
const WIDTHS = [
  { label: '390 — phone', px: 390 },
  { label: '820 — panel threshold', px: 820 },
  { label: '1280 — desktop', px: 1280 },
  { label: 'Full width', px: 0 },
] as const;

export function SceneHarness() {
  const [count, setCount] = useState<number>(17);
  const [width, setWidth] = useState<number>(1280);

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

        <span style={{ color: '#8a8078' }} data-testid="scene-state">
          {count} records · {width === 0 ? 'full' : `${width}px`}
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
        <WallScene records={records} />
      </div>
    </div>
  );
}
