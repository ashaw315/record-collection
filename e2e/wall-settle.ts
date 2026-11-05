import { expect, type Page } from '@playwright/test';

/** The wall's own count of landings consumed (`WallLive.tsx`, "Counted so the ordering can be asserted"). */
export const landings = (page: Page) => page.evaluate(() => (window as unknown as { __landings?: number }).__landings ?? 0);

/**
 * The landing SETTLED, by condition rather than clock: the pending landing
 * consumed (`__landings` has reached what the caller expects), and then the
 * region's scroll and extent unchanged over three animation frames, since
 * the frame grows once the region is measured and the write lands on that
 * frame. Fixed waits of 900 and 250ms flaked under load three times, read
 * each time with the load named (27 Oct): load was the trigger, the fixed
 * wait the defect.
 *
 * Held here rather than in `wall-route.spec.ts` since 5 Nov, when
 * `wall-arrival-104.spec.ts:120` flaked at four workers on CI on the same
 * defect: a 900ms clock after clearing a search, read 1.73s after an Enter
 * that itself took 1.73s under load, with the landing not yet consumed. One
 * wait for the one fact, in both files.
 */
export async function settled(page: Page, landed: number) {
  await expect.poll(() => landings(page), { timeout: 15_000, message: `the landing is consumed (${landed})` }).toBeGreaterThanOrEqual(landed);
  /* The region's own mark of the same fact, which clickSpine waits on (28 Oct): held here where the count is also known. */
  await expect(page.locator('[data-wall-container][data-landed="true"]').first()).toBeAttached();
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
        if (el === null) return resolve(false);
        const read = () => `${el.scrollLeft},${el.scrollTop},${el.scrollWidth},${el.scrollHeight},${el.clientWidth}`;
        const first = read();
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (read() !== first) return resolve(false);
          if (frames >= 3) return resolve(true);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    undefined,
    { timeout: 15_000 },
  );
}
