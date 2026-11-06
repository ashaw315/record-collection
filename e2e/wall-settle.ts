import { expect, type Page } from '@playwright/test';

/** The wall's own count of landings consumed (`WallLive.tsx`, "Counted so the ordering can be asserted"). */
export const landings = (page: Page) => page.evaluate(() => (window as unknown as { __landings?: number }).__landings ?? 0);

/** The view the last consumed landing wrote, with the count it belongs to (`WallLive.tsx`, `recordLandingWrite`), or null before any. */
export type LandingWrite = { left: number; top: number; landings: number; scrollWidth: number; clientWidth: number; seats: number };
export const landingWrite = (page: Page) => page.evaluate(() => (window as unknown as { __landingWrite?: LandingWrite }).__landingWrite ?? null);

/**
 * The landing SETTLED, held on the thing and not on a stand-in for it (Q45,
 * the coordinator, 6 Nov): the pending landing consumed (`__landings` has
 * reached what the caller expects), the region's own mark of that, the
 * landing's write recorded for that count, and the region's scroll AT that
 * write. When the scroll is not the write the wait fails naming both, so
 * the failure says whether the write itself was wrong (the view is where
 * the product put it and the geometry is still off) or something moved the
 * view after it.
 *
 * Until 6 Nov the third condition was three quiet animation frames of
 * scroll and extent, which replaced fixed waits of 900 and 250ms (27 Oct)
 * and was itself a clock in another coat: on run 42243942847 it returned on
 * a landing a row off (wall-route:162) and on a wall that no longer fit
 * (:213), and nothing in it could say which side was wrong. The count and
 * the mark are the product's "consumed"; the write is its "where".
 *
 * Held here since 5 Nov, when wall-arrival-104:120 flaked at four workers on
 * the same defect as wall-route: one wait for the one fact, in both files.
 */
export async function settled(page: Page, landed: number) {
  await expect.poll(() => landings(page), { timeout: 15_000, message: `the landing is consumed (${landed})` }).toBeGreaterThanOrEqual(landed);
  /* The region's own mark of the same fact, which clickSpine waits on (28 Oct): held here where the count is also known. */
  await expect(page.locator('[data-wall-container][data-landed="true"]').first()).toBeAttached();
  await expect.poll(async () => (await landingWrite(page))?.landings ?? -1, { timeout: 15_000, message: `the landing's write is recorded for landing ${landed} (WallLive.tsx, recordLandingWrite)` }).toBeGreaterThanOrEqual(landed);
  const write = await landingWrite(page);
  if (write === null) throw new Error('the landing’s write is not recorded');
  const now = await page.evaluate(() => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
    return el === null ? null : { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, seats: el.querySelectorAll('[data-seat]').length };
  });
  if (now === null || now.left !== write.left || now.top !== write.top) {
    /*
      Both frames named, the write's and the read's, since run 42268956664 said "329 then 307" and could not say
      which moved: a content width that fell with the seat count is the collection changing under the wall
      (§W.12 sizes the wall by the whole collection, which every other worker seeds into and cleans out of);
      a region that widened is the window; both unchanged is the write made against another frame.
    */
    const frame = (f: { scrollWidth: number; clientWidth: number; seats: number }) => `content ${f.scrollWidth}, region ${f.clientWidth}, seats ${f.seats}`;
    throw new Error(`the region’s scroll (${now === null ? 'no region' : `${now.left}, ${now.top}`}) is not the landing’s write (${write.left}, ${write.top}) for landing ${write.landings}: at the write ${frame(write)}; at this read ${now === null ? 'no region' : frame(now)}`);
  }
}
