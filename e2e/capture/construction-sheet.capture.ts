import { test, expect } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../../test/helpers/db';

/**
 * **The construction sheet: all seventeen real ids, side by side and still.**
 *
 * Both of the generator's faults — a centre-weighted cluster from six slots
 * ringing one origin, and a size band too narrow against the reference's 6:1 —
 * were invisible until tiles sat next to each other. A sheet is the only
 * instrument that has caught anything in this generator, so it is committed
 * rather than run once.
 *
 * Skipped unless CAPTURE=1: it writes a file and asserts almost nothing.
 *
 *   CAPTURE=1 npx playwright test --project=capture
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** The real ids and stored colours, measured 2026-09-12. */
const REAL = [
  ['e73e1de1-3686-4a81-8544-ca2300e187bb', 'The Hurdy Gurdy Man', '#44946b'],
  ['d7047c62-149e-42fa-8cda-fac3f90c47cc', 'Never Too Much', '#a25829'],
  ['158a3163-6a56-4673-8f88-27e7b2aec724', 'Grave New World', '#363129'],
  ['c61c5919-8f50-4782-8e04-419fb3d2b148', 'On The Radio', '#bc4889'],
  ['a31591e7-2e28-42e7-84d5-2a1f96ad31fd', 'Believer', '#7e8285'],
  ['b9a9a9db-4bf5-42e6-b751-0eba2dfe8002', 'Bitches Brew', '#adad85'],
  ['30504952-8d43-4c2e-b687-b89558371df5', 'Bridge Over Troubled', '#816f4c'],
  ['78da2ee9-f7c7-40ea-8149-269454437ef6', 'Dire Straits', '#d8cbb8'],
  ['372aba39-59ad-46c8-b76b-f33ecae75c98', 'Gaucho', '#afae51'],
  ['464979c3-aaa2-43c5-afd4-8dc4ee2e98c6', 'Loss Of Life', '#473e35'],
  ['7d35194b-5a02-4e31-a568-d95a9b32b0cd', 'Mind Games', '#89adc0'],
  ['b4abf39a-df33-4a9e-b65c-64d3d0a39b78', 'Psychic', '#6e636a'],
  ['4a1e2b7c-0000-4000-8000-000000000001', 'Super Rich', '#755f34'],
  ['4a1e2b7c-0000-4000-8000-000000000002', 'The Money Store', '#9b9b9a'],
  ['4a1e2b7c-0000-4000-8000-000000000003', 'The Soft Parade', '#7bb1c5'],
  ['4a1e2b7c-0000-4000-8000-000000000004', 'Wired', '#31788a'],
  /* The one record with no cover: the whole construction falls back to ink. */
  ['4a1e2b7c-0000-4000-8000-000000000005', 'Best Of Blues Project', null],
] as const;

test.use({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 });

test('capture the construction sheet', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');

  const db = getTestDb();
  for (const [id, title, colour] of REAL) {
    const [artist] = (
      await db.execute(sql`INSERT INTO artists (name) VALUES (${`Sheet ${title}`}) RETURNING id`)
    ).rows as Array<{ id: string }>;
    await db.execute(sql`
      INSERT INTO records (id, artist_id, title, spine_colour)
      VALUES (${id}::uuid, ${artist.id}::uuid, ${title}, ${colour})
      ON CONFLICT (id) DO UPDATE SET spine_colour = EXCLUDED.spine_colour`);
  }

  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/wall/probe/sheet');
  await page.locator('[data-sheet-tile]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);

  await page.screenshot({ path: 'docs/record-detail/construction/sheet.png', fullPage: true });
});
