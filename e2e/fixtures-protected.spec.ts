import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { readSeventeen } from './seventeen';
import { getTestDb } from '../test/helpers/db';

registerCleanup();

/**
 * **The seventeen are a RUN-LEVEL fixture, and no spec's cleanup may remove
 * them.**
 *
 * Found by diagnosis on 28 Sep: `registerCleanup` deletes every record of every
 * tracked artist, the artist MGMT is found-or-created, and six specs tracked
 * it. Any of their tests finishing while §43's six-minute loop was reading the
 * seventeen turned the page into a 404 -- 63 and 93 "never painted" findings
 * on two attempts, 0 on the run that measured step 51, all the same race with
 * different overlap. Ownership by creator does not help: three specs seed the
 * seventeen by fixed id "if absent", so the first to arrive would own them and
 * still delete them under the other two.
 *
 * The serial pair below is ONE scenario: the first test tracks the seventeen's
 * artist exactly as a careless spec does, and the second reads what its
 * cleanup left. Serial because the config is `fullyParallel`, which put the
 * reader in a second worker before the tracker had run (found in the first
 * full run: the reader failed in 9ms, both attempts). They fail against
 * `cleanup.ts` deleting by artist alone, and against `global-setup.ts` not
 * seeding.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const seventeen = readSeventeen();
const ids = seventeen.map((r) => r.id);
/* A Postgres array literal: Drizzle expands a JS array into a row constructor, which `= ANY` rejects. */
const idArray = `{${ids.join(',')}}`;

async function countSeventeen(): Promise<{ records: number; withPressing: number; withCover: number }> {
  const db = getTestDb();
  const r = await db.execute<{ records: string; with_pressing: string; with_cover: string }>(sql`
    SELECT count(*)::text AS records,
           count(pressing_id)::text AS with_pressing,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM images i WHERE i.record_id = records.id AND i.image_type = 'cover'))::text AS with_cover
      FROM records WHERE id = ANY(${idArray}::uuid[])`);
  return { records: Number(r.rows[0].records), withPressing: Number(r.rows[0].with_pressing), withCover: Number(r.rows[0].with_cover) };
}

test('global setup seeds the seventeen, with a pressing and a cover, before any spec runs', async () => {
  expect(ids).toHaveLength(17);
  expect(await countSeventeen()).toEqual({ records: 17, withPressing: 17, withCover: 17 });
});

test.describe.serial('a spec that tracks the seventeen’s artist', () => {
  let artistId = '';
  let ownRecordId = '';

  test('creates a record of its own and tracks the artist', async ({ page }) => {
    await login(page);
    const artist = await (await page.request.post('/api/artists', { data: { name: 'MGMT' } })).json();
    artistId = (artist.id ?? artist.error?.existingId) as string;
    expect(artistId, 'the seventeen’s artist exists').toBeTruthy();
    const own = await (await page.request.post('/api/records', { data: { artistId, title: 'Cleanup Probe', releaseYear: 2024 } })).json();
    ownRecordId = own.id as string;
    expect(ownRecordId).toBeTruthy();
    trackArtist(artistId);
  });

  test('…and its cleanup removed its own record but not the seventeen nor their artist', async () => {
    const db = getTestDb();
    const own = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM records WHERE id = ${ownRecordId}::uuid`);
    expect(Number(own.rows[0].n), 'the spec’s own record is cleaned up').toBe(0);
    expect(await countSeventeen()).toEqual({ records: 17, withPressing: 17, withCover: 17 });
    const artist = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM artists WHERE id = ${artistId}::uuid`);
    expect(Number(artist.rows[0].n), 'the seventeen’s artist survives').toBe(1);
  });
});
