import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 100, §W.24: the search field's floor and Add record's colour.
 *
 * "The search field is 44 tall." It was §9.3's 34, the one control on the
 * Collection screen under the floor (measured on the real collection at
 * step 97). And Add record is ink by §3's reason, on every view: its link
 * carried the label's colour class and the ink class together, the label's
 * won, and it drew in the label colour on the shelf.
 *
 * Read on all three views at 390 and 1440. At 1440 the shelf's controls are
 * a rail and the table's and grid's are the band, so the six cases cover
 * both forms.
 */
/* Ink as a class computes to lab() and as an inline value to oklch(); both spell the one colour. */
const INK = ['oklch(0.19 0.008 60)', 'lab(6.18075 1.20374 2.12039)'];

const VIEWS = [
  ['shelf', '/'],
  ['table', '/?view=table'],
  ['grid', '/?view=grid'],
] as const;

test.beforeEach(async ({ page }) => login(page));

for (const [view, path] of VIEWS) {
  for (const width of [390, 1440]) {
    /* Fails against the 34 field, and on the shelf against the link drawn in the label colour. */
    test(`${view} at ${width}: the search field is 44 tall and Add record is ink by one colour class`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      const rail = page.getByTestId('wall-rail');
      await expect(rail.locator('#rail-search')).toBeVisible({ timeout: 30_000 });
      const m = await rail.evaluate((el) => {
        const field = el.querySelector('#rail-search') as HTMLElement;
        const add = Array.from(el.querySelectorAll('a')).find((a) => (a.textContent ?? '').trim() === 'Add record') as HTMLElement;
        return {
          field: field.getBoundingClientRect().height,
          band: (document.querySelector('[data-collection-band]') as HTMLElement | null)?.getBoundingClientRect().height ?? null,
          colour: getComputedStyle(add).color,
          colourClasses: Array.from(add.classList).filter((name) => /^text-\[(?:oklch|lab|#|rgb)/.test(name)),
        };
      });
      expect(m.field, 'the search field’s height').toBe(44);
      /* §T.1's 126.5 and the field's 10: every page that carries the band is 10 longer, and nothing else moved (measured before and after, 9 Oct). */
      if (view !== 'shelf') expect(m.band, 'the band’s height').toBe(136.5);
      expect(INK, `Add record is ink: ${m.colour}`).toContain(m.colour);
      expect(m.colourClasses, 'one colour class, so no two can compete').toEqual(['text-[oklch(0.19_0.008_60)]']);
    });
  }
}
