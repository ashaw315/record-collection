import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, artistMemberships } from '@/db/schema';
import { GET } from '@/app/api/artists/[id]/lineup/progress/route';

/**
 * SPEC.md §12 step 11 (A54) — the progress count is PEOPLE, like the sentence.
 *
 * **The number Adam watched climb to 32 for a seven-person band.** The endpoint
 * counted membership ROWS, and MusicBrainz records one relation per instrument
 * per stint — so the progress bar and the completion text disagreed about the
 * same walk, and the bar was the one he was reading while it ran.
 *
 * Third site of relations-versus-people in one feature: the `original`
 * attribute, the completion text, and here.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const call = async (id: string) =>
  GET(new Request(`http://localhost/api/artists/${id}/lineup/progress`), {
    params: Promise.resolve({ id }),
  });

describe('GET /api/artists/:id/lineup/progress (A54)', () => {
  /**
   * Fails against `memberships.length` — the shipped behaviour — which reports 3
   * for one person holding three instruments.
   */
  it('counts distinct people, not membership rows', async () => {
    const [band] = await db.insert(artists).values({ name: 'MGMT' }).returning();
    const [person] = await db.insert(artists).values({ name: 'Will Berman' }).returning();

    for (const instrument of ['drums (drum set)', 'percussion', 'guitar']) {
      await db.insert(artistMemberships).values({
        personArtistId: person.id,
        groupArtistId: band.id,
        instrument,
      });
    }

    const body = await (await call(band.id)).json();

    expect(body.found, 'one person, however many instruments').toBe(1);
  });

  it('counts two people as two', async () => {
    const [band] = await db.insert(artists).values({ name: 'MGMT' }).returning();
    const [a] = await db.insert(artists).values({ name: 'Ben Goldwasser' }).returning();
    const [b] = await db.insert(artists).values({ name: 'Andrew VanWyngarden' }).returning();

    for (const person of [a, b]) {
      for (const instrument of ['keyboards', 'guitar']) {
        await db.insert(artistMemberships).values({
          personArtistId: person.id,
          groupArtistId: band.id,
          instrument,
        });
      }
    }

    const body = await (await call(band.id)).json();

    expect(body.found).toBe(2);
  });

  it('reports zero for a band with no memberships yet', async () => {
    const [band] = await db.insert(artists).values({ name: 'Unwalked' }).returning();

    const body = await (await call(band.id)).json();

    expect(body.found).toBe(0);
  });
});
