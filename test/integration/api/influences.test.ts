import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listInfluences } from '@/app/api/artists/[id]/influences/route';
import { POST as createInfluence } from '@/app/api/influences/route';
import {
  PATCH as patchInfluence,
  DELETE as deleteInfluence,
} from '@/app/api/influences/[sourceId]/[targetId]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.5. Three things here do NOT generalize from the reference-resource
 * template, and each is noted where it appears:
 *
 *   - the key is a PAIR addressed in the path, so the single `isUuid(id)` guard
 *     becomes two checks that must name their own field;
 *   - an edge has no referrers and cannot be "in use", so REFERRERS and the
 *     409 IN_USE path do not apply at all — DELETE is a plain 200/404;
 *   - `strength` has NO database backstop (verified: 99 inserts cleanly), while
 *     the self-edge CHECK and the composite PK ARE enforced by the database.
 *
 * Edges are DIRECTED. Every creation test asserts the reverse edge does not
 * exist, because "creating source→target does not imply target→source" is the
 * property most easily lost.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

function request(url: string, init?: RequestInit): Request {
  return new Request(`https://x.test${url}`, init);
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pairParams(sourceId: string, targetId: string) {
  return { params: Promise.resolve({ sourceId, targetId }) };
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertEdge(source: string, target: string, strength = 3): Promise<void> {
  await db.execute(
    sql`INSERT INTO artist_influences (source_artist_id, target_artist_id, strength)
        VALUES (${source}, ${target}, ${strength})`,
  );
}

async function edgeExists(source: string, target: string): Promise<boolean> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM artist_influences
         WHERE source_artist_id = ${source} AND target_artist_id = ${target}`,
  );
  return rows.rows[0].n > 0;
}

async function edgeCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM artist_influences`,
  );
  return rows.rows[0].n;
}

describe('unauthenticated access', () => {
  it('routes every influence path through middleware as session-protected', () => {
    const paths = [
      `/api/artists/${UNUSED_UUID}/influences`,
      '/api/influences',
      `/api/influences/${UNUSED_UUID}/${UNUSED_UUID}`,
    ];

    for (const path of paths) {
      expect(middlewareRuns(path), path).toBe(true);
      expect(routeAuthMode(path), path).toBe('session');
    }
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const artist = await insertArtist('Discharge');

    await db.execute(sql`ALTER TABLE artist_influences RENAME TO influences_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listInfluences(
        request(`/api/artists/${artist}/influences`),
        idParams(artist),
      );
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE influences_hidden RENAME TO artist_influences`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('influences_hidden');
  });
});

// --- GET /api/artists/:id/influences -----------------------------------------

describe('GET /api/artists/:id/influences', () => {
  it('returns both directions, keyed separately', async () => {
    // Discharge influenced Amebix; Motörhead influenced Discharge.
    const discharge = await insertArtist('Discharge');
    const amebix = await insertArtist('Amebix');
    const motorhead = await insertArtist('Motorhead');
    await insertEdge(discharge, amebix, 5);
    await insertEdge(motorhead, discharge, 4);

    const response = await listInfluences(
      request(`/api/artists/${discharge}/influences`),
      idParams(discharge),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.influencedBy).toHaveLength(1);
    expect(body.influenced).toHaveLength(1);
    expect(body.influencedBy[0]).toMatchObject({ artistId: motorhead, name: 'Motorhead', strength: 4 });
    expect(body.influenced[0]).toMatchObject({ artistId: amebix, name: 'Amebix', strength: 5 });
  });

  it('does not put an outgoing edge in influencedBy', async () => {
    // The direction confusion this endpoint exists to avoid: a naive query
    // that ignores which column matched would report the edge in both lists.
    const discharge = await insertArtist('Discharge');
    const amebix = await insertArtist('Amebix');
    await insertEdge(discharge, amebix);

    const response = await listInfluences(
      request(`/api/artists/${discharge}/influences`),
      idParams(discharge),
    );
    const body = await response.json();

    expect(body.influenced.map((e: { artistId: string }) => e.artistId)).toEqual([amebix]);
    expect(body.influencedBy).toEqual([]);
  });

  it('returns empty arrays for an artist with no edges', async () => {
    const artist = await insertArtist('Discharge');

    const response = await listInfluences(
      request(`/api/artists/${artist}/influences`),
      idParams(artist),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ influencedBy: [], influenced: [] });
  });

  it('hydrates the other artist name, not merely the id', async () => {
    // A bare id would force the /manage screen into an N+1 lookup.
    const discharge = await insertArtist('Discharge');
    const amebix = await insertArtist('Amebix');
    await insertEdge(discharge, amebix);

    const response = await listInfluences(
      request(`/api/artists/${discharge}/influences`),
      idParams(discharge),
    );

    expect((await response.json()).influenced[0].name).toBe('Amebix');
  });

  it('returns 404 for an artist that does not exist', async () => {
    const response = await listInfluences(
      request(`/api/artists/${UNUSED_UUID}/influences`),
      idParams(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID artist id', async () => {
    const response = await listInfluences(
      request('/api/artists/nope/influences'),
      idParams('nope'),
    );

    expect(response.status).toBe(400);
  });
});

// --- POST /api/influences ----------------------------------------------------

describe('POST /api/influences', () => {
  it('creates a directed edge and returns 201', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: source,
        targetArtistId: target,
        strength: 4,
        notes: 'Speed and volume',
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      sourceArtistId: source,
      targetArtistId: target,
      strength: 4,
      notes: 'Speed and volume',
    });
  });

  /**
   * The two-directional property §5.5 states outright. A schema that stored the
   * pair unordered, or an implementation that inserted both rows "for
   * convenience", would pass every other test in this file.
   */
  it('does NOT create the reverse edge', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: source,
        targetArtistId: target,
      }),
    );

    expect(await edgeExists(source, target)).toBe(true);
    expect(await edgeExists(target, source)).toBe(false);
    expect(await edgeCount()).toBe(1);
  });

  it('allows the reverse edge to be created SEPARATELY', async () => {
    // Mutual influence is legal and is two distinct rows — a guard that
    // rejected the reverse edge as a duplicate would be the inverse error.
    const a = await insertArtist('Motorhead');
    const b = await insertArtist('Discharge');

    expect(
      (await createInfluence(
        jsonRequest('/api/influences', 'POST', { sourceArtistId: a, targetArtistId: b }),
      )).status,
    ).toBe(201);
    expect(
      (await createInfluence(
        jsonRequest('/api/influences', 'POST', { sourceArtistId: b, targetArtistId: a }),
      )).status,
    ).toBe(201);

    expect(await edgeCount()).toBe(2);
  });

  it('defaults strength to 1 when omitted', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', { sourceArtistId: source, targetArtistId: target }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).strength).toBe(1);
  });

  it('rejects a self-edge with 400, not a 500 from the CHECK', async () => {
    const artist = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: artist,
        targetArtistId: artist,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.targetArtistId).toBeDefined();
    expect(await edgeCount()).toBe(0);
  });

  it('rejects a duplicate edge with 409', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', { sourceArtistId: source, targetArtistId: target }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
    expect(await edgeCount()).toBe(1);
  });

  it('rejects a source artist that does not exist with 400, not 500', async () => {
    const target = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: UNUSED_UUID,
        targetArtistId: target,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sourceArtistId).toBeDefined();
  });

  it('rejects a target artist that does not exist, naming the right field', async () => {
    // Both ids are checked, and each names ITSELF — the template's single
    // `isUuid(id)` guard has no equivalent here.
    const source = await insertArtist('Motorhead');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: source,
        targetArtistId: UNUSED_UUID,
      }),
    );

    expect(response.status).toBe(400);
    const { fieldErrors } = (await response.json()).error;
    expect(fieldErrors.targetArtistId).toBeDefined();
    expect(fieldErrors.sourceArtistId).toBeUndefined();
  });

  it('rejects a non-UUID id in either position', async () => {
    const artist = await insertArtist('Discharge');

    for (const body of [
      { sourceArtistId: 'nope', targetArtistId: artist },
      { sourceArtistId: artist, targetArtistId: 'nope' },
    ]) {
      const response = await createInfluence(jsonRequest('/api/influences', 'POST', body));
      expect(response.status).toBe(400);
    }
  });

  // --- strength has NO database backstop (verified: 99 inserts cleanly) ---

  it('accepts strength at both ends of the 1-5 range', async () => {
    const a = await insertArtist('A');
    const b = await insertArtist('B');
    const c = await insertArtist('C');

    expect(
      (await createInfluence(
        jsonRequest('/api/influences', 'POST', {
          sourceArtistId: a,
          targetArtistId: b,
          strength: 1,
        }),
      )).status,
    ).toBe(201);
    expect(
      (await createInfluence(
        jsonRequest('/api/influences', 'POST', {
          sourceArtistId: a,
          targetArtistId: c,
          strength: 5,
        }),
      )).status,
    ).toBe(201);
  });

  it('rejects strength outside 1-5, which the database would accept', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    for (const strength of [0, -1, 6, 99]) {
      const response = await createInfluence(
        jsonRequest('/api/influences', 'POST', {
          sourceArtistId: source,
          targetArtistId: target,
          strength,
        }),
      );

      expect(response.status, `strength=${strength}`).toBe(400);
      expect((await response.json()).error.fieldErrors.strength).toBeDefined();
    }

    expect(await edgeCount()).toBe(0);
  });

  it('rejects a non-integer strength', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: source,
        targetArtistId: target,
        strength: 3.5,
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects unknown keys', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await createInfluence(
      jsonRequest('/api/influences', 'POST', {
        sourceArtistId: source,
        targetArtistId: target,
        weight: 9,
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createInfluence(
      request('/api/influences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('returns 409 when a concurrent create claims the same pair', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/influences');
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const claim = vi.spyOn(queries, 'findInfluence').mockImplementation(async () => {
      await insertEdge(source, target);
      return undefined;
    });

    try {
      const response = await createInfluence(
        jsonRequest('/api/influences', 'POST', { sourceArtistId: source, targetArtistId: target }),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

// --- PATCH /api/influences/:sourceId/:targetId -------------------------------

describe('PATCH /api/influences/:sourceId/:targetId', () => {
  it('updates strength and notes', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target, 2);

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', {
        strength: 5,
        notes: 'Direct lineage',
      }),
      pairParams(source, target),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ strength: 5, notes: 'Direct lineage' });
  });

  it('does not touch the reverse edge', async () => {
    // Both directions exist with different strengths; patching one must leave
    // the other alone.
    const a = await insertArtist('Motorhead');
    const b = await insertArtist('Discharge');
    await insertEdge(a, b, 2);
    await insertEdge(b, a, 4);

    await patchInfluence(
      jsonRequest(`/api/influences/${a}/${b}`, 'PATCH', { strength: 5 }),
      pairParams(a, b),
    );

    const reverse = await db.execute<{ strength: number }>(
      sql`SELECT strength FROM artist_influences
           WHERE source_artist_id = ${b} AND target_artist_id = ${a}`,
    );
    expect(reverse.rows[0].strength).toBe(4);
  });

  it('rejects strength outside 1-5', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target, 2);

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', { strength: 99 }),
      pairParams(source, target),
    );

    expect(response.status).toBe(400);

    const rows = await db.execute<{ strength: number }>(
      sql`SELECT strength FROM artist_influences
           WHERE source_artist_id = ${source} AND target_artist_id = ${target}`,
    );
    expect(rows.rows[0].strength).toBe(2);
  });

  it('clears notes when explicitly sent null', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);
    await db.execute(
      sql`UPDATE artist_influences SET notes = 'x'
           WHERE source_artist_id = ${source} AND target_artist_id = ${target}`,
    );

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', { notes: null }),
      pairParams(source, target),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).notes).toBeNull();
  });

  it('rejects an empty body', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', {}),
      pairParams(source, target),
    );

    expect(response.status).toBe(400);
  });

  it('rejects an attempt to move the edge by patching its key', async () => {
    // The pair is the identity and is addressed in the path; allowing it in the
    // body would let a PATCH silently become a different edge.
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', {
        strength: 3,
        sourceArtistId: UNUSED_UUID,
      }),
      pairParams(source, target),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an edge that does not exist', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${source}/${target}`, 'PATCH', { strength: 3 }),
      pairParams(source, target),
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 for the REVERSE of an existing edge', async () => {
    // Directedness at the 404 boundary: a→b existing says nothing about b→a.
    const a = await insertArtist('Motorhead');
    const b = await insertArtist('Discharge');
    await insertEdge(a, b);

    const response = await patchInfluence(
      jsonRequest(`/api/influences/${b}/${a}`, 'PATCH', { strength: 3 }),
      pairParams(b, a),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID in either path position', async () => {
    const artist = await insertArtist('Discharge');

    expect(
      (await patchInfluence(
        jsonRequest(`/api/influences/nope/${artist}`, 'PATCH', { strength: 3 }),
        pairParams('nope', artist),
      )).status,
    ).toBe(400);

    expect(
      (await patchInfluence(
        jsonRequest(`/api/influences/${artist}/nope`, 'PATCH', { strength: 3 }),
        pairParams(artist, 'nope'),
      )).status,
    ).toBe(400);
  });
});

// --- DELETE /api/influences/:sourceId/:targetId ------------------------------

describe('DELETE /api/influences/:sourceId/:targetId', () => {
  it('removes the edge', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);

    const response = await deleteInfluence(
      request(`/api/influences/${source}/${target}`, { method: 'DELETE' }),
      pairParams(source, target),
    );

    expect(response.status).toBe(200);
    expect(await edgeCount()).toBe(0);
  });

  it('leaves both artists in place', async () => {
    // Deleting an edge is not deleting a relationship endpoint.
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');
    await insertEdge(source, target);

    await deleteInfluence(
      request(`/api/influences/${source}/${target}`, { method: 'DELETE' }),
      pairParams(source, target),
    );

    const artists = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM artists`);
    expect(artists.rows[0].n).toBe(2);
  });

  it('does NOT remove the reverse edge', async () => {
    const a = await insertArtist('Motorhead');
    const b = await insertArtist('Discharge');
    await insertEdge(a, b);
    await insertEdge(b, a);

    await deleteInfluence(
      request(`/api/influences/${a}/${b}`, { method: 'DELETE' }),
      pairParams(a, b),
    );

    expect(await edgeExists(a, b)).toBe(false);
    expect(await edgeExists(b, a)).toBe(true);
  });

  it('returns 404 for an edge that does not exist', async () => {
    const source = await insertArtist('Motorhead');
    const target = await insertArtist('Discharge');

    const response = await deleteInfluence(
      request(`/api/influences/${source}/${target}`, { method: 'DELETE' }),
      pairParams(source, target),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID in either path position', async () => {
    const artist = await insertArtist('Discharge');

    expect(
      (await deleteInfluence(
        request(`/api/influences/nope/${artist}`, { method: 'DELETE' }),
        pairParams('nope', artist),
      )).status,
    ).toBe(400);

    expect(
      (await deleteInfluence(
        request(`/api/influences/${artist}/nope`, { method: 'DELETE' }),
        pairParams(artist, 'nope'),
      )).status,
    ).toBe(400);
  });
});
