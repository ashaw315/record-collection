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
