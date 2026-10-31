import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { clickSpine } from './wall-ready';

/**
 * **§W.18 and §W.20 on screen: with the row below full, only a neighbour at
 * larger x draws over a record leaving the top shelf.** The painter's order put
 * it behind its own shelf and left neighbours, seen by Adam at 43 records on the
 * harness and not at 22. The DOM's order is one layer below that claim, so this
 * reads the stack at each pixel the record occupies, on a frozen clock.
 */
const PER_SHELF = 20;
const over = (page: Page, seat: number, perShelf: number) => page.evaluate(([own, per]) => {
  const out = document.querySelector('[data-pulled]')?.getBoundingClientRect();
  if (out === undefined) return null;
  const wrong: string[] = [];
  let sampled = 0;
  for (let i = 1; i < 24; i += 1) {
    for (let j = 1; j < 24; j += 1) {
      const stack = document.elementsFromPoint(out.x + (out.width * i) / 24, out.y + (out.height * j) / 24);
      const at = stack.findIndex((el) => el.closest('[data-pulled]') !== null);
      if (at < 0) continue;
      sampled += 1;
      for (const el of stack.slice(0, at)) {
        const order = el.closest('a[data-seat]')?.getAttribute('data-seat-order');
        const piece = el.closest('[data-piece]');
        const nearer = order != null ? Number(order) > own && Number(order) <= per : piece === null || el.getAttribute('data-furniture')?.startsWith('upright') === true;
        if (!nearer) wrong.push(order != null ? `seat ${order}` : (piece?.getAttribute('data-piece') ?? 'other'));
      }
    }
  }
  return { sampled, wrong: [...new Set(wrong)] };
}, [seat, perShelf]);

for (const seat of [1, 2, 10]) {
  test(`at 43 records only a neighbour at larger x draws over the record leaving top-shelf seat ${seat}`, async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto('/wall/probe/labelled?count=43');
    const spine = page.locator(`a[data-seat][data-seat-order="${seat}"] [data-spine]`).first();
    await spine.waitFor();
    await spine.scrollIntoViewIfNeeded();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await clickSpine(page, spine);
    await page.addStyleTag({ content: '[data-pulled], [data-pulled] * { pointer-events: auto !important; }' });
    /* Through the window, from the pan's end to the 150 plane: which pixels overlap what changes as the record leaves. */
    let sampled = 0;
    const wrong: string[] = [];
    for (let at = 0; at < 8; at += 1) {
      await page.clock.runFor(at === 0 ? 300 : 100);
      await page.waitForTimeout(80);
      const reading = await over(page, seat, PER_SHELF);
      sampled += reading?.sampled ?? 0;
      wrong.push(...(reading?.wrong ?? []));
    }
    expect(sampled, 'the precondition: the record was out and its pixels were read').toBeGreaterThan(100);
    expect([...new Set(wrong)]).toEqual([]);
  });
}
