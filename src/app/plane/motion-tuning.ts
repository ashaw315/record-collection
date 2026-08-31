/**
 * **The pull and the return, as separately tunable motions.**
 *
 * They shared one duration (`RISE_MS = 620`) and already had different curves —
 * cubic ease-out for the rise, quadratic ease-in for the return, split
 * deliberately because "reusing the rise's easing reads as the animation played
 * backwards".
 *
 * Adam: *"Reaching for something is deliberate, putting it back is casual, and
 * the same duration both ways reads as mechanical."* So the duration splits too.
 *
 * Exported as values rather than inlined so `/scene` can sweep them and the
 * choice can be made by looking, which is how every other judgement about this
 * scene has actually been settled.
 */

/** Overrides the harness can set; production passes nothing. */
export type MotionTuning = {
  riseMs?: number;
  returnMs?: number;
  /** Adds a decelerating tail to the return's last stretch. */
  returnSettle?: boolean;
};

/**
 * **Slower than the 620ms both motions shared.**
 *
 * Adam's read was "slightly slower overall". The rise is the deliberate half —
 * reaching for a record — and it carries the quarter-turn from edge-on to
 * face-on, which is the most information-dense moment in the motion.
 */
export const RISE_DEFAULT_MS = 720;

/**
 * **Faster than the rise, because putting something back is casual.**
 *
 * Not so much faster that it reads as the record being thrown: a return that
 * undercuts the rise by about a third keeps the two recognisably the same
 * object moving, which sharing a duration did not achieve either.
 */
export const RETURN_DEFAULT_MS = 480;

/** Cubic ease-out: accelerates out of the slot and settles almost to rest. */
export const easeRise = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Quadratic ease-in: accelerates toward the gap.
 *
 * Chosen over cubic by measurement — cubic covers only 13% of the distance by
 * halfway, so the record hangs and then snaps.
 */
export const easeReturn = (t: number): number => t * t;

/**
 * **The return with a decelerating tail, for comparison.**
 *
 * The plain ease-in arrives at full speed and stops dead — velocity 1.90 at the
 * last frame against the rise's 0.01. Whether that reads as *letting go* or as
 * *hitting a wall* is a look-at-it question, so both exist and `/scene` switches
 * between them.
 *
 * Accelerates as before for most of the travel, then eases over the last
 * quarter, so the record still goes back briskly but arrives rather than lands.
 */
export const easeReturnSettled = (t: number): number => {
  const knee = 0.75;
  if (t <= knee) {
    // Same quadratic, scaled to reach the knee's value at the knee.
    return t * t;
  }
  const atKnee = knee * knee;
  const remaining = 1 - atKnee;
  const local = (t - knee) / (1 - knee);
  return atKnee + remaining * (1 - Math.pow(1 - local, 2));
};
