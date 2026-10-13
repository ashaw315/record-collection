/**
 * The samples down a row: its top plus 0, 1, … height − 1, whole pixels from
 * the row's own top with nothing added. One place for a convention that was
 * re-derived wrongly three times in one test and then found in a second
 * (stats, steps 138 and 141), so the next test that measures a row's height
 * gets it for free.
 *
 * Measured (13 Oct, stats, by a probe): the browser reads a point as the
 * one-pixel square below and right of it. With a row boundary at 637.5, a
 * point at 636.5 reached the upper row and one at 636.75 the lower; with a
 * boundary at 444, a point at 443.25 reached the lower. So a sample a
 * quarter above a row's foot belongs to the next row whatever is built,
 * wherever that row has something positioned across its width, and a
 * sampling that adds a quarter reads 43 of 44 on a row of exactly 44.
 * Squares at top + 0, 1, … 43 tile a row of 44 exactly, on a whole pixel
 * or a half. The half, if the top has one, is kept: it is the row's.
 *
 * No Playwright import, so `test/repo/row-samples.test.ts` holds it from
 * the unit suite; it is passed into a page's `evaluate` as data.
 */
export function rowSamples(top: number, height = 44): number[] {
  return Array.from({ length: Math.max(0, Math.floor(height)) }, (_, dy) => top + dy);
}
