import { expect, test, type Page } from '@playwright/test';

/**
 * 8a §2.1's no-scroll budget, measured in a browser rather than declared.
 *
 * **The unit tests pin the arithmetic and cannot see a border.** 53 + 500 + 300
 * + 47 = 900 is true of the constants whatever the CSS does; the design's own
 * fix found the identity band's rule rendering OUTSIDE its declared 500px, so
 * the sum was right and the rendering was not. With no slack in 900px that is a
 * silent overflow — the page scrolls and the claim the layout rests on is gone.
 *
 * So this measures `getBoundingClientRect` and asserts **the total**, because a
 * test that checks each band separately passes while the sum drifts.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const heights = (page: Page) =>
  page.evaluate(() => {
    const of = (band: string) => {
      const el = document.querySelector(`[data-band="${band}"]`);
      return el === null ? null : el.getBoundingClientRect().height;
    };
    const header = document.querySelector('header');
    return {
      nav: header === null ? null : header.getBoundingClientRect().height,
      identity: of('identity'),
      record: of('record'),
      tail: of('tail'),
      documentHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    };
  });

test.describe('the bands render to the height they declare', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('spends exactly 900px, measured rather than summed', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/bands');
    await page.locator('[data-band="identity"]').waitFor({ timeout: 15_000 });

    const m = await heights(page);

    /* Each band first, so a failure names which one moved. */
    expect(m.nav, 'the built AppHeader, which 8a takes 53 from').toBe(53);
    expect(m.identity, 'the identity band, rule included').toBe(500);
    expect(m.record).toBe(300);
    expect(m.tail).toBe(47);

    /*
      **THE assertion.** Borders inside the box, nothing rounding up, nothing
      collapsing: the rendered parts add to the viewport exactly.
    */
    const total = (m.nav ?? 0) + (m.identity ?? 0) + (m.record ?? 0) + (m.tail ?? 0);
    expect(total, '53 + 500 + 300 + 47, as RENDERED').toBe(900);
  });

  test('does not scroll at 1440 × 900', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/bands');
    await page.locator('[data-band="identity"]').waitFor({ timeout: 15_000 });

    const m = await heights(page);

    /*
      The claim in the form a reader would check it: the document is not taller
      than the window. This is what the total is FOR, and it fails on a 1px
      overflow that a per-band assertion would miss.
    */
    expect(m.documentHeight, 'a scrollbar means the budget is overspent').toBeLessThanOrEqual(
      m.viewport,
    );
  });

  /**
   * §2.1: heights are fixed, not content-derived — "an empty module changes
   * nothing about the geometry", which is what makes §6 a question about marks
   * rather than about reflow. The probe renders one short label per cell; a
   * content-derived band would measure differently from the populated case.
   */
  test('holds its height with almost nothing in it', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/bands');
    await page.locator('[data-band="identity"]').waitFor({ timeout: 15_000 });

    const m = await heights(page);

    expect(m.identity, 'fixed, not derived from one label').toBe(500);
    expect(m.record).toBe(300);
  });
});
