import { expect, test } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { eachScreen, seedFixture } from './screens-103';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 103c, §T.6: "Every screen's heading is 40, the record form's
 * included, where the survey found 20, so the heading's air is one shape
 * wherever it appears. §T.2's ladder already sets 40 for a heading."
 */
test.beforeEach(async ({ page }) => login(page));

for (const width of [390, GRID_FORK]) {
  /* Fails against the record form, new and editing, whose heading is 20. */
  test(`at ${width}: each screen has one heading, and it is 40`, async ({ page }) => {
    const f = await seedFixture(page, 'Heading103');
    await eachScreen(page, f, width, async (name) => {
      const sizes = await page.locator('h1').evaluateAll((all) => all.map((h) => getComputedStyle(h).fontSize));
      expect.soft(sizes, `${name}: its h1`).toEqual(['40px']);
    });
  });
}
