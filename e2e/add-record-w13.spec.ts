import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { nearViewMinWidth } from '../src/app/wall/view-fork';

/**
 * **§W.13: ADD RECORD out of the rail where the rail is a column (Design's "ADD RECORD leaves the rail", 8 Nov,
 * answering Adam's judgement that the 308 scroll at 640 was too far).** "Where the rail is a column, Add record stands
 * at the top right of the content beside the rail, as the table and the grid set it at their content column’s top
 * right, so every view of the collection puts it in one place, in view at every height." The band host is unchanged.
 *
 * Each case fails against the rail that ends in Add record below a full-bleed rule (WallRail.tsx), where at 640 it
 * stood 308 past the window's foot.
 */
test.beforeEach(async ({ page }) => login(page));

const visibleAddRecord = (page: Page) =>
  page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/records/new"]')).filter((a) => a.getClientRects().length > 0 && /add record/i.test(a.textContent ?? ''));
    const rail = document.querySelector('[data-shelf-offered] [data-testid="wall-rail"]');
    const composition = document.querySelector('[data-shelf-offered] [data-composition]');
    const search = rail?.querySelector('input[type="search"]') ?? null;
    return {
      count: links.length,
      inRail: links.filter((a) => rail?.contains(a)).length,
      railRuleShown: Array.from(rail?.querySelectorAll('[data-rail-rule]') ?? []).some((r) => (r as HTMLElement).getClientRects().length > 0),
      link: links[0] ? (() => { const r = links[0].getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; })() : null,
      compositionRight: composition?.getBoundingClientRect().right ?? null,
      searchBottom: search?.getBoundingClientRect().bottom ?? null,
      window: { width: window.innerWidth, height: window.innerHeight },
      onTop: links[0] ? (() => { const r = links[0].getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit !== null && links[0].contains(hit); })() : false,
    };
  });

for (const [width, height] of [[1274, 640], [1440, 900]] as const) {
  for (const view of ['near', 'far'] as const) {
    test(`at ${width}×${height} on the ${view} view, the rail a column: Add record stands at the content's top right, in view, out of the rail`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await wallMeasured(page);
      if (view === 'far') {
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
      }
      const m = await visibleAddRecord(page);
      expect(m.count, 'one Add record drawn').toBe(1);
      expect(m.inRail, 'and not in the rail').toBe(0);
      expect(m.railRuleShown, 'the rail’s rule above it goes with it').toBe(false);
      if (m.link === null || m.compositionRight === null || m.searchBottom === null) throw new Error('not drawn');
      /* "At the content's top right": the content's right inset, the regions' 34, as the table's and grid's content inset sets theirs. */
      expect(Math.round(m.compositionRight - m.link.right), 'its right edge 34 in from the content’s').toBe(34);
      /* On the rail's first line: its rule and SEARCH's agree by construction, as on the table and the grid. */
      expect(Math.round(m.link.bottom), 'its rule on SEARCH’s line').toBe(Math.round(m.searchBottom));
      expect(m.link.bottom, 'in view at rest').toBeLessThanOrEqual(m.window.height);
      expect(m.onTop, 'nothing drawn over it').toBe(true);
    });
  }
}

test('below the fork, the rail a band: Add record stays in the band, as it was', async ({ page }) => {
  await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 900 });
  await page.goto('/');
  await wallMeasured(page);
  const m = await visibleAddRecord(page);
  expect(m.count, 'one Add record drawn').toBe(1);
  expect(m.inRail, 'in the band').toBe(1);
});
