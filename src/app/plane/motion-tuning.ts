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
 * **1400ms, chosen by watching the loop rather than derived.**
 *
 * The first guess was 720 — "slightly slower" than the 620 both motions shared.
 * Watching it repeatedly took it much further: the rise carries the quarter-turn
 * from edge-on to face-on, the most information-dense moment in the motion, and
 * at 620ms that turn is over before the eye has followed it.
 *
 * **Noted for whoever revisits:** 1400 was the harness slider's ceiling when it
 * was chosen. The ceiling was raised to 2000 and the value re-checked, so this
 * is a number rather than the place a control stopped.
 */
export const RISE_DEFAULT_MS = 1400;

/**
 * **EQUAL to the rise, and the asymmetry this replaces was wrong.**
 *
 * The first split made the return faster, reasoning that *"reaching for
 * something is deliberate, putting it back is casual"*. Watching it overturned
 * that — Adam: *"A record going back into a slot at speed reads as dropped
 * rather than replaced, and the slowness is what makes it feel handled."*
 *
 * **Replacing a record is not dropping one.** The casualness argument describes
 * a different action than the one this animation depicts.
 *
 * Kept as its own constant rather than collapsed into `RISE_DEFAULT_MS`: they
 * are equal by JUDGEMENT, not by definition, and a change to one should have to
 * state whether it means the other.
 */
export const RETURN_DEFAULT_MS = 1400;

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


/**
 * **The return SETTLES: it eases over the last quarter rather than arriving at
 * full speed.**
 *
 * Chosen by watching, and the velocity numbers are why it reads better. Over the
 * final 5% of the motion:
 *
 *     plain ease-in      1.90   accelerating into the slot, then stopping dead
 *     settled variant    0.50   decelerating, so the record seats
 *
 * Adam: *"arriving at 1.9 and stopping instantly is what I was seeing as
 * stopping dead, and easing the last quarter to 0.5 is what makes it seat rather
 * than halt."*
 *
 * **The counter-argument, and why it loses:** a real record dropped into a slot
 * genuinely does arrive with speed. But *"that is true of dropping one, and that
 * is not what this animation is depicting"* — the record is being replaced by
 * hand, not released.
 */
export const RETURN_SETTLES_BY_DEFAULT = true;
