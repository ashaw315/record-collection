import { SPINE_HEIGHT } from './geometry';

/**
 * How many characters fit on a spine (SPEC.md §10b).
 *
 * **This constant went through four values, and the only one that holds is the
 * one where every term is named.** The earlier figures were fitted to a
 * rendering and then defended; the divisor in particular was carried as a bare
 * 5.4 with no account of where it came from. A number nobody can re-derive gets
 * re-fitted every time the rendering changes, which is how it reached four
 * values. Every term below is named so that the next change to the face or the
 * inset produces a new derivation rather than a new fit.
 */

/** The label's run along the face: the face less the baseline inset and the end inset, as §11.11 derives it. */
export const BASELINE_INSET_PX = 8;
export const END_INSET_PX = 6;
export const GLYPH_RUN_PX = SPINE_HEIGHT - BASELINE_INSET_PX - END_INSET_PX;

/** Per-character advance of the mono face at the spine's set size, in px — measured, 6.234 in §11.11's render. */
export const GLYPH_ADVANCE_PX = 6.235;

/**
 * Characters that fit: `floor((150 − 14) / 6.235)` = 21 at the drawing's face
 * (§11.11). One rule, and the number follows the face: at 5b's 240 the same
 * rule gave 37 with an 8 inset — the end inset is the drawing's, and the
 * derivation is the thing kept, not the number.
 */
export const SPINE_TEXT_BUDGET = Math.floor(GLYPH_RUN_PX / GLYPH_ADVANCE_PX);

/**
 * The 1:1 label: `Artist · Title`, cut to the budget with an ellipsis.
 *
 * 5b's labels carry artist and title only — the catalogue number is the lit
 * wall's addition, and the drawing does not show it. Truncation keeps the
 * ellipsis inside the budget, so a 37-character result is 36 glyphs and the
 * mark, never 38: "Donna Summer · On The Radio: Greates…" is the drawn case.
 */
export function spineLabel(artist: string, title: string): string {
  const full = `${artist} · ${title}`;
  if ([...full].length <= SPINE_TEXT_BUDGET) return full;

  return `${[...full].slice(0, SPINE_TEXT_BUDGET - 1).join('')}…`;
}

