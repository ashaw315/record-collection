import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { registerCleanup, trackArtist } from '../cleanup';
import { getTestDb } from '../../test/helpers/db';
import { seedImage, seedRecordWithId } from '../seed';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
registerCleanup();
const post = async (page: Page, path: string, data: unknown) => { const j = await (await page.request.post(path, { data })).json(); return { id: (j.id ?? j.error?.existingId) as string }; };
/** Captures for review on the collection's real rows (real id, title, About and entries; one stand-in shape otherwise). Run with CAPTURE=1 --project=capture. */
test('captures at 390 / 1000 / 1440 / 1920 on real records', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(300_000);
  await page.goto('/login'); await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 }); await page.getByLabel('Password').pressSequentially(process.env.E2E_PASSWORD ?? 'test-password-for-e2e'); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page).toHaveURL('/');
  const rows: Array<{ id: string; title: string; about: string | null; entries: Array<{ entryDate: string; note: string }> }> = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8'));
  const artist = await post(page, '/api/artists', { name: 'MGMT' }); trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: 'Mom + Pop' });
  const pressing = await post(page, '/api/pressings', { catalogNumber: 'MP731', matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media', colorVariant: 'Orange [Tangerine]' });
  const genres: string[] = []; for (const g of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) genres.push((await post(page, '/api/genres', { name: g })).id);
  const db = getTestDb();
  for (const title of ['The Hurdy Gurdy Man', 'Never Too Much', 'Wired']) {
    const r = rows.find((x) => x.title === title)!;
    const e = await db.execute<{ id: string }>(sql`SELECT id FROM records WHERE id = ${r.id}::uuid`);
    if (e.rows.length === 0) {
      await seedRecordWithId({ id: r.id, artistId: artist.id, title: r.title, labelId: label.id, pressingId: pressing.id, releaseYear: 2024, genreIds: genres });
      await seedImage({ recordId: r.id, imageType: 'cover' });
      const about = r.about && r.about.trim() ? r.about : null;
      await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99, notes = 'Bought on the Saturday.', snippet = ${about}, snippet_edited_at = ${about === null ? null : new Date()} WHERE id = ${r.id}::uuid`);
      await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${r.id}::uuid, 12.99, 'used', 'discogs'), (${r.id}::uuid, 13.42, 'used', 'discogs')`);
      for (const en of r.entries) await page.request.post(`/api/records/${r.id}/journal`, { data: { entryDate: en.entryDate, note: en.note } });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    for (const w of [390, 1000, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: w <= 480 ? 844 : NO_SCROLL_HEIGHT });
      await page.goto(`/records/${r.id}`); await page.locator('[data-field="eyebrow"]').waitFor({ timeout: 20_000 }); await page.waitForTimeout(900);
      await page.screenshot({ path: `docs/captures/real-${slug}-${w}.png`, fullPage: true });
    }
  }
});
