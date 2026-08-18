/**
 * A render loop that draws only when something has changed.
 *
 * NOTES recorded this shape before any three.js work began, and this is the
 * unit it was written for:
 *
 *     onPointerMove  ->  dirty = true          (cheap, no render)
 *     rAF loop       ->  if (dirty) { render(); dirty = false }
 *
 * **A still record costs nothing.** A throttled handler still fires and still
 * renders while the pointer rests, and resting is the common case on a screen
 * where someone is looking rather than moving. It also decouples input rate
 * from frame rate — a 1000Hz mouse against a 60Hz display — which is the
 * two-systems-sharing-a-number smell in a new place.
 *
 * The frame source is injected so a test can drive frames by hand. Waiting on
 * real animation frames to prove a render did NOT happen would be measuring a
 * timeout, and a zero measured too early cannot distinguish "did not happen"
 * from "has not happened yet" (NOTES, step 10 unit 4).
 */

export type FrameSource = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
};

export type RenderLoop = {
  /** Ask for one render on the next frame. Cheap, and safe to call often. */
  markDirty: () => void;
  start: () => void;
  stop: () => void;
};

const browserFrames: FrameSource = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createRenderLoop(
  render: () => void,
  frames: FrameSource = browserFrames,
): RenderLoop {
  let dirty = false;
  let running = false;
  let handle: number | null = null;

  const frame = () => {
    if (!running) return;

    /*
      Latched, not queued: twenty marks between frames are one render, because
      only the last one is visible. Cleared per frame rather than permanently,
      or the record freezes after its first movement.
    */
    if (dirty) {
      dirty = false;
      render();
    }

    handle = frames.request(frame);
  };

  return {
    // Sets a flag and nothing else. Rendering here would draw into a scene the
    // caller may not have finished assembling, and would couple the draw rate
    // to the pointer's.
    markDirty: () => {
      dirty = true;
    },

    start: () => {
      if (running) return;
      running = true;
      handle = frames.request(frame);
    },

    // `running` is what actually stops the drawing; cancelling the pending
    // frame merely avoids one wasted callback. WebGL does not complain about
    // drawing into a disposed context, so this must not rely on cancellation
    // alone.
    stop: () => {
      running = false;
      if (handle !== null) frames.cancel(handle);
      handle = null;
    },
  };
}
