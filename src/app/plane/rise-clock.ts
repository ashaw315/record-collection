/**
 * When the rise's clock starts, and how far along it is.
 *
 * Pure, because the decision is a decision: a component test would confirm
 * whatever the component did, and the thing that went wrong here was invisible
 * to every instrument except a frame log.
 *
 * **The defect.** Measured on `/`: the first animation frame ran at 0ms and the
 * second at 117ms — a seven-frame stall — after which frames were a clean
 * 16.7ms apart. 117ms into a 620ms ease-out is 51% risen, so the half where the
 * record is spine-shaped and visibly leaving the wall was never drawn. It read
 * as the record simply appearing.
 *
 * **The cause, measured before choosing a fix.** Per-render timings were 45.4ms
 * for the first draw and 0.4-0.9ms for every one after it: shader compilation
 * and pipeline setup, which WebGL does on the first `render()` rather than at
 * construction. The remainder is React committing the overlay, the scrim and
 * two panels in the same frame.
 *
 * That distinction decided the fix. Neither cost is the animation being slow,
 * so *delaying the start* would have moved the stall rather than removed it —
 * the rise would begin later and still jump. *Warming the pipeline* is the
 * right answer: draw one frame at the slot, then start the clock, so the
 * expensive frame is spent while the record is still spine-shaped and exactly
 * where the spine is.
 */

/**
 * Whether the rise's clock should start on this frame.
 *
 * One drawn frame is the whole requirement — that is what makes the pipeline
 * warm. Waiting for more would be the "delay the start" answer, which this
 * diagnosis rejected: it costs visible latency to fix nothing.
 */
export function shouldStartClock({ framesDrawn }: { framesDrawn: number }): boolean {
  return framesDrawn >= 1;
}

/**
 * How far through the rise this frame is, 0 to 1.
 *
 * Clamped at both ends: a frame can arrive after the duration has elapsed, and
 * a rise that overshoots 1 would scale the record past its settled size before
 * snapping back.
 */
export function riseProgress({
  now,
  startedAt,
  durationMs,
}: {
  now: number;
  startedAt: number;
  durationMs: number;
}): number {
  if (durationMs <= 0) return 1;

  return Math.min(1, Math.max(0, (now - startedAt) / durationMs));
}
