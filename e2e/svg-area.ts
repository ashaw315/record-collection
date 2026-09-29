/**
 * **The rendered area of an SVG polygon, from its user-unit area.**
 *
 * Under `preserveAspectRatio="… meet"` the drawing scales UNIFORMLY by the
 * smaller of the two box-to-viewBox ratios, so a unit of area becomes that
 * scale squared. Multiplying the two ratios overstates the area by the slack
 * on the axis that does not bind -- 0.77 points of viewport on one record
 * when this project's §5.5 instrument first did it (29 Sep), and the same
 * product sat in `colour-distribution.spec.ts` from the start.
 *
 * Self-contained: the specs ship this function's SOURCE into the page.
 */
export function renderedArea(
  unitArea: number,
  box: { width: number; height: number },
  viewBox: { width: number; height: number },
): number {
  const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
  return unitArea * scale * scale;
}
