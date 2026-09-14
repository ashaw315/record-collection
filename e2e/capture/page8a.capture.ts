import { test, expect } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

/**
 * **The assembly, on three real records at 1440 × 900.** Every piece so far has
 * been measured in isolation; this is the first view of all of it at once.
 *
 *   CAPTURE=1 npx playwright test --project=capture
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test.use({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT }, deviceScaleFactor: 1 });

test('capture 8a assembled', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');

  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  for (const which of ['richest', 'modal', 'emptiest']) {
    await page.goto(`/wall/probe/page8a?case=${which}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    /*
      **Waits on `naturalWidth`, not on `complete`.** A fixed 900ms sleep
      captured a broken-image marker once; the obvious repair was to wait for
      `img.complete`, and that is a PROXY — it goes true when the browser
      finishes trying, including when it failed. `naturalWidth > 0` is the
      channel that carries "the image decoded", which is the claim.

      Same shape as the three proxy assertions NOTES records: the property was
      about a decoded bitmap and the measurement was about request state.
    */
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-cell="sleeve"] img');
        return img === null || (img as HTMLImageElement).naturalWidth > 0;
      },
      undefined,
      { timeout: 20_000 },
    );

    /* Not fullPage: the claim is that 900px holds it. */
    await page.screenshot({ path: `docs/record-detail/assembled/${which}.png` });

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(overflow.document, `${which}: no scroll at 1440 × 900`).toBeLessThanOrEqual(
      overflow.viewport,
    );
  }
});
