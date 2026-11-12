import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { listRecords } from '@/lib/db/queries/records';
import { storeReleaseText } from '@/lib/discogs/release-text-store';
import type { Offset } from '@/lib/api/query-params';
import { getTestDb, truncateAll } from '../helpers/db';

/**
 * **§66: search reaches the barcode by its digits, through a record's current pressing (Design, 11 Nov; the
 * coordinator, 12 Nov: "Search matches records, and a hit has to be one the reader can be shown. An orphaned
 * pressing belongs to no record and has no page, so it can never be a hit").** A typed barcode matches with or
 * without its spaces and dashes, and so does the stored one: both sides are compared by their digits (the
 * coordinator, 12 Nov). Each case fails against a search that compares the typed string as written, that reaches a
 * pressing no record is on, or that lets a barcode's digits match a title or a credit by likeness.
 */
const PAYLOAD = { title: 'A Record', identifiers: [{ type: 'Barcode', value: '8 43563-19772 1', description: 'Printed' }], tracklist: [{ position: 'A1', title: 'Opening' }] };
const RELEASE = 36516553;

async function seed(): Promise<{ onIt: string; offIt: string }> {
  const db = getTestDb();
  const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Barcode Band') RETURNING id`)).rows;
  await db.execute(sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at) VALUES (${RELEASE}, ${JSON.stringify({ ...PAYLOAD, id: RELEASE })}::jsonb, now())`);
  await storeReleaseText(RELEASE, { ...PAYLOAD, id: RELEASE });
  const [current] = (await db.execute<{ id: string }>(sql`INSERT INTO pressings (discogs_release_id, catalog_number) VALUES (${RELEASE}, 'CUR-1') RETURNING id`)).rows;
  /* A second pressing of the same release that no record is on any more: an orphan, which can never be a hit. */
  await db.execute(sql`INSERT INTO pressings (catalog_number, matrix_runout) VALUES ('ORPHAN-1', 'ORPHAN')`);
  const [onIt] = (await db.execute<{ id: string }>(sql`INSERT INTO records (title, artist_id, pressing_id) VALUES ('On The Pressing', ${artist.id}::uuid, ${current.id}::uuid) RETURNING id`)).rows;
  const [offIt] = (await db.execute<{ id: string }>(sql`INSERT INTO records (title, artist_id) VALUES ('Off Any Pressing', ${artist.id}::uuid) RETURNING id`)).rows;
  return { onIt: onIt.id, offIt: offIt.id };
}

const search = async (q: string) => (await listRecords({ limit: 50, offset: 0 as Offset, filters: { q } })).rows.map((row) => row.id);

describe('search by barcode (§66)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('finds the record on the pressing by the barcode typed with or without its spaces and dashes, and not the record off it', async () => {
    const { onIt, offIt } = await seed();
    for (const typed of ['843563197721', '8 43563 19772 1', '8-43563-19772-1', ' 8 43563-19772 1 ']) {
      const found = await search(typed);
      expect(found, typed).toContain(onIt);
      expect(found, typed).not.toContain(offIt);
    }
  });

  it('matches the whole barcode and never a part of it, so a year or a catalogue number’s digits reach no barcode', async () => {
    const { onIt } = await seed();
    expect(await search('19772')).not.toContain(onIt);
    expect(await search('1982')).not.toContain(onIt);
  });

  it('still reaches the release’s tracklist by likeness, so the barcode row changed nothing else', async () => {
    const { onIt } = await seed();
    expect(await search('Opening')).toContain(onIt);
  });
});
