import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * **What the layout does at widths 8a did not specify.**
 *
 * 8a is drawn at 1440 × 900 and its no-scroll budget is stated for that frame.
 * Nothing in it says what happens above 1440 — so if the grid stretches, most
 * desktop users see a composition nobody designed.
 *
 * Captures 1440 and a spread of common wider widths, and measures what moves.
 *
 *   CAPTURE=1 npx playwright test --project=capture
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** 1440 is the specified frame; the rest are real displays. */
const WIDTHS = [1440, 1512, 1680, 1728, 1920, 2560] as const;

test('capture the page at the specified width and wider', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');

  const report: string[] = [
    'What the record detail does at each width, on the modal record.',
    '8a specifies 1440 × 900 and says nothing above it.',
    '',
    'width   page    doc-h  scroll  cover-overflow  tail   year-cell  sleeve-cell',
  ];

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto('/login');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    await page.getByLabel('Password').pressSequentially(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/wall/probe/page8a?case=modal');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-cell="sleeve"] img');
        return img === null || (img as HTMLImageElement).naturalWidth > 0;
      },
      undefined,
      { timeout: 20_000 },
    );

    const m = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        return el === null ? null : el.getBoundingClientRect();
      };
      const page8a = box('[data-testid="record-page-8a"]');
      const sleeve = box('[data-cell="sleeve"]');
      const year = box('[data-cell="year"]');
      const tail = box('[data-band="tail"]');
      const img = document.querySelector('[data-cell="sleeve"] img');
      const imgBox = img === null ? null : img.getBoundingClientRect();

      return {
        pageWidth: Math.round(page8a?.width ?? 0),
        docHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        /* Does the cover paint past the viewport's right edge? */
        coverOverflow: Math.round((imgBox?.right ?? 0) - window.innerWidth),
        tailHeight: Math.round(tail?.height ?? 0),
        yearWidth: Math.round(year?.width ?? 0),
        sleeveWidth: Math.round(sleeve?.width ?? 0),
      };
    });

    report.push(
      `${String(width).padEnd(7)} ${String(m.pageWidth).padEnd(7)} ${String(m.docHeight).padEnd(6)} ` +
        `${m.docHeight > m.viewportHeight ? 'YES ' : 'no  '}   ` +
        `${String(m.coverOverflow > 0 ? `+${m.coverOverflow}px` : 'none').padEnd(15)} ` +
        `${String(m.tailHeight).padEnd(6)} ${String(m.yearWidth).padEnd(10)} ${m.sleeveWidth}`,
    );

    await page.screenshot({ path: `docs/record-detail/widths/modal-${width}.png` });
    await context.close();
  }

  writeFileSync('docs/record-detail/widths/measurements.txt', report.join('\n'));
});
