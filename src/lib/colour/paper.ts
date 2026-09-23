/**
 * **Paper is one token (8a §W.5).** The drawing's `oklch(0.925 0.004 80)` is
 * the page's paper and the app paints it: every other value in the system —
 * the 0.72 hairline, the 0.19 ink, the 0.44 label, the ladder's tint step,
 * which is literally a fraction toward paper — was chosen against 0.925, and
 * a ground at 0.985 rescaled all four relationships at once. A contrast ratio
 * is measured on the ground the app paints, so the two numbers have to be
 * one number: this one, named here and restated nowhere. `globals.css`
 * cannot import it, so `test/repo/paper-token.test.ts` holds the stylesheet
 * to it.
 */
export const PAPER = { L: 0.925, C: 0.004, h: 80 } as const;
export const PAPER_CSS = `oklch(${PAPER.L} ${PAPER.C} ${PAPER.h})`;
