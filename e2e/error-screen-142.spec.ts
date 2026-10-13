import { expect, test, type Page } from '@playwright/test';
import { POINTERS, expectFloor, pointerIs } from './hit-area';
import { login } from './sign-in';

/**
 * Step 142, Design, 12 Oct: the error screen. "A page that fails draws the
 * app's header and nav, the 40 heading Something went wrong., one sentence
 * in the label colour saying the page could not load, and two §9.3
 * controls: TRY AGAIN, and the way back to the Collection."
 *
 * Read on `/error-probe`, a page that throws while a cookie says so: no
 * real page fails on demand. Fails against the app as it was, which had no
 * error file: a page that threw drew Next's "This page couldn't load", with
 * no header and nothing of the app's.
 */
const INK = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'];
const LABEL_INK = ['lab(35.0433 0.937879 2.8959)', 'oklch(0.44 0.008 70)'];

async function fail(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.context().addCookies([{ name: 'error-probe', value: 'throw', url: new URL(page.url()).origin }]);
  await page.goto('/error-probe');
  await page.getByRole('heading', { level: 1, name: 'Something went wrong.' }).waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

test.beforeEach(async ({ page }) => login(page));

for (const pointer of POINTERS) test.describe(`the error screen under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse' });
  for (const width of [320, 390, 1280]) {
    test(`a page that fails draws the header, the 40 heading, one sentence in the label colour, TRY AGAIN and the way back, at ${width}`, async ({ page }) => {
      expect(await pointerIs(page)).toBe(pointer);
      await fail(page, width);
      await expect(page.locator('[data-app-nav]'), 'the app’s header').toBeVisible();
      const m = await page.evaluate(() => {
        const main = document.querySelector('main') as HTMLElement;
        const h1 = main.querySelector('h1') as HTMLElement;
        const sentence = main.querySelector('p') as HTMLElement;
        const controls = Array.from(main.querySelectorAll<HTMLElement>('button, a')).map((el) => { const cs = getComputedStyle(el); const box = el.getBoundingClientRect(); return { text: (el.textContent ?? '').trim(), tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), size: cs.fontSize, upper: cs.textTransform, mono: /mono/i.test(cs.fontFamily), border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, fill: cs.backgroundColor, colour: cs.color, height: Math.round(box.height), top: Math.round(box.top), right: Math.round(box.right) }; });
        return { heading: { text: h1.textContent, size: getComputedStyle(h1).fontSize, colour: getComputedStyle(h1).color, left: Math.round(h1.getBoundingClientRect().left) }, sentence: { text: (sentence.textContent ?? '').trim(), colour: getComputedStyle(sentence).color, count: main.querySelectorAll('p').length }, controls, figures: main.querySelectorAll('svg, img, [data-tint], [data-head-figure], [data-diagonal]').length, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
      });
      expect(m.heading).toMatchObject({ text: 'Something went wrong.', size: '40px', left: 18 });
      expect(INK, 'the heading is ink').toContain(m.heading.colour);
      expect(m.sentence.count, 'one sentence').toBe(1);
      expect(m.sentence.text, 'which says the page could not load').toMatch(/could not load/i);
      expect(LABEL_INK, 'in the label colour').toContain(m.sentence.colour);
      expect(m.controls.map((c) => [c.text.toUpperCase(), c.tag, c.href]), 'TRY AGAIN, then the way back to the Collection').toEqual([['TRY AGAIN', 'button', null], ['COLLECTION', 'a', '/']]);
      for (const control of m.controls) {
        expect.soft(control, `${control.text}: a §9.3 control`).toMatchObject({ size: '11px', upper: 'uppercase', mono: true, border: '1px', radius: '0px', fill: 'rgba(0, 0, 0, 0)', height: 44 });
        expect.soft(control.right, `${control.text}: inside the window`).toBeLessThanOrEqual(width - 18);
      }
      expect(m.controls[0]?.top, 'the two controls on one line').toBe(m.controls[1]?.top);
      expect(m.figures, 'no ornament and no figure').toBe(0);
      expect(m.scroll, 'the page is the window’s width').toBe(m.client);
      await expectFloor(page, pointer, `the error screen at ${width}`);
    });
  }

  /* Fails against a control that does nothing, or one that reloads into the same failure when its cause has gone. */
  test('TRY AGAIN draws the page once what failed it has gone, and the way back goes to the Collection', async ({ page }) => {
    await fail(page, 390);
    await page.context().clearCookies({ name: 'error-probe' });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-error-probe-recovered]')).toBeVisible({ timeout: 30_000 });

    await fail(page, 390);
    await page.context().clearCookies({ name: 'error-probe' });
    await page.locator('main').getByRole('link', { name: 'Collection' }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 30_000 });
  });

  /* The fallback for a failure of the header itself: the same body on paper, with no header. Read on the probe's stand-in; `global-error.tsx` draws this body and cannot be reached from a browser. */
  test('the bare fallback is the same heading, sentence and controls with no header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/error-probe?bare=1');
    await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong.' })).toBeVisible();
    await expect(page.locator('[data-app-nav]')).toHaveCount(0);
    await expect(page.locator('main').getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/');
    await expect(page.locator('main p')).toHaveCount(1);
  });
});
