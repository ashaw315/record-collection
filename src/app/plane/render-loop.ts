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

/**
 * Which animation a step belongs to.
 *
 * **Two, and the split is the domain's rather than a convenience.** The wall
 * and the pulled record are different objects touching different meshes, and
 * they animate at the same time in normal use — you hover a spine (the wall
 * eases it proud) and then click it (the record rises). With one slot the
 * second silently replaced the first.
 *
 * WITHIN a lane, replacement is deliberate and load-bearing: rise, return,
 * slide and flip all write the same record's pose, and two at once is the
 * orphaned-slide hazard `WallScene` documents. They share the 'record' lane so
 * that starting one still cancels the others, exactly as before.
 */
export type AnimationLane = 'wall' | 'record';

export type RenderLoop = {
  /** Ask for one render on the next frame. Cheap, and safe to call often. */
  markDirty: () => void;
  /**
   * Run `step` on every frame until it returns false, rendering each time.
   *
   * The opposite of the dirty flag, and driven through the SAME loop rather
   * than a second mechanism so there is one place that decides whether a frame
   * draws. **It must END**: an animation that never returns false leaves the
   * loop running for ever, which is exactly the cost the flag exists to avoid.
   *
   * **Lane-scoped.** A step replaces only the step in its own lane; the other
   * lane keeps running. Replacing within a lane is how mutually exclusive
   * animations exclude each other, and is why `lane` is required rather than
   * optional — a caller that omitted it would silently join whichever lane the
   * default named.
   */
  animate: (lane: AnimationLane, step: (now: number) => boolean) => void;
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
  const steps = new Map<AnimationLane, (now: number) => boolean>();

  const frame = (now: number) => {
    if (!running) return;

    /*
      An animation asks for a frame every frame, so it sets the flag rather
      than rendering directly — one place decides whether a frame draws, and
      the two mechanisms cannot disagree about it.

      Every lane runs on every frame. Iterating a snapshot rather than the map
      itself, because a step may install or cancel another lane's animation as
      it finishes — mutating a Map while iterating it is how the hover ease
      would silently skip a frame.
    */
    for (const [lane, step] of [...steps]) {
      const more = step(now);
      dirty = true;
      // Cleared as soon as it says stop, so the loop goes quiet again.
      if (!more && steps.get(lane) === step) steps.delete(lane);
    }

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

    animate: (lane, next) => {
      steps.set(lane, next);
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
      steps.clear();
      if (handle !== null) frames.cancel(handle);
      handle = null;
    },
  };
}
