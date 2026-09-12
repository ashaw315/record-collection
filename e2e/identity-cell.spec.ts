import { expect, test, type Page } from '@playwright/test';

/**
 * 8a §4.2 — the identity cell's structural guard and its line breaking.
 *
 * **The anchor is the property; the fit is a coincidence.** The 38-character
 * title needs 498 of 500px, and a test asserting that passes on 2px of luck. So
 * these assert what the layout GUARANTEES: the pressing block sits on the cell
 * floor at every title length, so the two blocks cannot push each other.
 *
 * **And the break, because the break is the decision.** §7's clamp is retracted
 * — the fault was an orphaned volume number reading as a rendering error, not
 * the title's length. `text-wrap: balance` is a rendering behaviour rather than
 * a guarantee, so what it actually does is measured here rather than trusted.
 *
 * **The hard case is one real record, which is what makes four cases worth
 * asserting.** Measured across the collection: 8 titles take one line, 6 take
 * two, 2 take three, and 1 takes five. That one is
 * `On The Radio: Greatest Hits Vol. 1 & 2` — and it is the same record that is
 * worst on every other axis: no price history, six absent fields, the most
 * chromatic cover. So the five-line case is not a hypothetical stress test, it
 * is a record in the collection, and the anchor has to hold on it.
 *
 * **Measured, not assumed — and the fallback is worse-looking but still
 * correct.** With `balance`, the five lines measure
 * [235, 206, 283, 270, 141]; with it forced off, [235, 206, 283, 365, 43] —
 * the 43px orphan. Same height either way, so where the property is
 * unsupported the title looks worse and nothing overflows. That is the right
 * shape for a rendering behaviour that cannot be guaranteed, and it is asserted
 * in the last test rather than hoped for.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const CASES = ['one', 'two', 'three', 'five'] as const;

const measure = (page: Page) =>
  page.evaluate(() => {
    const read = (id: string) => {
      const cell = document.querySelector(`[data-case="${id}"]`);
      if (cell === null) return null;
      const title = cell.querySelector('[data-field="title"]');
      const pressing = cell.querySelector('[data-block="pressing"]');
      if (title === null || pressing === null) return null;

      const cellBox = cell.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const pressingBox = pressing.getBoundingClientRect();

      /* Line boxes, so the BREAK can be asserted rather than inferred. */
      const range = document.createRange();
      range.selectNodeContents(title);
      const lines = [...range.getClientRects()]
        .filter((r) => r.width > 0)
        .map((r) => Math.round(r.width));

      return {
        cellBottom: Math.round(cellBox.bottom),
        cellTop: Math.round(cellBox.top),
        titleTop: Math.round(titleBox.top),
        titleHeight: Math.round(titleBox.height),
        pressingBottom: Math.round(pressingBox.bottom),
        lineWidths: lines,
        overflows: cellBox.height < cell.scrollHeight,
      };
    };
    return { one: read('one'), two: read('two'), three: read('three'), five: read('five') };
  });

test.describe('the identity cell (§4.2)', () => {
  test.use({ viewport: { width: 2200, height: 900 } });

  /**
   * **THE assertion.** The pressing block's bottom edge sits at the cell floor
   * at every title length — one line and five. A test that measures 498 against
   * 500 passes on a coincidence; this passes on the property.
   */
  test('anchors the pressing block to the cell floor at every title length', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);

    for (const id of CASES) {
      const c = m[id];
      expect(c, `${id} rendered`).not.toBeNull();
      if (c === null) continue;

      /* 18px of cell padding below the block. */
      expect(c.cellBottom - c.pressingBottom, `${id}: pressing sits on the floor`).toBe(18);
    }
  });

  test('flows the title from the top so the two blocks cannot meet', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);

    for (const id of CASES) {
      const c = m[id];
      if (c === null) continue;

      expect(c.titleTop - c.cellTop, `${id}: title starts at the top`).toBe(18);
      /* The guard: a growing title spends the gap, never the pressing block. */
      expect(c.overflows, `${id}: nothing overflows the cell`).toBe(false);
    }
  });

  /**
   * **The break is the decision, so the break is what is asserted.** Five lines
   * stay five and are evenly measured: with `balance`, no line is a fraction of
   * the others — the orphaned "2" that read as a rendering error is gone.
   */
  test('balances the five-line title rather than orphaning its last line', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);
    const five = m.five;
    expect(five).not.toBeNull();
    if (five === null) return;

    expect(five.lineWidths.length, 'five lines, unclamped').toBe(5);

    /*
      Evenness, stated as a ratio rather than a pixel count so it survives a
      font metric changing. An orphan is a last line far narrower than the
      widest; balanced lines sit within a fraction of each other.
    */
    const widest = Math.max(...five.lineWidths);
    const last = five.lineWidths[five.lineWidths.length - 1];

    expect(
      last / widest,
      `line widths ${JSON.stringify(five.lineWidths)} — the last must not be an orphan`,
    ).toBeGreaterThan(0.35);
  });

  /**
   * **`balance` degrading safely, known rather than assumed.** Where it is
   * unsupported the property is ignored, the orphan returns, and nothing
   * overflows — acceptable, and asserted so the fallback is a measured state.
   */
  test('does not overflow even with balance disabled', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-field="title"]')) {
        (el as HTMLElement).style.textWrap = 'wrap';
      }
    });

    const m = await measure(page);
    const five = m.five;
    if (five === null) return;

    expect(five.overflows, 'the unbalanced fallback still fits').toBe(false);
  });
});
