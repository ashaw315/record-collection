/**
 * **The panels' widths, shared between the components that render them and the
 * breakpoint that reserves room for them (§10b, A32).**
 *
 * Extracted from `Panels.tsx`'s `w-[210px]` / `w-[180px]` so the A32 threshold
 * derives from the same numbers the layout uses. Two producers of one width is
 * exactly how a breakpoint computed against 210 ends up reserving room for a
 * panel that renders at 240 — the drift this project has recorded repeatedly.
 */

export const FACTS_PANEL_WIDTH = 210;
export const ACTIONS_PANEL_WIDTH = 180;
