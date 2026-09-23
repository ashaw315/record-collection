/**
 * **Ink is one token, as paper is (§W.5).** `oklch(0.19 0.008 60)` is the
 * page's ink — every rule at full weight, every label at full ink, the two
 * fixed-ink marks — and the ladder's shade step is derived TOWARD it (§5.5:
 * "shade at 26% toward ink"). Deriving toward black instead put every shade
 * face about 0.05 darker than the drawings, which is the defect §25's stated
 * 0.535 (against the build's 0.488 for the same base) made visible.
 */
export const INK = { L: 0.19, C: 0.008, h: 60 } as const;
export const INK_CSS = `oklch(${INK.L} ${INK.C} ${INK.h})`;
