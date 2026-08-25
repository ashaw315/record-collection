import { describe, expect, it, vi } from 'vitest';
import { createRenderLoop } from './render-loop';

/**
 * The dirty-flag render loop, which NOTES recorded as an instruction before any
 * three.js work began and which this unit is the one it was written for:
 *
 *   onPointerMove  ->  dirty = true          (cheap, no render)
 *   rAF loop       ->  if (dirty) { render(); dirty = false }
 *
 * **A still record must cost nothing.** A throttled handler still fires and
 * still renders while the pointer rests, and resting is the common case on a
 * screen where someone is looking rather than moving. It also decouples input
 * rate from frame rate — a 1000Hz mouse against a 60Hz display — which is the
 * two-systems-sharing-a-number smell in a new place.
 */

/** Drives frames by hand, so a test never waits on a real animation frame. */
function fakeFrames() {
  const callbacks: FrameRequestCallback[] = [];
  let time = 0;

  return {
    request: (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: vi.fn(),
    /** Runs exactly one frame, as the browser would. */
    tick() {
      const pending = callbacks.splice(0, callbacks.length);
      time += 16;
      for (const callback of pending) callback(time);
    },
  };
}

describe('createRenderLoop', () => {
  it('renders once after the frame that follows a mark', () => {
    /**
     * Fails against `createRenderLoop`'s dirty check if it never renders. The
     * ordinary path: something changed, so the next frame draws it.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    loop.markDirty();
    frames.tick();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('does NOT render on idle frames — the half a naive test omits', () => {
    /**
     * **This is the whole point of the instruction**, and it is the assertion
     * that separates a dirty-flag loop from a plain rAF loop. A test that only
     * checks "a render happened after a move" passes against a loop that
     * renders every frame for ever, which is the thing being avoided.
     *
     * **Ten frames, not one.** NOTES records the trap from step 10 unit 4: a
     * zero measured immediately cannot distinguish DID NOT HAPPEN from HAS NOT
     * HAPPENED YET. Here the settle window is frames rather than milliseconds,
     * because frames are what the loop counts.
     *
     * Fails against any implementation that renders unconditionally.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    loop.markDirty();
    frames.tick();
    expect(render).toHaveBeenCalledTimes(1);

    for (let frame = 0; frame < 10; frame += 1) frames.tick();

    expect(render, 'a still record must cost nothing').toHaveBeenCalledTimes(1);
  });

  it('coalesces many marks between frames into ONE render', () => {
    /**
     * Fails against the flag if it queues rather than latches. A 1000Hz pointer
     * against a 60Hz display delivers ~16 moves per frame; rendering each would
     * do sixteen times the work for one visible result, which is the input-rate
     * versus frame-rate coupling the instruction exists to break.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    for (let move = 0; move < 20; move += 1) loop.markDirty();
    frames.tick();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders again after a later mark, rather than latching off', () => {
    /**
     * Fails against the flag if it is cleared permanently rather than per
     * frame. A loop that renders once and never again is indistinguishable
     * from a working one in a single-move test — and produces a record that
     * freezes after the first pointer movement.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    loop.markDirty();
    frames.tick();
    loop.markDirty();
    frames.tick();

    expect(render).toHaveBeenCalledTimes(2);
  });

  it('does not render after stop, even when marked', () => {
    /**
     * Fails against `stop` if it only cancels the pending frame. The component
     * unmounts while a record is on screen, and a loop that keeps drawing into
     * a disposed renderer is the silent-failure shape this feature keeps
     * meeting — WebGL does not complain about drawing to a dead context.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    loop.stop();
    loop.markDirty();
    frames.tick();

    expect(render).not.toHaveBeenCalled();
    expect(frames.cancel).toHaveBeenCalled();
  });

  it('renders each frame while an animation is running, then stops', () => {
    /**
     * The rise needs per-frame renders, which is the opposite of the dirty flag
     * — so it is driven through the SAME loop rather than a second mechanism,
     * and it must END. Fails against `animate` if the callback's return value
     * is ignored.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    let calls = 0;
    loop.animate('record', () => {
      calls += 1;
      return calls < 3;
    });

    for (let frame = 0; frame < 6; frame += 1) frames.tick();

    expect(calls, 'the animation ran until it said stop').toBe(3);
    expect(render, 'and each of those frames drew').toHaveBeenCalledTimes(3);
  });

  it('goes QUIET again once the animation finishes — the property that matters', () => {
    /**
     * **A rise that leaves the loop running for ever is the cost the dirty flag
     * was written to avoid**, and this is the assertion that catches it.
     *
     * Ten frames after the animation ends, the render count must not move. As
     * in the idle test above, the settle window is what distinguishes "stopped"
     * from "has not drawn yet" — NOTES, step 10 unit 4.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.start();
    let calls = 0;
    loop.animate('record', () => {
      calls += 1;
      return calls < 2;
    });

    for (let frame = 0; frame < 4; frame += 1) frames.tick();
    const settled = render.mock.calls.length;

    for (let frame = 0; frame < 10; frame += 1) frames.tick();

    expect(render, 'a settled record must cost nothing').toHaveBeenCalledTimes(settled);
  });

  it('does not render before start, so a mark cannot draw into an unbuilt scene', () => {
    /**
     * Fails against `markDirty` if it renders directly rather than setting a
     * flag. Marking before the loop runs is reachable — a texture can finish
     * loading between construction and the first frame — and drawing then would
     * touch a scene the caller has not finished assembling.
     */
    const render = vi.fn();
    const frames = fakeFrames();
    const loop = createRenderLoop(render, frames);

    loop.markDirty();

    expect(render).not.toHaveBeenCalled();
  });
});

/**
 * **Two lanes, because the wall and the record animate at the same time.**
 *
 * With one step slot, installing the record's rise silently replaced the wall's
 * hover ease — and the ease's final frame, which released a lock it held, never
 * ran. `settleProud` then refused every later hover and the scene stopped
 * animating for the life of the page. A feature that passed every test and had
 * never worked in a real browser, because you must hover a spine to click it.
 */
describe('animation lanes', () => {
  /**
   * Fails against a single shared slot: the wall step would be dropped the
   * moment the record step is installed, and `wallFrames` would stop climbing.
   */
  it('a record animation does not cancel a wall animation', () => {
    const frames = fakeFrames();
    const loop = createRenderLoop(vi.fn(), frames);
    loop.start();

    let wallFrames = 0;
    loop.animate('wall', () => {
      wallFrames += 1;
      return wallFrames < 10;
    });

    frames.tick();
    expect(wallFrames).toBe(1);

    // The rise arrives mid-ease, which is what a click during a hover does.
    let recordFrames = 0;
    loop.animate('record', () => {
      recordFrames += 1;
      return recordFrames < 3;
    });

    frames.tick();
    frames.tick();

    expect(wallFrames, 'the wall ease keeps running').toBe(3);
    expect(recordFrames, 'and the record animation runs alongside it').toBe(2);
  });

  /**
   * **Replacement WITHIN a lane is preserved, and that is load-bearing.**
   *
   * Rise, return, slide and flip all write the same record's pose; two running
   * at once is the orphaned-slide hazard WallScene documents. They share the
   * 'record' lane so starting one still cancels the others.
   *
   * Fails against a fix that gave every animation its own slot.
   */
  it('a record animation replaces another record animation', () => {
    const frames = fakeFrames();
    const loop = createRenderLoop(vi.fn(), frames);
    loop.start();

    let first = 0;
    loop.animate('record', () => {
      first += 1;
      return true;
    });
    frames.tick();
    expect(first).toBe(1);

    let second = 0;
    loop.animate('record', () => {
      second += 1;
      return true;
    });
    frames.tick();
    frames.tick();

    expect(first, 'the replaced step stops running').toBe(1);
    expect(second).toBe(2);
  });

  /**
   * Fails against a lane that deletes by key regardless of which step finished:
   * a step that ends after being replaced would remove its successor.
   */
  it('a finishing step does not remove the step that replaced it', () => {
    const frames = fakeFrames();
    const loop = createRenderLoop(vi.fn(), frames);
    loop.start();

    let replaced = 0;
    loop.animate('wall', () => {
      replaced += 1;
      return false; // ends immediately when next run
    });

    let successor = 0;
    loop.animate('wall', () => {
      successor += 1;
      return true;
    });

    frames.tick();
    frames.tick();

    expect(replaced, 'the replaced step never ran').toBe(0);
    expect(successor, 'the successor keeps running').toBe(2);
  });
});
