import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { WORST } from '../src/app/records/[id]/identity-extremes';
import { seedExtreme } from './identity-extremes';

registerCleanup();

/**
 * **§27: no pressing fact is clipped on the collection's real worst title.**
 *
 * §9.2's clip is for ornament, which carries no data. A pressing line cut by
 * `overflow-hidden` is a fact rendered shorter (§6) — the app confidently
 * misleading rather than obviously broken. This seeds the worst case the
 * shared extremes module names and asserts that every fact in the pressing
 * block ends inside the cell's content box.
 *
 * It reports the margin as a number rather than a pass, because the case is
 * a hair either way: after §27's deletion the short-label case fits by 0.4px
 * once the genres run collapses, and the long-label case is 16px over after
 * the collapse has fired. Whether a further height term exists is Design's to
 * rule; this test says what the cell does today.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}


test('§27: every pressing fact ends inside the cell on the collection’s worst title', async ({ page }) => {
  await login(page);
  const id = await seedExtreme(page, WORST);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"] [data-field="title"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="identity"] [data-cell="identity"]') ?? document.querySelector('[data-cell="identity"]')!;
    const cs = getComputedStyle(cell);
    const inner = cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const contentBottom = cell.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom);
    const content = cell.querySelector('[data-track="content"]')!;

    const facts = Array.from(cell.querySelectorAll('[data-block="pressing"] [data-field]')).map((el) => ({
      field: el.getAttribute('data-field') ?? '?',
      cut: +(el.getBoundingClientRect().bottom - contentBottom).toFixed(1),
    }));
    /* Distinct ROWS, not client rects: the artist is a link inside a div, and one line yields two rects. */
    const lines = (sel: string) => {
      const el = cell.querySelector(sel);
      if (el === null) return 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    };
    return {
      artistLines: lines('[data-field="artist"]'),
      pressingLines: lines('[data-field="pressing-line"]'),
      inner: Math.round(inner),
      needed: content.scrollHeight,
      /*
        The content's margin against the CELL, which §28 makes the thing the
        trigger measures: "the trigger measures the cell, not the content
        track". The ornament track it used to report beside this is withdrawn
        (§28) and its 140px is part of `inner` now.
      */
      margin: +(inner - content.scrollHeight).toFixed(1),
      collapsed: cell.querySelector('[data-field="genre-count"]') !== null,
      facts,
    };
  });

  console.log(`§27 worst title: content margin ${m.margin}px (needed ${m.needed} against ${m.inner}); run ${m.collapsed ? 'collapsed' : 'listed'}`);

  /* Precondition: the fixture has the RECORD's shape, not the suffix's. */
  expect(m.artistLines, 'the artist renders on one line, as the real record does').toBe(1);
  expect(m.pressingLines, 'the long label wraps the pressing line to two, as the real record does').toBe(2);

  expect(m.facts.length, 'the pressing block carries facts').toBeGreaterThan(0);
  for (const fact of m.facts) {
    expect(fact.cut, `${fact.field} ends inside the cell (positive = clipped by that many px)`).toBeLessThanOrEqual(0);
  }
});
