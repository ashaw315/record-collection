import { expect, test } from '@playwright/test';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';

/**
 * **How large the shelf and the record page draw a cover, measured so each asks the optimiser for a width that serves
 * it (23 Nov).** The shelf's pulled face is an SVG image 140 units square scaled by the wall's view, and the record
 * page's cover is a cell's width; neither size is a constant in the source. Reported, not asserted, at the widths Adam
 * uses: the phone's 390, the laptop's 1440 and 1920. Tagged report-only, so the gate's suites do not run it.
 */
test.beforeEach(async ({ page }) => login(page));

for (const width of [390, 1440, 1920]) {
  test(`the drawn sizes at ${width} @report-only`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await wallMeasured(page);
    const seat = page.locator('a[data-seat]').filter({ visible: true }).first();
    let face: number | null = null;
    if ((await seat.count()) > 0) {
      await seat.locator('[data-spine]').first().click();
      const cover = page.locator('svg image[data-cover]').filter({ visible: true }).first();
      await cover.waitFor({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      face = (await cover.boundingBox().catch(() => null))?.width ?? null;
    }
    await page.goto('/?view=grid');
    const href = await page.locator('[data-pick-answer] a, [data-grid-title]').first().getAttribute('href').catch(() => null);
    const link = href ?? (await page.locator('a[href^="/records/"]').first().getAttribute('href'));
    await page.goto(link ?? '/');
    const recordCover = await page.locator('[data-cover]').filter({ visible: true }).first().boundingBox().catch(() => null);
    test.info().annotations.push({ type: 'sizes', description: `${width}: the shelf's pulled face ${face === null ? 'not drawn here' : `${face.toFixed(0)} CSS px`}; the record page's cover ${recordCover === null ? 'not found' : `${recordCover.width.toFixed(0)} CSS px`}` });
    expect(true).toBe(true);
  });
}
