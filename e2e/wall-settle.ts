import { expect, test, type Page } from '@playwright/test';

/** The wall's own count of landings consumed (`WallLive.tsx`, "Counted so the ordering can be asserted"). */
export const landings = (page: Page) => page.evaluate(() => (window as unknown as { __landings?: number }).__landings ?? 0);

/** The view the last consumed landing wrote, the seat it was written for, and the count it belongs to (`WallLive.tsx`, `recordLandingWrite`), or null before any. */
export type LandingWrite = { left: number; top: number; seat: string; landings: number; scrollWidth: number; clientWidth: number; seats: number };
export const landingWrite = (page: Page) => page.evaluate(() => (window as unknown as { __landingWrite?: LandingWrite }).__landingWrite ?? null);

/**
 * The landing SETTLED, held on the thing and not on a stand-in for it (Q45,
 * the coordinator, 6 Nov): the pending landing consumed (`__landings` has
 * reached what the caller expects), the region's own mark of that, the
 * landing's write recorded for that count. The region's scroll against that
 * write is read and NAMED, with both frames, and not held: the wait returns
 * it as `moved` and attaches it to the test as a `landing-moved` annotation,
 * so a report shows it beside a green test.
 *
 * Why named and not held (the coordinator's question, 6 Nov: what does the
 * at-the-write claim catch that the product does not already guarantee?).
 * Every write is the scroller's clamped value read back, and every later
 * landing is counted; the one mover left is the scroller re-clamping when
 * the wall's extent changes under the view, which §W.12 makes the whole
 * collection's and every other worker's, and which is not a defect. The
 * equality held nothing else, and it flaked twice on exactly that mover
 * with the same frames (runs 42292989122 and 42309967002, wall-settle:61:
 * content 1267 at the write and 1179 at the read, 240 seats both, the
 * scroll 395 then 307, the scroller's limit at each frame). So it is a
 * diagnostic: when a landing's geometry is wrong the frames still say
 * whether the write or a later move put the view where it is.
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
/** A token written into the document before an action, so the wait can say which document it landed in. */
export type DocumentMark = { token: string };
export async function markDocument(page: Page): Promise<DocumentMark> {
  const token = `${Date.now()}-${Math.random()}`;
  await page.evaluate((t) => { (window as unknown as { __settleDoc?: string }).__settleDoc = t; }, token);
  return { token };
}
export type DocumentOption = { same: DocumentMark } | { after: DocumentMark };

/* The document's mark, or undefined while no document answers (mid-navigation, a destroyed context). */
const markIn = (page: Page) => page.evaluate(() => (window as unknown as { __settleDoc?: string }).__settleDoc ?? null).catch(() => undefined);

/* Whether the document still carries the mark, once a document answers. */
async function stillMarked(page: Page, mark: DocumentMark): Promise<boolean> {
  for (let i = 0; i < 50; i += 1) {
    const found = await markIn(page);
    if (found !== undefined) return found === mark.token;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * **Which document the landing is in, stated by every caller (the coordinator,
 * 7 Nov).** The count and the write live in the window, and a new document
 * starts them afresh, so before this the wait caught two classes and named
 * neither: a document REPLACED under a same-document wait (the zoom's RSC
 * fetch failing, when Next loads the `?shelf=` URL whole and the new page's
 * own landing satisfies the count), and a navigating wait satisfied by the
 * page it was LEAVING, whose landing had already been counted. The caller
 * marks the document before its action (`markDocument`) and says `same` or
 * `after`; the option is required, so no caller is silent by default.
 * `e2e/wall-settle.spec.ts` stages both arms.
 */
export async function settled(page: Page, landed: number, document: DocumentOption): Promise<{ write: LandingWrite; moved: string | null }> {
  if ('after' in document) {
    const mark = document.after;
    await expect
      .poll(async () => { const found = await markIn(page); return found !== undefined && found !== mark.token; }, { timeout: 15_000, message: 'the navigation has not committed: the document is still the one marked before the action' })
      .toBe(true);
    return land(page, landed);
  }
  const replaced = new Error('the document was replaced between the mark and the landing: the landing read is the new page’s, not the one the action was taken in');
  let result: Awaited<ReturnType<typeof land>>;
  try {
    result = await land(page, landed);
  } catch (error) {
    if (!(await stillMarked(page, document.same))) throw replaced;
    throw error;
  }
  if (!(await stillMarked(page, document.same))) throw replaced;
  return result;
}

async function land(page: Page, landed: number): Promise<{ write: LandingWrite; moved: string | null }> {
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
    const moved = `the region’s scroll (${now === null ? 'no region' : `${now.left}, ${now.top}`}) is not the landing’s write (${write.left}, ${write.top}) for landing ${write.landings}: at the write ${frame(write)}; at this read ${now === null ? 'no region' : frame(now)}`;
    test.info().annotations.push({ type: 'landing-moved', description: moved });
    return { write, moved };
  }
  return { write, moved: null };
}
