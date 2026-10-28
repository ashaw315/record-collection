import { expect, type Locator, type Page } from '@playwright/test';

/**
 * **A seat is clicked only when the wall is hydrated and landed (28 Oct).**
 *
 * The wall-route Escape test flaked in two consecutive gates on the same
 * failure: after the first spine's click, no pull began. Its own retained
 * trace says why: the click's input was dispatched on a snapshot where the
 * region had no `data-hydrated`, and the call returned 160ms later on one
 * that had it; no record-page request followed and no pull began. React's
 * root listener was attached, so the anchor did not navigate, and the wall's
 * subtree was not yet hydrated, so React blocked the discrete event and did
 * not replay it. The test had waited for the labelled wall to be visible,
 * which is the server's markup, and clicked 80ms later. Six probes could
 * not hold that window open from outside the page (NOTES, 28 Oct, 18:45),
 * so the evidence is the trace's, not a reproduction's.
 *
 * So this is the one way a spec clicks a spine, and `test/repo/
 * spine-click-helper.test.ts` refuses a spec that clicks one any other way.
 * It waits for the region's two marks: `data-hydrated`, set by `WallLive`
 * once React has attached and the region hears the person, and
 * `data-landed`, set by the commit that consumes a pending landing or finds
 * none pending on a frame that is the region's own. The landing is a visual
 * no-op by design and cannot race a click; its mark is harmless and real.
 * Marks, not animation frames: the gesture specs freeze the page's clock,
 * and a wait on frames never returned under it (the first draft, 18 tests).
 * The landing's count stays the caller's to assert where the route lands.
 */
export async function wallAtRest(page: Page): Promise<void> {
  await expect(page.locator('[data-region="wall"][data-hydrated="true"][data-landed="true"]'), 'the wall is hydrated and landed').toHaveCount(1, { timeout: 30_000 });
}

/** The spine's click, after the wall is at rest. `spine` is the caller's locator for the spine or its seat. */
export async function clickSpine(page: Page, spine: Locator): Promise<void> {
  await wallAtRest(page);
  await spine.click();
}
