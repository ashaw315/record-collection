import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * **§2.1: zero gutter, full bleed — at every width from the fork to §30's
 * ceiling, not only at the named breakpoints.**
 *
 * Adam's QA capture at 1512 showed the paper, the row rules and the
 * quarter-disc all stopping at one vertical boundary, with everything right
 * of it unpainted. The hypothesis was that the twelve columns hold 120px
 * until 1680 and the page is stuck at 1440 between breakpoints. Measured, it
 * is not so on this harness: a 1px sweep from 1440 to 1920 found 0 of 481
 * widths where the band, the region, the row rules or the scroll width fell
 * short of the viewport, and fresh loads, DPR 2, the probe route and a
 * client-side arrival through the wall all fill to the last pixel.
 *
 * So this sweep is kept as the assertion. It reads rects, which is enough
 * for the composition's extent; the pixel reads that confirmed the paper are
 * in the commit that added it. If the boundary Adam saw ever appears here,
 * this names the width and the gap.
 */
test('§2.1: the page fills the viewport at every width from 1440 to 1920', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  const a = await page.request.post('/api/artists', { data: { name: 'MGMT' } });
  const artist = await a.json();
  const artistId = (artist.id ?? artist.error?.existingId) as string;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { artistId, title: 'Loss Of Life', releaseYear: 2024 } });
  const { id } = await r.json();
  const db = getTestDb();
  const pressing = await db.execute<{ id: string }>(sql`INSERT INTO pressings (pressing_plant, color_variant, matrix_runout) VALUES ('GZ Media', 'Orange', 'X') RETURNING id`);
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, pressing_id = ${pressing.rows[0].id}::uuid, purchase_price = 12.99, snippet = 'A snippet.', snippet_edited_at = NOW() WHERE id = ${id}::uuid`);
  await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${id}::uuid, 12.99, 'used', 'discogs')`);

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(600);

  const short: string[] = [];
  let checked = 0;
  for (let w = 1440; w <= 1920; w += 1) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    const m = await page.evaluate(() => {
      const right = (sel: string) => {
        const el = document.querySelector(sel);
        return el === null ? -1 : Math.round(el.getBoundingClientRect().right);
      };
      const rules = Array.from(document.querySelectorAll('[data-row-rule]')).map((e) => e.getBoundingClientRect().right);
      return {
        vw: window.innerWidth,
        band: right('[data-band="identity"]'),
        region: right('[data-region="extended-grid"]'),
        rules: rules.length ? Math.round(Math.max(...rules)) : -1,
        scroll: document.documentElement.scrollWidth,
      };
    });
    checked += 1;
    if (m.band !== m.vw || m.region !== m.vw || m.rules !== m.vw || m.scroll !== m.vw) {
      short.push(`${w}: band ${m.band} region ${m.region} rules ${m.rules} scroll ${m.scroll} (gap ${w - Math.min(m.band, m.region, m.rules)})`);
    }
  }
  expect(checked, 'every width in the range was measured').toBe(481);
  expect(short, `widths where the page does not reach the viewport edge:\n  ${short.slice(0, 12).join('\n  ')}${short.length > 12 ? `\n  … ${short.length} in all` : ''}`).toEqual([]);
});
