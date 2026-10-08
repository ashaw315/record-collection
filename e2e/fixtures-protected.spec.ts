import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist, trackRecord } from './cleanup';
import { readSeventeen } from './seventeen';
import { getTestDb } from '../test/helpers/db';
import { login } from './sign-in';

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

  test('…and its cleanup removed nothing: not the seventeen, not their artist, and not even its own record', async () => {
    const db = getTestDb();
    /*
      Tracking the run-level artist deletes NOTHING, by design: the four specs
      that create a record of their own under MGMT held it for 3 to 60 seconds
      while any other tracker's afterEach could remove it (layout-sweep's
      sweeps are where §5.5's floor and §30's ceiling were measured). A
      careless spec now leaks its own row for the run rather than deleting
      another spec's; `trackRecord` is the path that cleans.
    */
    const own = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM records WHERE id = ${ownRecordId}::uuid`);
    expect(Number(own.rows[0].n), 'tracking the run-level artist does not delete by artist').toBe(1);
    expect(await countSeventeen()).toEqual({ records: 17, withPressing: 17, withCover: 17 });
    const artist = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM artists WHERE id = ${artistId}::uuid`);
    expect(Number(artist.rows[0].n), 'the seventeen’s artist survives').toBe(1);
    trackRecord(ownRecordId);
  });
});

/**
 * **The ledger: a spec cleans what it created, by id.** Two records under the
 * run-level artist, one tracked; the other stands in for a record another spec
 * is still reading. Fails against a `trackRecord` that deletes nothing, and
 * against one that deletes by the record's artist.
 */
test.describe.serial('a spec that tracks its own record by id', () => {
  let tracked = '';
  let untracked = '';

  test('creates two records under the run-level artist and tracks one', async ({ page }) => {
    await login(page);
    const artist = await (await page.request.post('/api/artists', { data: { name: 'MGMT' } })).json();
    const artistId = (artist.id ?? artist.error?.existingId) as string;
    const mk = async (title: string) => ((await (await page.request.post('/api/records', { data: { artistId, title, releaseYear: 2024 } })).json()).id as string);
    tracked = await mk('Ledger Tracked');
    untracked = await mk('Ledger Untracked');
    expect(tracked && untracked, 'both records exist').toBeTruthy();
    trackRecord(tracked);
  });

  test('…and its cleanup removed the tracked record and left the other', async () => {
    const db = getTestDb();
    const count = async (id: string) => Number((await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM records WHERE id = ${id}::uuid`)).rows[0].n);
    expect(await count(tracked), 'the tracked record is gone').toBe(0);
    expect(await count(untracked), 'the untracked record survives').toBe(1);
    trackRecord(untracked);
  });
});

/**
 * **Each of the seventeen is seeded under its own artist, and a name is one
 * row.** Until 29 Sep all seventeen sat under one stand-in, MGMT, which left
 * §45's pair term inert (a four-character artist never wraps). The artists are
 * found or created by name from the capture; two specs posting the same name
 * together get one row, because the API returns `existingId` on the unique
 * violation, and cleanup keeps an artist that still has records. This holds
 * both, on a seventeen artist no spec posts for itself.
 */
test('the seventeen are seeded under their own artists, one row per name', async () => {
  const db = getTestDb();
  for (const r of seventeen) {
    const got = await db.execute<{ name: string; rows: string }>(sql`SELECT a.name, (SELECT count(*)::text FROM artists x WHERE x.name = a.name) AS rows FROM records r JOIN artists a ON a.id = r.artist_id WHERE r.id = ${r.id}::uuid`);
    expect(got.rows[0]?.name, `${r.title}: seeded under its own artist`).toBe(r.artist);
    expect(Number(got.rows[0]?.rows), `${r.title}: one artist row named ${r.artist}`).toBe(1);
  }
});

test.describe.serial('a spec that posts and tracks one of the seventeen’s artists', () => {
  const steely = () => seventeen.find((r) => r.title === 'Gaucho');
  let artistId = '';
  test('gets the seeded row back, not a second one, and tracks it', async ({ page }) => {
    const r = steely();
    if (!r) throw new Error('no Gaucho');
    await login(page);
    const posted = await (await page.request.post('/api/artists', { data: { name: r.artist } })).json();
    artistId = (posted.id ?? posted.error?.existingId) as string;
    const count = await getTestDb().execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM artists WHERE name = ${r.artist}`);
    expect(Number(count.rows[0].n), 'still one row').toBe(1);
    trackArtist(artistId);
  });
  test('…and its cleanup left the artist and the record', async () => {
    const r = steely();
    if (!r) throw new Error('no Gaucho');
    const db = getTestDb();
    const artist = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM artists WHERE id = ${artistId}::uuid`);
    expect(Number(artist.rows[0].n), `${r.artist} survives a spec that tracked it`).toBe(1);
    const record = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM records WHERE id = ${r.id}::uuid`);
    expect(Number(record.rows[0].n), 'and so does Gaucho').toBe(1);
  });
});
