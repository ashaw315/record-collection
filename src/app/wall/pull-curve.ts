/**
 * The pull, as one curve driving three properties (The Wall 5b §3).
 *
 * **One ease-out cubic drives translation, scale AND the shear resolving to
 * zero.** That is the decision rather than an accident: separate curves would
 * let the record finish arriving before it finishes growing, and the claim the
 * gesture makes is that ONE OBJECT is moving.
 *
 * **The curve was read off the drawing rather than assumed.** The five frames
 * share one viewBox, so the pulled record's width at each sample is measurable:
 * 17.0 → 74.3 → 103.6 → 114.5 → 116.0, which as a fraction of travel is
 * 0 / 57.9% / 87.5% / 98.5% / 100%. Ease-out cubic `1-(1-t)³` predicts
 * 0 / 57.8% / 87.5% / 98.4% / 100%. The frames ARE the curve.
 *
 * **The single curve is load-bearing, not a shortcut.** Built and watched, the
 * motion passes through no ambiguous state: size establishes the object first,
 * and the tilt then drains out of a thing already identified. That is why it
 * reads as one record flattening rather than as a cut.
 *
 * **The counterfactual is the reason not to split it.** If the scale finished
 * first, a fully grown rectangle would sit there and untilt itself — which is
 * exactly the "it turned" read the design exists to avoid. Anyone who sees one
 * curve driving three properties and takes it for laziness should split it,
 * watch it, and put it back.
 */

/**
 * §10b's rise. **1000ms, which is the length of the gesture you can see.**
 *
 * Was 1400, and never wrong against any instrument — because until the pull was
 * built, no instrument existed that could test it. The first rendering that
 * could measure it found the last 467ms carried 3.7% of the travel: at 1050ms
 * and at 1400ms the record is not distinguishable by eye.
 *
 * **The dead tail is a property of the CURVE, not of the duration**, which is
 * why shortening it does not remove the tail and why 1400 looked reasonable for
 * so long. A cubic ease-out reaches 97% of travel at t = 0.68, so the last ~32%
 * of any duration is hold: 1400ms was a ~950ms gesture with 450ms of hold, and
 * 1000ms is a ~680ms gesture with 320ms. The proportion is unchanged. What
 * changed is that the number now describes something perceivable.
 *
 * The curve is NOT softened to make a longer duration do visible work — that
 * would make the motion serve the number.
 */
export const PULL_DURATION_MS = 1000;

/**
 * Ease-out cubic. One curve, applied to every animated property.
 *
 * Clamped rather than extrapolated: a `progress` outside 0..1 is a caller bug,
 * and easing it anyway produces a record that overshoots its own slot.
 */
export function pullEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 3;
}

/** Where the record is, part-way out of its slot. */
export type PullPose = {
  /** 0 at rest in the slot, 1 fully pulled and front-facing. */
  eased: number;
  /** Multiplier on the record's seated width. */
  scale: number;
  /**
   * How much isometric shear remains, 1 at rest and 0 when front-facing.
   *
   * **The record does not rotate.** A rotation under a fixed axonometric
   * projection reads as a shear rather than as a turn, so the design resolves
   * the shear to zero instead — the face arrives square-on without ever having
   * been turned.
   *
   * **Settled by watching it: it reads as the same object flattening.** The
   * drawing could not answer this, and the answer depends on the shear sharing
   * the scale's curve — see the module comment for why splitting them breaks
   * the read.
   */
  shear: number;
};

export function pullPose(progress: number, seatedScale: number, finalScale: number): PullPose {
  const eased = pullEase(progress);

  return {
    eased,
    scale: seatedScale + (finalScale - seatedScale) * eased,
    /*
      The SAME eased value, not a second curve — that is the whole point. At
      rest the shear is full; at the end it is gone; in between it tracks the
      one curve the translation and the scale are on.
    */
    shear: 1 - eased,
  };
}
