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

/** The pulled record's glyph run: 232px wide, less the 8px baseline inset. */
export const GLYPH_RUN_PX = 232 - 8;

/** Per-character advance of the mono face at the spine's set size, in px. */
export const GLYPH_ADVANCE_PX = 6.235;

/**
 * Characters that fit: `floor(232 / 6.235)` = 37.
 *
 * **The divisor is applied to the full 232, not to the 224 run.** The longest
 * label at this budget sets 230.695px — a 1.3px margin, which is the whole of
 * the slack. A 38th character would need 236.93px and overrun by 4.93px.
 */
export const SPINE_TEXT_BUDGET = 37;

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

