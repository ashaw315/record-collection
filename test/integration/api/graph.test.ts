import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as getGraph } from '@/app/api/graph/route';
import { artists, genres, records, recordGenres } from '@/db/schema';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.6 `GET /api/graph` — the §8.1 payload, owned records only.
 *
 * The "not found" case of CLAUDE.md §2's four is deliberately NOT a 404 here,
 * and the test below pins that as a decision rather than letting it fall out of
 * the implementation: `genreId` is a FILTER, not a path identifier. A filter
 * matching nothing is a legitimately empty result, and `/api/records?genreId=`
 * behaves the same way — one endpoint 404ing while the other returns empty
 * would read as a bug from the client side.
 */

const db = getTestDb();

/**
 * A real v4 uuid that matches no row. It must be VERSION-VALID, not merely
 * uuid-shaped: zod 4's `.uuid()` enforces the version and variant nibbles, so
 * a hand-written `1111...-3333-4444-...` is rejected at validation and never
 * reaches the query — which would make the empty-result test below assert a
 * 400 it was written to rule out.
 */
const UNUSED_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

function request(url: string): Request {
  return new Request(`http://localhost${url}`);
}

async function seedOwnedArtist(name: string, title: string): Promise<string> {
  const [artist] = await db.insert(artists).values({ name }).returning();
  await db.insert(records).values({ title, artistId: artist.id });
  return artist.id;
}

describe('GET /api/graph — happy path', () => {
  it('returns the §8.1 nodes and links shape', async () => {
    await seedOwnedArtist('Dire Straits', 'Brothers in Arms');

    const response = await getGraph(request('/api/graph'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0]).toMatchObject({
      type: 'artist',
      label: 'Dire Straits',
      ownedCount: 1,
    });
    expect(body.links).toEqual([]);
  });

  it('subsets by genreId', async () => {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();

    const punkArtist = await seedOwnedArtist('Discharge', 'Hear Nothing');
    await seedOwnedArtist('Dire Straits', 'Brothers in Arms');

    const [record] = await db
      .select()
      .from(records)
      .where(sql`artist_id = ${punkArtist}`);
    await db.insert(recordGenres).values({ recordId: record.id, genreId: punk.id });

    const response = await getGraph(request(`/api/graph?genreId=${punk.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    const labels = body.nodes.map((n: { label: string }) => n.label);
    expect(labels).toContain('Discharge');
    expect(labels).not.toContain('Dire Straits');
  });
});

describe('GET /api/graph — validation failure', () => {
  it('rejects a genreId that is not a uuid', async () => {
    const response = await getGraph(request('/api/graph?genreId=not-a-uuid'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown query key', async () => {
    /**
     * CLAUDE.md §6: reject unknown keys. This is the one that would otherwise
     * pass silently — `?include=wanted` is the parameter deleted from §5.6, and
     * accepting-and-ignoring it would let a caller believe the graph was scoped
     * to the want list when it was not.
     */
    const response = await getGraph(request('/api/graph?include=wanted'));

    expect(response.status).toBe(400);
  });
});

describe('GET /api/graph — the "not found" case is an empty graph, not a 404', () => {
  it('returns 200 and an empty graph for a well-formed genreId matching nothing', async () => {
    await seedOwnedArtist('Dire Straits', 'Brothers in Arms');

    const response = await getGraph(request(`/api/graph?genreId=${UNUSED_UUID}`));
    const body = await response.json();

    expect(response.status, 'a filter matching nothing is not a missing resource').toBe(200);
    expect(body.nodes).toEqual([]);
    expect(body.links).toEqual([]);
  });
});

describe('GET /api/graph — unauthenticated access', () => {
  it('routes the graph path through middleware as session-protected', () => {
    expect(middlewareRuns('/api/graph')).toBe(true);
    expect(routeAuthMode('/api/graph')).toBe('session');
  });
});

describe('GET /api/graph — unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks no SQL when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await seedOwnedArtist('Dire Straits', 'Brothers in Arms');

    await db.execute(sql`ALTER TABLE artist_memberships RENAME TO memberships_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await getGraph(request('/api/graph'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE memberships_hidden RENAME TO artist_memberships`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('artist_memberships');
  });
});
