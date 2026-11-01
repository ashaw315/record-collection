import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { clickSpine } from './wall-ready';

/**
 * **§W.18 on screen: nothing is drawn over the part of a record past the row's
 * front.** The spine is past that plane from the record's first travel, so it
 * is the part that can be read in a browser with no sum: at every pixel of it,
 * on every shelf, leaving and going back, the record is on top. The old axis
 * order cut it to a fragment behind the row below, which is what Adam saw.
 * The board covering the part still under it is right, and is not read here;
 * `paint-per-point.test.ts` holds that half.
 */
const PER_SHELF = 20;
/* Seat orders fill the top shelf first: the shelf is read off the order, so a test's name cannot drift from its seat. */
const shelfOf = (seat: number) => Math.ceil(seat / PER_SHELF);

const overSpine = (page: Page) => page.evaluate(() => {
  const face = document.querySelector<SVGPolygonElement>('[data-pulled] [data-face="front"]');
  const ctm = face?.getScreenCTM();
  if (!face || !ctm) return null;
  const c = [...face.points].map((p) => new DOMPoint(p.x, p.y).matrixTransform(ctm));
  const mix = (a: DOMPoint, b: DOMPoint, t: number) => [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
  const wrong: string[] = [];
  let read = 0;
  for (const u of [0.2, 0.5, 0.8]) {
    for (let k = 1; k < 12; k += 1) {
      const [x0, y0] = mix(c[0], c[1], u);
      const [x1, y1] = mix(c[3], c[2], u);
      const t = k / 12;
      const on = document.elementFromPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (on === null) continue;
      read += 1;
      if (on.closest('[data-pulled]') === null) wrong.push(on.closest('a[data-seat]')?.getAttribute('data-seat-order') ?? on.closest('[data-piece]')?.getAttribute('data-piece') ?? on.tagName);
    }
  }
  return { read, wrong: [...new Set(wrong)] };
});

const out = async (page: Page, seat: number) => {
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
};
const read = async (page: Page, steps: number, first: number) => {
  let total = 0;
  const wrong: string[] = [];
  for (let at = 0; at < steps; at += 1) {
    await page.clock.runFor(at === 0 ? first : 80);
    await page.waitForTimeout(80);
    const reading = await overSpine(page);
    total += reading?.read ?? 0;
    wrong.push(...(reading?.wrong ?? []));
  }
  expect(total, 'the precondition: the spine was out and its pixels were read').toBeGreaterThan(100);
  expect([...new Set(wrong)]).toEqual([]);
};

for (const seat of [1, 2, 4, 10, 15, 21, 22, 33, 41]) {
  test(`at 43 records nothing is over the spine leaving seat ${seat}, shelf ${shelfOf(seat)} from the top`, async ({ page }) => {
    await out(page, seat);
    await read(page, 8, 330);
  });

  test(`at 43 records nothing is over the spine going back to seat ${seat}, shelf ${shelfOf(seat)} from the top`, async ({ page }) => {
    await out(page, seat);
    await page.clock.runFor(2200);
    await page.waitForTimeout(150);
    await expect(page.locator('[data-wall-container]').first()).toHaveAttribute('data-phase', 'landed');
    await page.keyboard.press('Escape');
    await read(page, 7, 300);
  });
}
