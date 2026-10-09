import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * §W.32: a set filter "takes the rail's own set-mark: the short ink bar
 * UNDER the label that §W.13 gives the active view name". §W.36: "drawn
 * against the label's baseline and occupies no height".
 *
 * Found in a capture on 9 Oct: with a genre set, the bar was drawn 4 below
 * the top of the GENRE label's type, across it. The unit test that names
 * this ("gives a set filter's bar the same treatment") asserts only that
 * the bar is positioned, which is true of a bar drawn anywhere.
 */
test.beforeEach(async ({ page }) => login(page));

/* Fails against a bar placed from the label's foot by a negative margin: 176 to 178 inside type that runs 172.5 to 186.5. */
test('a set genre’s bar is under the GENRE label, as far below it as the current view’s bar is below its name, and moves nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#rail-genre').waitFor({ timeout: 30_000 });
  const tops = () => page.evaluate(() => ['label[for="rail-genre"]', '#rail-genre', '#rail-sort', 'ul[aria-label="View"]'].map((q) => Math.round(((document.querySelector(q) as HTMLElement | null)?.getBoundingClientRect().top ?? -1) * 10) / 10));
  const unset = await tops();
  const id = await page.locator('#rail-genre option').nth(1).getAttribute('value');
  await page.goto(`/?genreId=${id}`);
  await page.locator('[data-set-bar]').waitFor({ timeout: 30_000 });

  const m = await page.evaluate(() => {
    const text = (el: Element) => { const range = document.createRange(); range.selectNodeContents(el); const b = range.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left }; };
    const box = (el: Element) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, width: b.width, height: b.height }; };
    const label = document.querySelector('label[for="rail-genre"]') as HTMLElement;
    /* The label's own type, not the bar inside it. */
    const labelText = Array.from(label.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text;
    const range = document.createRange(); range.selectNodeContents(labelText); const lt = range.getBoundingClientRect();
    const current = Array.from(document.querySelectorAll('ul[aria-label="View"] a')).find((a) => a.getAttribute('aria-current') === 'page') as HTMLElement;
    return { label: { top: lt.top, bottom: lt.bottom, left: lt.left }, bar: box(document.querySelector('[data-set-bar]') as HTMLElement), view: text(current), viewBar: box(document.querySelector('[data-current-bar]') as HTMLElement) };
  });
  expect(m.bar.top, `under the label’s type (${m.label.top} to ${m.label.bottom}), not across it`).toBeGreaterThanOrEqual(m.label.bottom);
  expect(m.bar.top - m.label.bottom, 'as far below it as the current view’s bar is below its name').toBeCloseTo(m.viewBar.top - m.view.bottom, 0);
  expect(m.bar.left, 'at the label’s left').toBeCloseTo(m.label.left, 0);
  expect({ width: m.bar.width, height: m.bar.height }).toEqual({ width: 44, height: 2 });
  expect(await tops(), 'and setting it moved nothing in the rail').toEqual(unset);
});
