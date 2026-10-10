import { expect, test } from '@playwright/test';
import { clearing, firstDrawingWidth } from '../src/app/figure-source';
import { login } from './sign-in';

/**
 * Step 115, §T.6: "The source record is the one whose figure first draws at
 * the narrowest window." The rule itself is held on staged shapes in
 * `figure-source.test.ts`; this holds that the screen draws from the record
 * the rule names, and says which record that is, so a change of shape or
 * tint across every figure is a named record's and not from nowhere.
 *
 * Other specs' records are on the same collection while this runs, and the
 * table shows one page of it, so the source is checked against every record
 * the page lists and not against a set this spec fixes.
 */
test('the head figure names its source record and the window it first draws at, and no listed record first draws narrower', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  const r = await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>('[data-head-figure]');
    const ids = Array.from(document.querySelectorAll<HTMLAnchorElement>('main [data-collection-table] a[href]')).map((a) => (a.getAttribute('href') ?? '').split('/').pop() ?? '').filter((id) => /^[0-9a-f-]{36}$/.test(id));
    return { record: head?.dataset.record ?? '', firstDraws: Number(head?.dataset.firstDraws), still: head?.querySelector('[data-testid="construction-still"]')?.getAttribute('data-record') ?? '', ids: [...new Set(ids)] };
  });
  expect(r.ids.length, 'the precondition: the table lists records').toBeGreaterThan(5);
  expect(r.record, 'the head figure names a record').toMatch(/^[0-9a-f-]{36}$/);
  expect(r.still, 'and the construction drawn is that record’s').toBe(r.record);
  /* Fails against a figure that does not say where it first draws, and against one that says another record's width. */
  expect(r.firstDraws, 'the window it says it first draws at is its own').toBeCloseTo(firstDrawingWidth(clearing(r.record)), 3);
  const narrower = r.ids.map((id) => ({ id, firstDraws: firstDrawingWidth(clearing(id)) })).filter((x) => x.firstDraws < r.firstDraws - 0.001);
  /* Fails against a source chosen any other way wherever a listed record first draws narrower: the smallest clearing height, the newest, the page's first. */
  expect(narrower, `the source is ${r.record}, first drawing at ${r.firstDraws.toFixed(1)}; these listed records first draw narrower and should have been it`).toEqual([]);
});
