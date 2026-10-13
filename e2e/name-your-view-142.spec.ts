import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 142: the sign-in helper makes `querySelector` throw where a selector
 * matches in both of a bare `/`'s views. Staged here, because a guard is not
 * verified by reading it: a reader that names no view is refused, one that
 * names its view is not, and a page with one view is not touched.
 */
test.beforeEach(async ({ page }) => login(page));

const BOTH = 'ul[aria-label="View"]';

test('on a bare /, a querySelector that matches in both views throws and says how to name one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('[data-shelf-offered]').waitFor({ state: 'attached' });
  expect(await page.evaluate((selector) => document.querySelectorAll(selector).length, BOTH), 'the precondition: the selector has a copy in each view').toBe(2);
  /* Fails against a helper that does not wrap: the call returns the shelf's copy and no error. */
  await expect(page.evaluate((selector) => document.querySelector(selector)?.tagName, BOTH)).rejects.toThrow(/name your view/);
  await expect(page.evaluate((selector) => document.body.querySelector(selector)?.tagName, BOTH), 'from an element as from the document').rejects.toThrow(/name your view/);
});

test('a reader that names its view is answered, in either view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('[data-shelf-offered]').waitFor({ state: 'attached' });
  expect(await page.evaluate((selector) => [document.querySelector(`[data-shelf-offered] ${selector}`)?.tagName, document.querySelector(`[data-shelf-fallback] ${selector}`)?.tagName], BOTH)).toEqual(['UL', 'UL']);
  expect(await page.evaluate(() => document.querySelector('main')?.tagName), 'and a selector with one match is not touched').toBe('MAIN');
});

test('a page with one view is not touched: ?view=grid answers the same selector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?view=grid');
  await page.locator('[data-collection-band]').first().waitFor();
  expect(await page.evaluate((selector) => document.querySelector(selector)?.tagName, BOTH)).toBe('UL');
});
