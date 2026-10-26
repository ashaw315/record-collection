import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../src/app/wall/view-fork';

/**
 * **The far view's region beneath the band is the height left in the window (§W.28).**
 *
 * §W.28: "the fit stays to height", and "Code reads the region's height as
 * the screen's already; it is not". It rejects fit-with-scroll by name. Where
 * the shelf's rail draws as a band (§W.24), the band stands above the far
 * view, and the region was still the window less the nav: 847 tall beneath a
 * band whose foot was at 189.5, so it ended at 1036.5 in a 900 window and the
 * fixture's ink at 983.7 (measured 26 Oct, before step 156's control). The
 * widths are the condition's, read from the code: today 1044 to 1273.
 */
const BAND_WIDTHS = [shelfOfferedMinWidth(), nearViewMinWidth() - 1];
const HEIGHTS = [900, 768];

test.beforeEach(async ({ page }) => login(page));

const measure = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element | null): el is HTMLElement => el !== null && (el as HTMLElement).getClientRects().length > 0;
    const region = Array.from(document.querySelectorAll('[data-region="far"]')).find(drawn) ?? null;
    const rail = Array.from(document.querySelectorAll('[data-testid="wall-rail"]')).filter(drawn).find((el) => el.closest('[data-collection-band]') === null) ?? null;
    const svg = region?.querySelector('svg[data-wall="overview"]') ?? null;
    /* The ink, not the svg's box: `meet` fits the drawing inside it. */
    const ink = svg === null ? [] : Array.from(svg.querySelectorAll('[data-furniture], [data-far-seat]')).map((el) => el.getBoundingClientRect());
    return {
      region: region === null ? null : { top: region.getBoundingClientRect().top, bottom: region.getBoundingClientRect().bottom },
      bandFoot: rail === null ? null : rail.getBoundingClientRect().bottom,
      inkTop: ink.length === 0 ? null : Math.min(...ink.map((b) => b.top)),
      inkBottom: ink.length === 0 ? null : Math.max(...ink.map((b) => b.bottom)),
      scrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    };
  });

for (const width of BAND_WIDTHS) {
  for (const height of HEIGHTS) {
    test(`at ${width}×${height}: the far region fills the window beneath the band, and the drawing is whole inside it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await wallMeasured(page);
      await page.evaluate(() => document.fonts.ready);
      const m = await measure(page);
      if (m.region === null || m.bandFoot === null || m.inkTop === null || m.inkBottom === null) throw new Error(`not drawn: ${JSON.stringify(m)}`);
      test.info().annotations.push({ type: 'fit', description: `band foot ${m.bandFoot.toFixed(1)}, region ${m.region.top.toFixed(1)}–${m.region.bottom.toFixed(1)}, ink ${m.inkTop.toFixed(1)}–${m.inkBottom.toFixed(1)}, window ${m.viewport}` });
      expect(m.region.top, 'the region starts at the band’s foot').toBeCloseTo(m.bandFoot, 0);
      expect(m.region.bottom, 'and ends at the window’s foot').toBeCloseTo(m.viewport, 0);
      expect(m.inkTop, 'the drawing starts inside the region').toBeGreaterThanOrEqual(m.region.top);
      expect(m.inkBottom, 'and ends above the window’s foot').toBeLessThanOrEqual(m.viewport);
      expect(m.scrollHeight, 'the page does not scroll (§W.28: fit-with-scroll is rejected)').toBeLessThanOrEqual(m.viewport);
    });
  }
}
