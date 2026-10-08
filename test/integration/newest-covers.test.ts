import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, images, records } from '@/db/schema';
import { newestCoverUrls } from '@/lib/db/queries/images';

/**
 * Step 99, §T.5: the grid shows each record's cover, and §61 rules which
 * one a record shows: its newest. The list query carries no image, and the
 * records endpoint's shape is SPEC.md §5.2's, so the grid asks for its
 * covers separately, for the records on its page.
 */
const db = getTestDb();

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeTestDb(); });

async function record(title: string): Promise<string> {
  const [artist] = await db.insert(artists).values({ name: `Artist of ${title}` }).returning({ id: artists.id });
  const [row] = await db.insert(records).values({ title, artistId: artist.id }).returning({ id: records.id });
  return row.id;
}

const image = (recordId: string, url: string, imageType: 'cover' | 'back' | 'label', createdAt: string) =>
  db.insert(images).values({ recordId, url, imageType, createdAt: new Date(createdAt) });

describe('newestCoverUrls', () => {
  /* Fails against a query that takes the first cover, or any image: the page and the grid would show different photographs. */
  it('gives each record its newest cover, and only covers', async () => {
    const [a, b] = [await record('A'), await record('B')];
    await image(a, 'a-old', 'cover', '2026-01-01T00:00:00Z');
    await image(a, 'a-new', 'cover', '2026-03-01T00:00:00Z');
    await image(a, 'a-back-newest', 'back', '2026-06-01T00:00:00Z');
    await image(b, 'b-only', 'cover', '2026-02-01T00:00:00Z');
    const covers = await newestCoverUrls([a, b]);
    expect(Object.fromEntries(covers)).toEqual({ [a]: 'a-new', [b]: 'b-only' });
  });

  /* Fails against a query that returns a row for every record asked for. */
  it('has no entry for a record with no cover, though it has other photographs', async () => {
    const [a, b] = [await record('A'), await record('B')];
    await image(a, 'a-label', 'label', '2026-01-01T00:00:00Z');
    const covers = await newestCoverUrls([a, b]);
    expect(covers.size).toBe(0);
  });

  /* Fails against a query with no filter on the ids: a page would be handed the whole collection's covers. */
  it('answers only for the records asked about, and for none when asked about none', async () => {
    const [a, b] = [await record('A'), await record('B')];
    await image(a, 'a', 'cover', '2026-01-01T00:00:00Z');
    await image(b, 'b', 'cover', '2026-01-01T00:00:00Z');
    expect([...(await newestCoverUrls([b])).keys()]).toEqual([b]);
    expect((await newestCoverUrls([])).size).toBe(0);
  });
});
