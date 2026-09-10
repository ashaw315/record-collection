import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Every WebGL renderer releases its CONTEXT, not just its objects.**
 *
 * `renderer.dispose()` frees Three.js' own resources — geometries, materials,
 * textures, programs — and does NOT release the underlying WebGL context. The
 * context lives until the browser garbage-collects the canvas, which is
 * unbounded and, on a page that mounts several canvases, too late.
 *
 * **Measured, not assumed.** A Playwright trace of `/plane` shows sixteen
 * consecutive `WARNING: Too many active WebGL contexts. Oldest context will be
 * lost.` on every load, followed by `THREE.WebGLRenderer: Context Lost.` The
 * page mounts seven WebGL canvases at once and Chromium caps active contexts,
 * so the oldest — `WallScene`, which renders first — is evicted. It comes back
 * via `Context Restored`, but the restore took **0.46s in an isolated run and
 * 13.44s under the full test matrix**, and that latency is the whole of
 * `wall-scene.spec.ts:1149`'s intermittent failure.
 *
 * Releasing the context on unmount is the half of that repair which stands on
 * its own: contexts leaking until GC is a defect whatever is decided about how
 * many canvases the page mounts.
 *
 * **These are SOURCE assertions, and that is a real limitation.** The unit layer
 * has no WebGL, so nothing here proves a context was actually released — only
 * that the call sites exist. The precedent and the reasoning are
 * `wall-shadow.test.ts`'s: each assertion names one specific way the release
 * could be dropped by accident, and the E2E layer is where the rendering itself
 * is observed. A test that greps source is a proxy; it is used here because the
 * thing it protects cannot be reached from this layer at all, and it is named
 * after what it actually checks.
 */

const CANVASES = ['WallScene.tsx', 'PlaneCanvas.tsx', 'BoxCanvas.tsx'] as const;

const source = (file: string) => readFileSync(join(import.meta.dirname, file), 'utf-8');

describe('every canvas releases its WebGL context on teardown', () => {
  for (const file of CANVASES) {
    it(`${file} calls forceContextLoss beside dispose`, () => {
      const text = source(file);

      /*
        `dispose()` alone is the defect: it is what all three files did while
        sixteen eviction warnings fired on every page load.
      */
      expect(text, 'the renderer is disposed').toMatch(/renderer\.dispose\(\)/);
      expect(
        text,
        'and its context is released, which dispose() does not do',
      ).toMatch(/renderer\.forceContextLoss\(\)/);
    });

    /**
     * Order matters and is easy to get backwards. `forceContextLoss()` needs a
     * live context to act on, so it runs BEFORE `dispose()` tears the renderer
     * down — the reverse is a no-op that looks correct in a diff.
     */
    it(`${file} releases the context before disposing the renderer`, () => {
      const text = source(file);
      const loss = text.indexOf('renderer.forceContextLoss()');
      const dispose = text.lastIndexOf('renderer.dispose()');

      expect(loss, 'forceContextLoss is present').toBeGreaterThan(-1);
      expect(
        loss,
        'forceContextLoss must precede dispose, or it acts on a torn-down renderer',
      ).toBeLessThan(dispose);
    });
  }
});
