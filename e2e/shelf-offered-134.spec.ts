import { expect, test, type Page } from '@playwright/test';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../src/app/wall/view-fork';
import { HIT_FLOOR, expectFloor, pointerIs } from './hit-area';
import { login } from './sign-in';

/**
 * Step 134, §W.24: "The shelf is offered only where the window is 1044 or
 * wider and the primary pointer is fine; under a coarse pointer at any
 * width, the Collection opens on the grid, by the same silent fallback."
 * And the step above it in the handoff, taken with it: "Below the shelf's
 * fork, §W.24's 1044, the shelf is not offered: the Collection opens on the
 * grid, and the band's view names are TABLE and GRID."
 *
 * Two mechanisms, each with its own job (the coordinator, 12 Oct). What is
 * DRAWN is a media query's: a bare `/` carries the shelf and the grid, and
 * the window shows one, so the first paint is right, scripting off is right,
 * Back is right, and widening brings the shelf back. The ADDRESS records an
 * explicit choice: `?view=grid` is honoured anywhere, and `?view=shelf`
 * arriving where the shelf is not offered is cleared by replacement, never a
 * push. Nothing is stored.
 */
const FORK = shelfOfferedMinWidth();
/*
  Two figures, and the ruling names the lower. The shelf is offered from 1044, the fixture's width; the NEAR view
  starts at 1274, the landing's (§W.26). Between them the shelf that is offered is the far view, as it was.
*/
const NEAR = nearViewMinWidth();

type Drawn = { shelf: boolean; grid: boolean; names: (string | null)[]; current: (string | null)[] };

async function drawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const shows = (el: Element | null) => el !== null && el.getClientRects().length > 0;
    const names = [...document.querySelectorAll('[data-view-name]')].filter(shows);
    return {
      shelf: shows(document.querySelector('[data-shelf-offered]')),
      grid: shows(document.querySelector('[data-collection-grid]')),
      names: names.map((el) => el.getAttribute('data-view-name')),
      current: names.filter((el) => el.querySelector('[aria-current="page"]') !== null).map((el) => el.getAttribute('data-view-name')),
    };
  });
}

const SHELF: Drawn = { shelf: true, grid: false, names: ['shelf', 'table', 'grid'], current: ['shelf'] };
const GRID_ONLY: Drawn = { shelf: false, grid: true, names: ['table', 'grid'], current: ['grid'] };

test.beforeEach(async ({ page }) => {
  expect([FORK, NEAR], 'the precondition: the shelf is offered from the figure the ruling names, below the near view’s').toEqual([1044, 1274]);
  await login(page);
});

test.describe('under a fine pointer', () => {
  /* Fails against a page that carries one view: at the fork the grid is not in the document to be hidden, and below it there is no grid to show. */
  test('at the fork a bare / draws the shelf, with SHELF among the view names; one pixel below it draws the grid, with TABLE and GRID, and the address is still /', async ({ page }) => {
    expect(await pointerIs(page)).toBe('fine');
    await page.setViewportSize({ width: FORK, height: 900 });
    await page.goto('/');
    expect(await drawn(page), `at ${FORK}`).toEqual(SHELF);
    /* And where the table's and the grid's sidebar has rules of its own for the grid's root: the first build left both views drawn at 1440. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    expect(await drawn(page), 'at 1440').toEqual(SHELF);

    await page.setViewportSize({ width: FORK - 1, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await drawn(page), `at ${FORK - 1}`).toEqual(GRID_ONLY);
    await expect(page, 'a bare / is not rewritten: it means the view this window gets').toHaveURL('/');
  });

  /* Fails against an address that records the fallback: widening would find ?view=grid and keep the grid. */
  test('widening a bare / past the fork brings the shelf back, and narrowing again the grid', async ({ page }) => {
    await page.setViewportSize({ width: FORK - 1, height: 900 });
    await page.goto('/');
    expect((await drawn(page)).grid, 'the precondition: it opened on the grid').toBe(true);
    await page.setViewportSize({ width: FORK, height: 900 });
    await expect.poll(() => drawn(page)).toEqual(SHELF);
    await page.setViewportSize({ width: FORK - 1, height: 900 });
    await expect.poll(() => drawn(page)).toEqual(GRID_ONLY);
    await expect(page).toHaveURL('/');
  });

  /* Fails against a fork that overrides an explicit choice: ?view=grid at a wide window would draw the shelf. */
  test('?view=grid is honoured at any width: the grid alone, with SHELF offered from the fork and not below it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?view=grid');
    expect(await drawn(page), 'at 1440').toEqual({ shelf: false, grid: true, names: ['shelf', 'table', 'grid'], current: ['grid'] });
    await expect(page.locator('[data-shelf-offered]'), 'an explicit grid carries no shelf at all').toHaveCount(0);

    await page.setViewportSize({ width: FORK - 1, height: 900 });
    await expect.poll(() => drawn(page), `narrowed to ${FORK - 1}`).toEqual(GRID_ONLY);
    await expect(page, 'and the address it was given stands').toHaveURL('/?view=grid');
  });

  /* Fails against a fallback that pushes, and against one that leaves the address saying shelf where no shelf is drawn. */
  test('?view=shelf below the fork draws the grid and the address is cleared by replacement; at the fork it stands', async ({ page }) => {
    await page.setViewportSize({ width: FORK - 1, height: 900 });
    await page.goto('/want-list');
    await page.goto('/?view=shelf');
    const entries = await page.evaluate(() => history.length);
    await expect(page, 'the view is cleared from the address').toHaveURL('/');
    expect(await drawn(page)).toEqual(GRID_ONLY);
    expect(await page.evaluate(() => history.length), 'no entry was added').toBe(entries);
    await page.goBack();
    await expect(page, 'and Back leaves the collection: it does not return to an address that cannot draw').toHaveURL('/want-list');

    await page.setViewportSize({ width: FORK, height: 900 });
    await page.goto('/?view=shelf');
    await page.waitForLoadState('networkidle');
    expect(await drawn(page)).toEqual(SHELF);
    await expect(page, 'where the shelf is offered the address is not touched').toHaveURL('/?view=shelf');
  });

  /* Fails against two views that share their ids: a label would name the hidden view's field. */
  for (const width of [1440, 390]) {
    test(`at ${width} no id is in the document twice`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('[data-shelf-offered]'), 'the precondition: both views are in the document').toHaveCount(1);
      await expect(page.locator('[data-shelf-fallback]')).toHaveCount(1);
      const twice = await page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
        return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} × ${n}`);
      });
      expect(twice).toEqual([]);
    });
  }
});

/* Fails against a fork that reads the width alone: a tablet or a touchscreen at 1280 would be given the shelf. */
test.describe('under a coarse pointer', () => {
  test.use({ hasTouch: true });
  for (const width of [1280, 1440]) {
    test(`at ${width} a bare / draws the grid, with TABLE and GRID, the address is still /, and each name is ${HIT_FLOOR} to a finger`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      expect(await pointerIs(page), 'the precondition').toBe('coarse');
      await page.waitForLoadState('networkidle');
      expect(await drawn(page)).toEqual(GRID_ONLY);
      await expect(page).toHaveURL('/');
      /* With SHELF gone TABLE has no neighbour before it: the band's controls are read again as they now stand. */
      /* Left out: the form's Apply, for a reader with no script. It is off screen and no finger reaches it (the count of 11 Oct left it out the same way). */
      const reach = await expectFloor(page, 'coarse', `the band at ${width} with SHELF not offered`, '[data-shelf-fallback] [data-collection-band]', 'button.sr-only');
      expect(reach.filter((r) => /^(Table|Grid)$/i.test(r.name)).map((r) => r.name.toLowerCase()), 'the precondition: the two names were read').toEqual(['table', 'grid']);
    });
  }
});

/* Fails against a fallback the script makes: with no script a phone would be shown the shelf. */
test('with no script at all, 390 draws the grid and 1440 the shelf', async ({ page, browser }) => {
  const state = await page.context().storageState();
  for (const [width, want] of [[390, GRID_ONLY], [1440, SHELF]] as const) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 }, storageState: state });
    const still = await context.newPage();
    await still.goto('/');
    expect(await drawn(still), `at ${width}`).toEqual(want);
    await context.close();
  }
});
