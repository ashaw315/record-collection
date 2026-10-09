import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { eachScreen, openScreen as open, seedFixture } from './screens-103';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 103a, §T.6: "No corner is rounded anywhere in the app. The shared
 * 3px radius becomes 0. Every ruled surface is already square."
 *
 * Two claims, and the second is §T.6's premise, not its ruling. The ruled
 * surfaces (the shelf near and far, the table, the grid and their filter
 * panel, the record page with its delete confirmation and its modal, the
 * header and its menu) are read for a rounded corner as they stood BEFORE
 * the radius went to 0: one found there is a ruled screen that was relying
 * on the radius. The screens §T.6 reaches, the four pages its radius
 * sentence accepts restyling, and sign-in are read after.
 *
 * Every element in the document is read, drawn or not, so what a closed
 * disclosure holds is read too. What is not in the document until asked
 * for is not: the confirmation dialogs on manage and the want list, and
 * tooltips.
 */
/** Every element with a rounded corner, as "what radius", and how many elements were read. */
const rounded = (page: Page) =>
  page.evaluate(() => {
    const found = new Set<string>();
    const all = Array.from(document.querySelectorAll('body, body *')).filter((el) => el.closest('nextjs-portal, script, style') === null);
    for (const el of all) {
      const cs = getComputedStyle(el);
      const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
      if (radii.every((r) => r === '0px')) continue;
      /* §59's disc is a drawn circle, a mark of the record page's and not a rounded corner: named, and only at exactly half. */
      if (el.hasAttribute('data-ornament') && radii.every((r) => r === '50%')) continue;
      const mark = Array.from(el.attributes).find((a) => a.name.startsWith('data-'))?.name ?? (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('rounded')).join(' ');
      found.add(`${el.tagName.toLowerCase()} ${mark} ${[...new Set(radii)].join('/')}`);
    }
    return { found: [...found].sort(), read: all.length };
  });

async function expectSquare(page: Page, name: string) {
  const r = await rounded(page);
  expect(r.read, `${name}: the precondition, the page was read`).toBeGreaterThan(5);
  /* Soft, so one run names every surface with a corner and not only the first. */
  expect.soft(r.found, `${name}: rounded corners`).toEqual([]);
}

test.describe('§T.6’s premise: every ruled surface is already square', () => {
  test.beforeEach(async ({ page }) => login(page));

  /* Fails against a ruled surface that draws a corner from the shared radius, or from any other: that surface was relying on it. */
  for (const width of [390, GRID_FORK]) {
    test(`at ${width}: the shelf near and far, the table and the grid with a filter open, and the header’s menu`, async ({ page }) => {
      await open(page, '/', width);
      await expectSquare(page, 'the shelf as it opens');
      if (width === GRID_FORK) {
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor();
        await expectSquare(page, 'the shelf, far');
      } else {
        await page.locator('[data-app-nav] [data-menu-control]').click();
        await page.locator('[data-menu-panel]').waitFor();
        await expectSquare(page, 'the header’s menu, open');
      }
      for (const view of ['table', 'grid']) {
        await open(page, `/?view=${view}`, width);
        await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
        await expectSquare(page, `the ${view}`);
        await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
        await page.locator('[data-filter-panel]').waitFor();
        await expectSquare(page, `the ${view}, a filter open`);
      }
    });

    test(`at ${width}: a record’s page, its delete confirmation and its modal`, async ({ page }) => {
      const f = await seedFixture(page, 'Radius103');
      await open(page, `/records/${f.record}`, width);
      await expectSquare(page, 'the record page');
      await page.locator('[data-cover-trigger]').click();
      await page.locator('[data-sleeve-modal]:not([data-travelling])').waitFor();
      await expectSquare(page, 'the record modal');
      await page.keyboard.press('Escape');
      await page.locator('[data-sleeve-modal]').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Delete record' }).click();
      await page.getByRole('button', { name: 'Cancel' }).waitFor();
      await expectSquare(page, 'the delete confirmation');
    });
  }
});

test.describe('§T.6: no corner is rounded on the screens it reaches', () => {
  /* Fails against the shared radius at 3px and Tailwind's own 2px: buttons, inputs, selects, cards and badges on every one of these. */
  for (const width of [390, GRID_FORK]) {
    test(`at ${width}: the want list, look up, stats, manage’s six sections, the record form, and the four pages not surveyed`, async ({ page }) => {
      await login(page);
      const f = await seedFixture(page, 'Radius103');
      await eachScreen(page, f, width, (name) => expectSquare(page, name));
    });

    test(`at ${width}: sign-in, signed out`, async ({ page }) => {
      await open(page, '/login', width);
      await expectSquare(page, 'sign-in');
    });
  }
});
