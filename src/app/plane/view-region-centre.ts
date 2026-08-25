/**
 * Where a pulled record is aimed, in CANVAS pixels.
 *
 * **Two heights, and aiming at the wrong one is the bug this exists to fix.**
 * `WallScene` sizes its render surface `max(layout.height, viewportFloor)` so a
 * short collection reads as wall rather than as empty shelves. The WALL CONTENT
 * still ends at `layout.height`; everything below is padding. Those two numbers
 * are equal for any collection tall enough to fill the viewport, which is why
 * this went unnoticed — every test and every QA pass ran against 125 records.
 * With four, the surface is padded and the record was aimed at the centre of
 * the padded slice: 195px below the shelf on desktop, 107px on a phone, into
 * black.
 *
 * §10b: the record comes off the shelf, so when the wall is one row at the top
 * of a tall canvas the record belongs over that row.
 *
 * **But the content centre is only right when the wall is short.** On a real
 * collection the wall is thousands of pixels tall and scrolls, and the record
 * must follow the READER — the content centre would be far off-screen. So the
 * aim is the visible region's centre, CLAMPED into the wall content. When the
 * wall is taller than the view the clamp does nothing and the old behaviour
 * stands; when it is shorter the clamp pulls the record back onto the shelf.
 */
export function viewRegionCentre({
  wallContentHeight,
  sceneHeight,
  canvasDocTop,
  scrollY,
  viewportHeight,
  halfSleevePx,
}: {
  /** `layout.height` — where the shelves actually stop. */
  wallContentHeight: number;
  /** The render surface, `max(layout.height, viewportFloor)`. */
  sceneHeight: number;
  canvasDocTop: number;
  scrollY: number;
  viewportHeight: number;
  /** The pulled record's half-height on screen, in canvas pixels. */
  halfSleevePx: number;
}): number {
  /* The visible slice of the canvas, in page coordinates. */
  const regionTop = Math.max(canvasDocTop, scrollY);
  const regionBottom = Math.min(canvasDocTop + sceneHeight, scrollY + viewportHeight);

  /*
    Both bounds in CANVAS coordinates, and intersected with the wall content.
    `min(..., wallContentHeight)` is the whole fix: it is a no-op whenever the
    wall reaches past the fold, and on a short wall it discards the padding the
    record was being aimed into.
  */
  const visibleTop = Math.max(0, regionTop - canvasDocTop);
  const visibleBottom = Math.min(regionBottom - canvasDocTop, wallContentHeight);

  const centre = (visibleTop + visibleBottom) / 2;

  /*
    Keep the whole sleeve inside that band. When the band cannot hold it —
    a one-row wall is 248px and a settled sleeve is taller — the clamp collapses
    to the band's own centre, spreading the overflow across both edges rather
    than pinning it to one. That collapse is the original defect's fix and is
    preserved deliberately: pinning made the clipping read as "runs off the top"
    instead of "slightly too big".
  */
  const lowest = visibleTop + halfSleevePx;
  const highest = visibleBottom - halfSleevePx;

  return lowest > highest ? centre : Math.min(Math.max(centre, lowest), highest);
}
