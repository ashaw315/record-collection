import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { PATCH } from '@/app/api/artists/match-candidates/[id]/route';
import { artists } from '@/db/schema';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §4.3 — `PATCH /api/artists/match-candidates/:id`, the /manage review.
 *
 * **This endpoint had no tests, and that is why its error handling was wrong.**
 * It wrapped every throw from `mergeArtists` in `409 MERGE_REFUSED` and put the
 * raw message in front of the user, so a Postgres constraint violation rendered
 * as `Failed query: INSERT INTO artist_memberships ...` styled as a considered
 * business answer. §4.3's genuine refusal and a fault are different things and
 * the tests below hold them apart.
 */

const db = getTestDb();

const UNUSED_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const DBEAT = '0c9bfbdc-4e64-497d-bf80-5c891e6766a3';
const OTHER = 'a2ceee73-7a27-4ebf-96af-471140fb5a42';

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

function request(id: string, body: unknown) {
  return new Request(`http://test/api/artists/match-candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const call = (id: string, body: unknown) => PATCH(request(id, body), { params: Promise.resolve({ id }) });

/** A candidate pair: `artistId` is the newcomer, `candidateArtistId` the local row. */
async function candidatePair(options: { survivorMbid?: string; loserMbid?: string } = {}) {
  const [survivor] = await db
    .insert(artists)
    .values({ name: 'Discharge', musicbrainzId: options.survivorMbid ?? null })
    .returning();
  const [loser] = await db
    .insert(artists)
    .values({ name: 'Discharge', musicbrainzId: options.loserMbid ?? null })
    .returning();

  const [row] = (
    await db.execute<{ id: string }>(sql`
      INSERT INTO artist_match_candidates (artist_id, candidate_artist_id, reason)
      VALUES (${loser.id}, ${survivor.id}, 'name_match_no_mbid')
      RETURNING id
    `)
  ).rows;

  return { survivor, loser, candidateId: row.id };
}

describe('PATCH match-candidates — happy path', () => {
  it('merges the pair and deletes the losing artist', async () => {
    const { candidateId } = await candidatePair({ survivorMbid: DBEAT });

    const response = await call(candidateId, { resolution: 'merged' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, merged: true });

    const remaining = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM artists`);
    expect(remaining.rows[0].n, 'the loser is gone').toBe(1);
  });

  it('records "distinct" without deleting anything', async () => {
    const { candidateId } = await candidatePair();

    const response = await call(candidateId, { resolution: 'distinct' });

    expect(response.status).toBe(200);
    const remaining = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM artists`);
    expect(remaining.rows[0].n).toBe(2);
  });
});

describe('PATCH match-candidates — a RULE refusal is not a fault', () => {
  it('answers 409 MERGE_REFUSED with §4.3 sentence when both carry an MBID', async () => {
    /**
     * §4.3's real refusal: MusicBrainz has already said these are two artists.
     * The user must read WHY, so the message is asserted, not just the status.
     */
    const { candidateId } = await candidatePair({ survivorMbid: DBEAT, loserMbid: OTHER });

    const response = await call(candidateId, { resolution: 'merged' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('MERGE_REFUSED');
    expect(body.error.message).toMatch(/different MusicBrainz ids/i);
  });

  it('does NOT dress an unexpected failure up as a business refusal', async () => {
    /**
     * **The defect this file was written for.** Any throw used to become
     * `409 MERGE_REFUSED` carrying `error.message` verbatim, so a constraint
     * violation reached the user as `Failed query: INSERT INTO ...` presented
     * as an answer — and the 409 told the caller it was a considered decision
     * rather than a bug worth reporting.
     *
     * A fault must surface as a 500 with no internals (§5, CLAUDE.md §6).
     */
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { candidateId } = await candidatePair({ survivorMbid: DBEAT });

    const boom = new Error('Failed query: INSERT INTO artist_memberships (…) VALUES (…)');
    const merge = await import('@/lib/db/queries/merge-artists');
    vi.spyOn(merge, 'mergeArtists').mockRejectedValueOnce(boom);

    const response = await call(candidateId, { resolution: 'merged' });
    const body = await response.json();

    expect(response.status, 'a fault is a 500, not a 409').toBe(500);
    expect(JSON.stringify(body), 'no SQL reaches the client').not.toMatch(/INSERT INTO/);
  });
});

describe('PATCH match-candidates — validation failure', () => {
  it('rejects a non-uuid id', async () => {
    const response = await call('not-a-uuid', { resolution: 'merged' });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown resolution', async () => {
    const { candidateId } = await candidatePair();
    const response = await call(candidateId, { resolution: 'maybe' });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown key', async () => {
    const { candidateId } = await candidatePair();
    const response = await call(candidateId, { resolution: 'distinct', extra: 1 });
    expect(response.status).toBe(400);
  });
});

describe('PATCH match-candidates — not found', () => {
  it('404s for a candidate that does not exist', async () => {
    const response = await call(UNUSED_UUID, { resolution: 'merged' });
    expect(response.status).toBe(404);
  });
});

describe('PATCH match-candidates — unauthenticated access', () => {
  it('sits behind the session middleware', () => {
    const path = '/api/artists/match-candidates/x';
    expect(middlewareRuns(path)).toBe(true);
    expect(routeAuthMode(path)).toBe('session');
  });
});
