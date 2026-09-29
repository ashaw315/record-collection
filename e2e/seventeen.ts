import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';

/** One captured record: the fixed id every spec addresses it by, its title, its real About and its journal entries. */
export type SeventeenRow = { id: string; title: string; about: string | null; entries: Array<{ entryDate: string; note: string }> };

/** The seventeen real records, from the capture every spec reads. */
export function readSeventeen(): SeventeenRow[] {
  return JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8')) as SeventeenRow[];
}

/**
 * **Seed the seventeen ONCE per run, from global setup, under the artist MGMT.**
 *
 * Before this, three specs seeded them by fixed id "if absent" and six specs
 * tracked MGMT for cleanup, whose afterEach deleted every MGMT record -- so
 * whichever of those tests finished during another spec's read turned the
 * seventeen into 404s (the §43 diagnosis of 28 Sep: 63 and 93 "never painted"
 * findings that were all missing pages). A run-level fixture has no owner to
 * clean it up; `cleanup.ts` refuses to delete these ids and their artist.
 *
 * The shape is the superset the seeders used (real-records-paint's): label,
 * pressing, six genres, a cover, spine colour, purchase price, notes, the real
 * About as the snippet, two price rows and the journal entries. The API is used
 * where a spec would use it, over `fetch` with the login cookie, because global
 * setup has no page. Records and images are raw SQL rather than `seed.ts`:
 * that module imports the schema through the `@/` alias, which Playwright's
 * global-setup loader does not resolve (specs do).
 */
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

export async function seedSeventeen(opts: { base: string; password: string }): Promise<void> {
  const login = await fetch(`${opts.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: opts.password }), redirect: 'manual' });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (cookie === '') throw new Error(`seedSeventeen: login gave no cookie (status ${login.status})`);
  const post = async (path: string, data: unknown): Promise<string> => {
    const res = await fetch(`${opts.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(data) });
    const j = (await res.json()) as { id?: string; error?: { existingId?: string } };
    const id = j.id ?? j.error?.existingId;
    if (id === undefined) throw new Error(`seedSeventeen: POST ${path} gave ${res.status} and no id`);
    return id;
  };

  const artistId = await post('/api/artists', { name: 'MGMT' });
  const labelId = await post('/api/labels', { name: 'Mom + Pop' });
  const pressingId = await post('/api/pressings', { catalogNumber: 'MP731', matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media', colorVariant: 'Orange [Tangerine]' });
  const genreIds: string[] = [];
  for (const g of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) genreIds.push(await post('/api/genres', { name: g }));

  const db = getTestDb();
  for (const r of readSeventeen()) {
    const existing = await db.execute<{ id: string }>(sql`SELECT id FROM records WHERE id = ${r.id}::uuid`);
    if (existing.rows.length > 0) continue;
    await db.execute(sql`INSERT INTO records (id, artist_id, title, label_id, pressing_id, release_year) VALUES (${r.id}::uuid, ${artistId}::uuid, ${r.title}, ${labelId}::uuid, ${pressingId}::uuid, 2024)`);
    for (const genreId of genreIds) await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${r.id}::uuid, ${genreId}::uuid)`);
    await db.execute(sql`INSERT INTO images (record_id, url, image_type) VALUES (${r.id}::uuid, ${ONE_PIXEL_PNG}, 'cover')`);
    const about = r.about !== null && r.about.trim() !== '' ? r.about.trim() : null;
    await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99, notes = 'Bought on the Saturday.', snippet = ${about}, snippet_edited_at = ${about === null ? null : new Date()} WHERE id = ${r.id}::uuid`);
    await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${r.id}::uuid, 12.99, 'used', 'discogs'), (${r.id}::uuid, 13.42, 'used', 'discogs')`);
    for (const e of r.entries ?? []) {
      const res = await fetch(`${opts.base}/api/records/${r.id}/journal`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ entryDate: e.entryDate, note: e.note }) });
      if (!res.ok) throw new Error(`seedSeventeen: journal entry for ${r.title} gave ${res.status}`);
    }
  }
}
