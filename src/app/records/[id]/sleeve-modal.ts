/**
 * The record modal's measures (§M.1, §M.4, §M.6), kept apart from the
 * component so the sleeve's size is a function of the viewport that a test
 * can state.
 */

/** §M.1: "Its top row is 53, like the header's". */
export const MODAL_ROW = 53;
/** §M.1, §M.4: "an 18 inset". */
export const MODAL_INSET = 18;
/** §9.3 by §M.6: "44 tall". */
export const MODAL_CONTROL = 44;
/** §M.6: controls are "24 apart". */
export const MODAL_CONTROL_GAP = 24;
/**
 * Not ruled, proposed by the build: the face label's line, and the gap
 * that sets it between the sleeve and the controls. §M.5 gives the label
 * its type (11px) and its place ("beneath the sleeve"), and no distances.
 */
export const MODAL_LABEL_LINE = 11;
export const MODAL_LABEL_GAP = 12;

/** Everything in the column below the top row that is not the sleeve. */
export const SLEEVE_STACK_BELOW = MODAL_INSET + MODAL_LABEL_GAP + MODAL_LABEL_LINE + MODAL_LABEL_GAP + MODAL_CONTROL + MODAL_INSET;

/**
 * §M.4: "the largest square that fits the space below the top row, less
 * the controls' row and an 18 inset." From the viewport and nothing of the
 * record, so it is "the same size on every record at a given viewport".
 */
export function sleeveSquare(viewportWidth: number, viewportHeight: number): number {
  const wide = viewportWidth - 2 * MODAL_INSET;
  const tall = viewportHeight - MODAL_ROW - SLEEVE_STACK_BELOW;
  return Math.max(0, Math.floor(Math.min(wide, tall)));
}

export type SleeveFace = 'front' | 'back';
