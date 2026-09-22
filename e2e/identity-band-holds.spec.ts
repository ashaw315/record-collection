import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, MAX_GRID_WIDTH } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **The identity band's height is a budget, and its cells must live inside it.**
 *
 * §1 budgets the 900px screen exactly — nav, identity, record, tail — so the
 * identity band carries an explicit height. But a grid ROW with a fixed height
 * does not clamp its children: a cell whose content has an intrinsic size
 * grows past it and spills, and the band's number becomes a claim rather than
 * a constraint.
 *
 * The still is where that bites, because its height comes from an SVG sized
 * `h-full` against a grid item with no definite height — so the svg falls back
 * to its viewBox's intrinsic ratio, and **the frame's aspect ends up driving
 * the cell's height**. A taller frame made the cell 655 in a 547 band, 108px
 * of overflow that pushed the cover past its cell and clipped the controls row
 * below. Found on a screenshot, traced to an uncommitted experiment, and the
 * experiment was only ever the trigger: the band was never holding its cells.
 *
 * This matters beyond that one change. §17 and §19 are both still deciding the
 * construction's aspect, and **any aspect they rule must fit this band** — so
 * the constraint is asserted here rather than left to be rediscovered by the
 * next frame change. The generator is free to choose its proportion; it is not
 * free to resize the composition (§8 closes the frame).
 *
 * Asserted with nothing clipped, because clamping by cropping would trade this
 * defect for the one §5.1 forbids by name: "an object with a slice taken out
 * of it reports that something went wrong."
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('every identity cell fits the band’s height, and the still is not clipped', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `band-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Band ${s}`, releaseYear: 1970 },
  });
  const { id } = await r.json();

  /* Above the 1440 fork, where the twelve columns are the composition (§18). */
  for (const width of [2000, MAX_GRID_WIDTH, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`/records/${id}`);
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
      const band = document.querySelector('[data-band="identity"]')!.getBoundingClientRect();
      const cells = Array.from(document.querySelectorAll('[data-band="identity"] > [data-cell]')).map((el) => ({
        name: (el as HTMLElement).dataset.cell ?? '?',
        height: el.getBoundingClientRect().height,
        bottom: el.getBoundingClientRect().bottom,
      }));

      /* The drawn geometry inside the still, to prove the clamp did not crop. */
      const svg = document.querySelector('[data-cell="still"] svg');
      const cell = document.querySelector('[data-cell="still"]')!.getBoundingClientRect();
      let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
      for (const g of Array.from(svg?.querySelectorAll('polygon,circle,ellipse') ?? [])) {
        const b = (g as SVGGraphicsElement).getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom);
        left = Math.min(left, b.left); right = Math.max(right, b.right);
      }
      return {
        band: band.height, bandBottom: band.bottom, cells,
        art: { top: top - cell.top, bottom: cell.bottom - bottom, left: left - cell.left, right: cell.right - right },
      };
    });

    expect(m.band, `the band keeps its budgeted height at ${width}`).toBeCloseTo(BANDS.identity, 0);

    for (const cell of m.cells) {
      expect(
        cell.height,
        `at ${width}, the ${cell.name} cell fits the band — ${Math.round(cell.height)} in ${BANDS.identity}`,
      ).toBeLessThanOrEqual(BANDS.identity);
      expect(cell.bottom, `at ${width}, the ${cell.name} cell does not spill below the band`).toBeLessThanOrEqual(m.bandBottom + 1);
    }

    /* Nothing cropped: §5.1 — a cropped object reports that something went wrong. */
    for (const [side, gap] of Object.entries(m.art)) {
      expect(gap, `at ${width}, the construction's ${side} edge is inside its cell`).toBeGreaterThanOrEqual(-1);
    }
  }
});
