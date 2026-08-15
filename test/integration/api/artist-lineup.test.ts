import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists } from '@/db/schema';
import { POST as walkArtist } from '@/app/api/artists/[id]/lineup/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';
import * as clientModule from '@/lib/musicbrainz/client';

/**
 * SPEC.md §12 step 11 and §4.3 — `POST /api/artists/:id/lineup`.
 *
 * **Every artist in the real collection is hand-entered and has no MBID**, so
 * this endpoint must search MusicBrainz by NAME first — the one thing §4.3 says
 * cannot identify an artist. It therefore has two outcomes by design:
 *
 *   unambiguous  -> walk, and WRITE the confirmed id
 *   ambiguous    -> return the candidates and walk nothing
 *
 * A user who picks from the candidates has supplied the evidence the resolver
 * lacked, which is why a chosen id may be stored where an inferred one may not.
 */

const db = getTestDb();

const DISCHARGE_A = '0c9bfbdc-4e64-497d-bf80-5c891e6766a3';
const DISCHARGE_B = 'a2ceee73-7a27-4ebf-96af-471140fb5a42';

function searchResult(hits: Array<{ id: string; name: string; score: number }>) {
  return { artists: hits.map((hit) => ({ ...hit, type: 'Group', country: 'GB' })) };
}

/** Search returns `hits`; every artist lookup returns an empty lineup. */
function mockMusicBrainz(hits: ReturnType<typeof searchResult>, relations: unknown[] = []) {
  const get = vi.fn(async (path: string) => {
    if (path.includes('query=')) return hits;
    return { id: 'x', name: 'x', relations };
  });

  vi.spyOn(clientModule, 'getMusicBrainzClient').mockReturnValue({
    get: get as unknown as clientModule.MusicBrainzClient['get'],
  });

  return get;
}

const request = (id: string, body?: unknown) =>
  walkArtist(
    new Request(`http://test/api/artists/${id}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    { params: Promise.resolve({ id }) },
  );

async function seedArtist(name: string, musicbrainzId: string | null = null) {
  const [row] = await db.insert(artists).values({ name, musicbrainzId }).returning();
  return row;
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('an unambiguous match', () => {
  it('walks the lineup and reports what it checked (happy path)', async () => {
    const artist = await seedArtist('Hot Tuna');
    mockMusicBrainz(
      searchResult([
        { id: 'mb-hot-tuna', name: 'Hot Tuna', score: 100 },
        { id: 'mb-acoustic', name: 'Acoustic Hot Tuna', score: 78 },
      ]),
    );

    const response = await request(artist.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.walked).toBe(true);
    expect(body.total).toBe(0);
  });

  it('WRITES the confirmed MusicBrainz id to the artist', async () => {
    /**
     * §4.3: "a confirmed MBID is written; an inferred one is not." The search
     * was disambiguating, so this is a confirmation rather than a guess — and
     * storing it means every later walk matches on the id rather than searching
     * by name again.
     */
    const artist = await seedArtist('Hot Tuna');
    mockMusicBrainz(searchResult([{ id: 'mb-hot-tuna', name: 'Hot Tuna', score: 100 }]));

    await request(artist.id);

    const row = await db.execute<{ musicbrainz_id: string }>(
      sql`SELECT musicbrainz_id FROM artists WHERE id = ${artist.id}`,
    );
    expect(row.rows[0].musicbrainz_id).toBe('mb-hot-tuna');
  });

  it('skips the search entirely when the artist already has an id', async () => {
    // The id identifies the artist; searching again would risk finding a
    // different one and is a wasted request against a one-per-second budget.
    const artist = await seedArtist('Discharge', DISCHARGE_A);
    const get = mockMusicBrainz(searchResult([]));

    await request(artist.id);

    const searches = get.mock.calls.filter(([path]) => String(path).includes('query='));
    expect(searches, 'no name search at all').toHaveLength(0);
  });
});

describe('an ambiguous match — the case §4.3 exists for', () => {
  it('returns the candidates and walks NOTHING', async () => {
    /**
     * **The load-bearing test.** Two distinct UK bands are called Discharge and
     * both score 100. Walking either would attach one band's lineup to the
     * other — silently, and self-reinforcingly once the id is stored.
     */
    const artist = await seedArtist('Discharge');
    const get = mockMusicBrainz(
      searchResult([
        { id: DISCHARGE_A, name: 'Discharge', score: 100 },
        { id: DISCHARGE_B, name: 'Discharge', score: 100 },
      ]),
    );

    const response = await request(artist.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.walked, 'nothing was walked').toBe(false);
    expect(body.candidates).toHaveLength(2);

    const lookups = get.mock.calls.filter(([path]) => !String(path).includes('query='));
    expect(lookups, 'and no lineup was fetched').toHaveLength(0);
  });

  it('does NOT write an id it could not confirm', async () => {
    /**
     * The other half of §4.3's rule, and the more dangerous half: an inferred
     * id attached here would make every later walk match it, so the wrong guess
     * would stop looking like a guess.
     */
    const artist = await seedArtist('Discharge');
    mockMusicBrainz(
      searchResult([
        { id: DISCHARGE_A, name: 'Discharge', score: 100 },
        { id: DISCHARGE_B, name: 'Discharge', score: 100 },
      ]),
    );

    await request(artist.id);

    const row = await db.execute<{ musicbrainz_id: string | null }>(
      sql`SELECT musicbrainz_id FROM artists WHERE id = ${artist.id}`,
    );
    expect(row.rows[0].musicbrainz_id).toBeNull();
  });

  it('walks the id the USER chose, and stores it', async () => {
    /**
     * §4.3: "the distinction is who decided, not how confident the code is." A
     * user shown both Discharges and choosing one has supplied exactly the
     * evidence the search lacked.
     */
    const artist = await seedArtist('Discharge');
    mockMusicBrainz(
      searchResult([
        { id: DISCHARGE_A, name: 'Discharge', score: 100 },
        { id: DISCHARGE_B, name: 'Discharge', score: 100 },
      ]),
    );

    const response = await request(artist.id, { musicbrainzId: DISCHARGE_B });

    expect((await response.json()).walked).toBe(true);

    const row = await db.execute<{ musicbrainz_id: string }>(
      sql`SELECT musicbrainz_id FROM artists WHERE id = ${artist.id}`,
    );
    expect(row.rows[0].musicbrainz_id, 'the one they picked, not the first').toBe(DISCHARGE_B);
  });

  it('reports no match at all as candidates, not as an error', async () => {
    // An artist MusicBrainz has never heard of is an answer, not a failure —
    // and an empty candidate list says so without pretending to have looked
    // something up.
    const artist = await seedArtist('Some Local Band');
    mockMusicBrainz(searchResult([]));

    const response = await request(artist.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.walked).toBe(false);
    expect(body.candidates).toEqual([]);
  });
});

describe('the four cases every route needs', () => {
  it('404s for an artist that does not exist (not found)', async () => {
    mockMusicBrainz(searchResult([]));

    const response = await request('11111111-1111-4111-8111-111111111111');

    expect(response.status).toBe(404);
  });

  it('400s on a malformed id rather than treating it as missing', async () => {
    const get = mockMusicBrainz(searchResult([]));

    const response = await request('not-a-uuid');

    expect(response.status).toBe(400);
    expect(get, 'nothing was requested').not.toHaveBeenCalled();
  });

  it('rejects an unknown key rather than ignoring it (validation failure)', async () => {
    // CLAUDE.md §6: reject unknown keys. A typo'd `musicbrainzID` silently
    // ignored would walk the wrong artist and look like a bug in the search.
    const artist = await seedArtist('Hot Tuna');
    mockMusicBrainz(searchResult([]));

    const response = await request(artist.id, { musicbrainzID: DISCHARGE_A });

    expect(response.status).toBe(400);
  });

  it('is behind auth (unauthenticated)', () => {
    expect(middlewareRuns('/api/artists/x/lineup')).toBe(true);
    expect(routeAuthMode('/api/artists/x/lineup')).toBe('session');
  });

  it('surfaces a MusicBrainz outage as an upstream failure', async () => {
    const artist = await seedArtist('Hot Tuna');
    vi.spyOn(clientModule, 'getMusicBrainzClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.MusicBrainzError('unreachable', { status: 503 });
      }) as unknown as clientModule.MusicBrainzClient['get'],
    });

    const response = await request(artist.id);

    expect(response.status).toBe(503);
  });
});

describe('the MusicBrainz id is already on another local artist', () => {
  /**
   * **`artists.musicbrainz_id` is UNIQUE when present** (§4.1, partial index
   * `artists_musicbrainz_id_key`), and this endpoint wrote it with a bare
   * `updateArtist` and no recovery. So confirming an id that another row
   * already holds threw a raw Postgres unique violation, which the handler's
   * `MusicBrainzError` catch did not match — it escaped as a 500 saying
   * "Internal server error".
   *
   * **It is reachable through the app's own behaviour, not just by hand.** The
   * walk's `resolveArtist` CREATES rows carrying MBIDs for every band and
   * member it encounters. Walking Discharge can therefore mint a local row for
   * some group, and a later "Lineup" on a hand-entered row for that same group
   * confirms an id the walk has already attached elsewhere. The user sees a
   * server error for what is really a duplicate they could resolve.
   *
   * It is the same underlying situation §4.3's match-candidate review exists
   * for, so the answer is a 409 that says which artist holds it, not a 500.
   */
  it('answers 409 rather than letting the unique violation become a 500', async () => {
    const holder = await seedArtist('Discharge', DISCHARGE_A);
    const target = await seedArtist('Discharge');

    mockMusicBrainz(searchResult([{ id: DISCHARGE_A, name: 'Discharge', score: 100 }]));

    const response = await request(target.id, { musicbrainzId: DISCHARGE_A });

    expect(response.status, 'a duplicate is not a server fault').toBe(409);

    const body = await response.json();
    expect(body.error.code).toBe('DUPLICATE');
    expect(
      body.error.existingId,
      '§5.4 requires existingId on every DUPLICATE, so the client can offer the merge',
    ).toBe(holder.id);
  });

  it('leaves the target artist untouched when it refuses', async () => {
    // A refusal that had already written half of itself would be worse than the
    // 500: the row would carry an id the endpoint then said it could not take.
    await seedArtist('Discharge', DISCHARGE_A);
    const target = await seedArtist('Discharge');

    mockMusicBrainz(searchResult([{ id: DISCHARGE_A, name: 'Discharge', score: 100 }]));
    await request(target.id, { musicbrainzId: DISCHARGE_A });

    const [row] = (
      await db.execute<{ musicbrainz_id: string | null }>(
        sql`SELECT musicbrainz_id FROM artists WHERE id = ${target.id}`,
      )
    ).rows;

    expect(row.musicbrainz_id).toBeNull();
  });

  it('also refuses on the SEARCH path, not only a supplied id', async () => {
    /**
     * The id is written in two places — after an unambiguous search, and when
     * the user picks a candidate. Both call `updateArtist`, so both could
     * collide, and a fix applied to one would leave the other throwing.
     */
    const holder = await seedArtist('Discharge', DISCHARGE_A);
    const target = await seedArtist('Discharge');

    mockMusicBrainz(searchResult([{ id: DISCHARGE_A, name: 'Discharge', score: 100 }]));

    const response = await request(target.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error.existingId).toBe(holder.id);
  });
});
