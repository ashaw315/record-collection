/**
 * What stage the pulled record's CHROME is in — the backdrop's dim and the
 * control row's arrival.
 *
 * **One value, read by three things.** The backdrop, the controls and the
 * record itself all render from a single `data-stage` attribute on the dialog
 * root; the stylesheet keys off it and each part carries its own transition.
 * Nothing in TypeScript sequences them, holds a duration, or waits for one part
 * before starting another.
 *
 * That constraint is the design, not a preference. Unit 10 recorded the shape
 * that has failed twice in this project: *if a number has to be the same in two
 * places for the feature to work, one system should own it.* Several things
 * animating in concert is the closest this codebase has come to that shape, so
 * the coordination is removed rather than managed — the parts never talk to
 * each other, they each answer the same question independently.
 *
 * **Why the chrome must participate at all.** Unit 10's rise was correct and
 * its frame was not: at 15% through the motion the backdrop was already at full
 * dark and the controls at final size, while the sleeve was still half-size and
 * 190px away. §10b's claim for the rise is continuity — "a record that fades in
 * centred is a modal wearing a sleeve, and the difference is felt immediately"
 * — and a modal that has already announced itself before the record leaves its
 * slot is that sentence's own counter-example.
 */

/**
 * The stages the stylesheet defines rules for.
 *
 * Exported so a test can assert that `chromeStage` never returns something with
 * no rule behind it. An unrecognised attribute value matches no selector and
 * leaves the chrome at its default — silent, exactly like the two no-ops unit
 * 10 found.
 */
export const CHROME_STAGES = ['settling', 'returning'] as const;

export type ChromeStage = (typeof CHROME_STAGES)[number];

/**
 * There is no separate "rising" stage, and the absence is deliberate.
 *
 * The record's own rise is driven by the FLIP inversion applied before paint
 * and cleared on the next frame (unit 10) — the element mounts already
 * inverted, so the chrome's *entry* transition is simply its from-state playing
 * out on mount. A third stage would need JavaScript to decide when "rising"
 * became "settled", which is a coordinator by another name and the thing this
 * design refuses. The stylesheet expresses entry as a starting style instead,
 * which the browser owns end to end.
 */
export function chromeStage({ returning }: { returning: boolean }): ChromeStage {
  return returning ? 'returning' : 'settling';
}
