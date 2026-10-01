import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path}`).toBe(201);
  return response.json();
}

/**
 * Step 71: the tile's Delete control. Found in the step 65 and 66 captures
 * rendering below the tile at its left while its classes say top-right over
 * the image. First the report -- where the control lands at four widths and
 * which rule beats the tile's -- then the fix: the control sits over the
 * tile's top-right corner, as §9.2's control vocabulary puts it.
 */
const WIDTHS: ReadonlyArray<[number, number]> = [[390, 844], [1000, NO_SCROLL_HEIGHT], [GRID_FORK, NO_SCROLL_HEIGHT], [1920, NO_SCROLL_HEIGHT]];

const READ = `(() => Array.from(document.querySelectorAll('[data-testid="gallery-image"]')).map((tile) => {
  const img = tile.querySelector('img'); const button = tile.querySelector('button');
  const t = tile.getBoundingClientRect(); const i = img.getBoundingClientRect(); const b = button.getBoundingClientRect();
  const cs = getComputedStyle(button); const ts = getComputedStyle(tile);
  /* Which rule sets the control's position: every stylesheet rule the button matches that declares one, in cascade order, with its specificity-relevant selector. */
  const rules = [];
  for (const sheet of Array.from(document.styleSheets)) { let list = []; try { list = Array.from(sheet.cssRules || []); } catch (e) { continue; } const walk = (rs) => { for (const r of rs) { if (r.cssRules && r.cssRules.length && !(r.selectorText)) walk(Array.from(r.cssRules)); if (r.selectorText && r.style && r.style.position) { try { if (button.matches(r.selectorText)) rules.push(r.selectorText + ' -> ' + r.style.position + (r.parentRule && r.parentRule.cssText ? ' (in ' + r.parentRule.cssText.slice(0, 40) + ')' : '')); } catch (e) {} } } }; walk(list); }
  return { type: tile.getAttribute('data-image-type'), rules, tilePosition: ts.position, position: cs.position, top: cs.top, right: cs.right, classes: button.className, overImage: b.top >= i.top - 0.5 && b.bottom <= i.bottom + 0.5 && b.right <= i.right + 0.5 && b.left >= i.left - 0.5, atTopRight: Math.abs(b.top - (i.top + 4)) < 1.5 && Math.abs(i.right - 4 - b.right) < 1.5, dx: Math.round(b.left - i.left), dy: Math.round(b.top - i.top), imageH: Math.round(i.height), tileH: Math.round(t.height) };
}))()`;

test('step 71: the tile’s Delete control sits over the tile’s top-right corner, where its classes put it, at four widths', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `Delete ${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Control ${suffix}`, artistId: artist.id });
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${record.id}::uuid`);
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await seedImage({ recordId: record.id as string, imageType: 'back' });
  await seedImage({ recordId: record.id as string, imageType: 'label' });
  const bad: string[] = [];
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/records/${record.id}`);
    await page.locator('[data-testid="gallery-image"]').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    const tiles = (await page.evaluate(READ)) as Array<{ type: string; rules: string[]; tilePosition: string; position: string; top: string; right: string; classes: string; overImage: boolean; atTopRight: boolean; dx: number; dy: number; imageH: number; tileH: number }>;
    for (const t of tiles) {
      console.log(`  STEP 71 DELETE @${w} ${t.type}: computed position ${t.position} (tile ${t.tilePosition}), top ${t.top}, right ${t.right}; lands ${t.dx},${t.dy} from the image's top-left (image ${t.imageH} tall, tile ${t.tileH}); over the image: ${t.overImage}; at its top-right: ${t.atTopRight}; position rules matched, in cascade order: ${t.rules.join(' | ')}`);
      if (!t.atTopRight) bad.push(`${w} ${t.type}: the control lands ${t.dx},${t.dy} from the image's top-left, not over its top-right corner (computed position ${t.position}; classes "${t.classes}")`);
    }
  }
  expect(bad, `the Delete control:\n  ${bad.join('\n  ')}`).toEqual([]);
});
