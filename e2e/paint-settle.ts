/**
 * **When has the §43 recorder seen the layout settle?**
 *
 * The recorder (`record-band-43.spec.ts`) samples the band's height and every
 * cell's box on each animation frame from before the page's first script.
 * §43's claim is that the FIRST frame equals the SETTLED one, so the test only
 * needs to know when "settled" has arrived: once the last `span` frames are
 * identical, nothing in the window has moved for `span` frames and the tail
 * is the settled layout.
 *
 * A fixed two-second wait was the previous answer; on 119 cold loads it was
 * four of the test's six minutes, against layouts that the recorder shows
 * settled inside half a second. Timestamps are ignored: they always differ.
 *
 * Self-contained on purpose: the spec ships this function's SOURCE into the
 * page, so it may reference nothing outside its own body.
 */
export type PaintFrame = { t: number; band: number; cells: Array<[string, number, number, number, number]> };

export function isSettled(frames: PaintFrame[], span: number): boolean {
  if (frames.length < span) return false;
  const key = (f: PaintFrame) => f.band + '|' + f.cells.map((c) => c.join(',')).join(';');
  const tail = key(frames[frames.length - 1]);
  for (let i = frames.length - span; i < frames.length - 1; i++) {
    if (key(frames[i]) !== tail) return false;
  }
  return true;
}
