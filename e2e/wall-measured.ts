import { expect, type Page } from '@playwright/test';

/**
 * **Waits until the wall has measured its viewport.**
 *
 * The server cannot measure a viewport, so its markup carries both the near
 * and the far region and the stylesheet shows one (§W.26, §W.29). Until the
 * client measures, the page holds two fixtures, and the wall's container
 * says so with `data-unmeasured`. That attribute's absence is the page's own
 * settled signal.
 *
 * A test that reads what the client computes waits for this, and never for
 * something the server's markup already satisfies: the wall being attached
 * and the count's text are both true before any script has run. A test that
 * waited on those counted 12 pieces for 6 on a slow machine (8 Oct).
 */
export async function wallMeasured(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('[data-wall-container]:not([data-unmeasured])'), 'the wall has measured its viewport').toHaveCount(1, { timeout });
}
