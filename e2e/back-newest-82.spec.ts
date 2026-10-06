import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * Step 82, §M.2: "Every face shows the newest photo of its type... The wall
 * moves to newest-first too, and this file does not keep two rules. A
 * reader who pulls a record and later opens its modal would otherwise see
 * two different backs of one sleeve."
 *
 * "That step is verified by a fixture, not a capture": the one real record
 * with a back photograph has one, so oldest and newest look the same on
 * every real record. The fixture is a record with two backs of different
 * dates, the NEWER inserted first, so neither insertion order nor id order
 * can stand in for the date; the test asserts that precondition before it
 * reads either screen.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const fixture = (file: string) => `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', file)).toString('base64')}`;
const NEWER = fixture('cover-outside-portrait-949x1000.png');
const OLDER = fixture('cover-far-1200x900.png');

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seedTwoBacks(page: Page): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Backs82-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Backs82 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: fixture('cover-inside-1000x951.png') });
  const newer = await seedImage({ recordId: id, imageType: 'back', url: NEWER });
  const older = await seedImage({ recordId: id, imageType: 'back', url: OLDER });
  const db = getTestDb();
  await db.execute(sql`UPDATE images SET created_at = '2026-06-01T00:00:00Z' WHERE id = ${newer}::uuid`);
  await db.execute(sql`UPDATE images SET created_at = '2026-01-01T00:00:00Z' WHERE id = ${older}::uuid`);
  /* The precondition: two backs, and the one inserted FIRST is the newer by date. */
  const rows = await db.execute(sql`SELECT url, created_at FROM images WHERE record_id = ${id}::uuid AND image_type = 'back' ORDER BY created_at DESC`);
  expect(rows.rows.length, 'two backs').toBe(2);
  expect((rows.rows[0] as { url: string }).url === NEWER, 'the newest by date is the photograph called NEWER').toBe(true);
  expect(NEWER, 'and the two photographs differ').not.toBe(OLDER);
  return id;
}

test.beforeEach(async ({ page }) => login(page));

/* Fails against the shelf query as built at step 72, which gave the wall the oldest back. */
test('the wall’s pulled record, turned over, shows the newer of two backs', async ({ page }) => {
  const id = await seedTwoBacks(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.locator(`[data-seat="${id}"] [data-spine]`).click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 8000 });
  await page.getByTestId('record-chrome').getByTestId('action-turn').click();
  const back = page.locator('[data-pulled] image[data-back]');
  await expect(back).toHaveCount(1);
  const href = await back.getAttribute('href');
  expect(href === OLDER, 'not the older back').toBe(false);
  expect(href === NEWER, 'the newer back').toBe(true);
});

/* Fails against a modal that takes the first back row or the oldest: the newer was inserted first and dated later. */
test('the record modal, turned over, shows the same newer back', async ({ page }) => {
  const id = await seedTwoBacks(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open the sleeve' }).click();
  await page.locator('[data-sleeve-control="turn"]').click();
  const back = page.locator('[data-sleeve] img[data-sleeve-face="back"]');
  await expect(back).toHaveCount(1);
  const src = await back.getAttribute('src');
  expect(src === OLDER, 'not the older back').toBe(false);
  expect(src === NEWER, 'the newer back').toBe(true);
});
