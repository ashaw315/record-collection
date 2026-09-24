import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { SHORT_TITLE, WORST } from '../src/app/records/[id]/identity-extremes';
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
    const cell = document.querySelector('[data-cell="identity-content"]') ?? document.querySelector('[data-cell="identity"]')!;
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
      /*
        **The children's sum, not `scrollHeight`.** The track is a flex column
        with `justify-content: space-between`, so it always fills its row and
        `scrollHeight` reports the BUDGET: it read 510 against an inner 510
        with the collapse fired, a margin of exactly zero that would have read
        that way whatever the content did. The demand is the two blocks on
        their own heights (Adam's ruling, 24 Sep) — 484.9 here, margin +25.1,
        which is §28's "fits by 25" reproduced on the current tree.
      */
      needed:
        Math.round(
          Array.from(content.children).reduce((sum, child) => {
            const box = child.getBoundingClientRect();
            const childStyle = getComputedStyle(child);
            return sum + box.height + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
          }, 0) * 10,
        ) / 10,
      /*
        The content's margin against the CELL, which §28 makes the thing the
        trigger measures: "the trigger measures the cell, not the content
        track". The ornament track it used to report beside this is withdrawn
        (§28) and its 140px is part of `inner` now.
      */
      margin: +(
        inner -
        Array.from(content.children).reduce((sum, child) => {
          const box = child.getBoundingClientRect();
          const childStyle = getComputedStyle(child);
          return sum + box.height + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
        }, 0)
      ).toFixed(1),
      collapsed: cell.querySelector('[data-field="genre-count"]') !== null,
      facts,
    };
  });

  console.log(`§27 worst title: content margin ${m.margin}px (needed ${m.needed} against ${m.inner}); run ${m.collapsed ? 'collapsed' : 'listed'}`);

  /* Precondition: the fixture has the RECORD's shape, not the suffix's. */
  expect(m.artistLines, 'the artist renders on one line, as the real record does').toBe(1);
  expect(m.pressingLines, 'the long label wraps the pressing line to two, as the real record does').toBe(2);

  expect(m.facts.length, 'the pressing block carries facts').toBeGreaterThan(0);
  /**
   * **No fact is clipped, because the run yields first.** §27: "If the worst
   * title still overflows, §4.2's genres-collapse fires — never
   * overflow-hidden; test asserts no pressing fact is clipped." The collapse
   * IS the mechanism, so the worst title lands at exactly 510 of 510 with
   * its genres withheld to a count.
   *
   * It clipped by 0.9px for one round, when §28's 4px tolerance was applied
   * as slack BEFORE the collapse rather than as a guard against a
   * coincidental pass: at 2px over the collapse was suppressed and the run
   * clipped instead of yielding. The tolerance was the defect, not the fit.
   */
  for (const fact of m.facts) {
    expect(fact.cut, `${fact.field} ends inside the cell (positive = clipped by that many px)`).toBeLessThanOrEqual(0);
  }
});

test('§1 as ruled: the pressing block stays on the cell’s floor, and the gap varies by record', async ({
  page,
}) => {
  /**
   * **Design's ruling, 24 Sep: the pressing block stays on the cell's floor,
   * and the gap varies by record.**
   *
   * That is §4.2's own mechanism made visible — "the pressing block anchors
   * to a reserved floor and the title block flows from the top, so the two
   * can never push each other". The gap between them is what absorbs the
   * title's growth, so it is large on a short title and zero on the worst
   * one. Asserted on two records at once, because a floor that holds on ONE
   * record is a coincidence and the claim is that it holds on both.
   *
   * §4.2 states 43.1px for that gap at two title lines and it does not
   * reproduce — the build gives 273.7 on an ordinary record, or 133.7
   * allowing for §28's removed 140px ornament track. Nothing here asserts
   * 43.1; Design is being asked what geometry it came from.
   */
  await login(page);

  const measured: Array<{ which: string; floorGap: number; titleGap: number }> = [];

  /*
    **The second record must have a SHORT title, not the same five-line one.**
    `FITS_AFTER_COLLAPSE` is the worst title with a shorter label, so both
    records' gaps came out ~25–31px and the void the ruling is about never
    appeared. The gap is what the TITLE's growth spends, so the comparison
    needs a title that has not spent it.
  */
  for (const [which, extreme] of [
    ['worst', WORST],
    ['ordinary', SHORT_TITLE],
  ] as const) {
    const id = await seedExtreme(page, extreme);
    await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-track="content"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);

    measured.push(
      await page.evaluate((label) => {
        const cell = document.querySelector('[data-cell="identity-content"]')!;
        const track = document.querySelector('[data-track="content"]')!;
        const style = getComputedStyle(cell);
        const title = track.children[0].getBoundingClientRect();
        const pressing = track.children[1].getBoundingClientRect();
        const floor = cell.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
        return {
          which: label,
          /* How far the pressing block's foot sits above the cell's floor. */
          floorGap: Math.round((floor - pressing.bottom) * 10) / 10,
          /* The gap §4.2 says absorbs the title's growth. */
          titleGap: Math.round((pressing.top - title.bottom) * 10) / 10,
        };
      }, which),
    );
  }

  const worst = measured.find((m) => m.which === 'worst')!;
  const ordinary = measured.find((m) => m.which === 'ordinary')!;
  console.log(
    `§1 floor: worst sits ${worst.floorGap}px off the floor with a ${worst.titleGap}px gap; ordinary ${ordinary.floorGap}px off with ${ordinary.titleGap}px`,
  );

  /* The ruling's first half: the block is ON the floor, on every record. */
  for (const m of measured) {
    expect(m.floorGap, `${m.which}: the pressing block sits on the cell’s floor`).toBeCloseTo(0, 0);
  }

  /* And its second: the gap is what varies, not the block's position. */
  expect(ordinary.titleGap, 'the ordinary record carries the void').toBeGreaterThan(100);
  expect(worst.titleGap, 'and the worst title has spent it').toBeLessThan(ordinary.titleGap);
});
