import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §5.4: a DUPLICATE 409 carries `existingId`, required, from every
 * resource and every path that can produce one.
 *
 * The reason it is required rather than optional: names are normalized with
 * `cleanName` before comparison, so a collision is frequently NOT a string
 * match on the client's side. Measured before the amendment — `"Clay  Records"`
 * with a double space, a non-breaking space, a zero-width joiner and an
 * NFD-composed `Café` all collide server-side while failing any naive
 * client-side comparison. Without `existingId` a client must reimplement the
 * server's normalization and will get it wrong in exactly those cases.
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

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`https://x.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Every §5.4 resource with a unique NAME.
 *
 * `record_stores` is EXCLUDED, and deliberately: §4.1 gives it no unique name
 * constraint, so it cannot produce a DUPLICATE at all — verified against
 * pg_constraint, which lists artists, formats, genres, labels and tags and not
 * record_stores. An earlier version of this list included it and failed,
 * asserting a behaviour the schema does not have.
 *
 * `pressings` is excluded too: no unique name, only a partial unique index on
 * discogs_release_id. Covered separately below.
 *
 * `formats` is excluded for a THIRD reason: it is closed reference data seeded
 * by the migration (§4.1), and `truncateAll` deliberately does not clear it —
 * so a row created here survives every reset and permanently breaks
 * schema.test.ts's "seeds exactly the seven formats" assertion. Its duplicate
 * path is identical to the others and is covered by formats.test.ts, which
 * exercises it against the seeded rows rather than creating new ones.
 */
const NAMED_RESOURCES = [
  { path: '/api/artists', module: () => import('@/app/api/artists/route'), table: 'artists' },
  { path: '/api/genres', module: () => import('@/app/api/genres/route'), table: 'genres' },
  { path: '/api/labels', module: () => import('@/app/api/labels/route'), table: 'labels' },
  { path: '/api/tags', module: () => import('@/app/api/tags/route'), table: 'tags' },
] as const;

describe('every named reference resource returns existingId on a duplicate', () => {
  for (const resource of NAMED_RESOURCES) {
    it(`${resource.path} names the row the caller collided with`, async () => {
      const { POST } = await resource.module();

      /**
       * A unique name per run. `formats` is seeded reference data (§4.1) and
       * `truncateAll` deliberately does NOT clear it, so a fixed name survives
       * between runs and the second run's "create" is already a duplicate —
       * which is exactly how this test first failed.
       */
      const name = `Fixture ${Math.random().toString(36).slice(2, 10)}`;

      const first = await POST(jsonRequest(resource.path, { name }));
      expect(first.status, 'fixture create').toBe(201);
      const created = await first.json();

      const second = await POST(jsonRequest(resource.path, { name }));

      expect(second.status).toBe(409);
      const body = await second.json();
      expect(body.error.code).toBe('DUPLICATE');
      // The id, not merely a message — that is what makes "use the existing
      // one instead" possible without the client guessing.
      expect(body.error.existingId).toBe(created.id);
    });
  }
});

/**
 * THE CASE THE AMENDMENT EXISTS FOR.
 *
 * Each of these collides after `cleanName` and does NOT equal the stored name
 * as a plain string, so a client matching its own input against a loaded list
 * would find nothing and show a dead error. Constructed from escapes rather
 * than typed literals, because a typed NFD string is normalized to NFC on
 * being written to disk — the precondition-destroyed defect in NOTES.md.
 */
describe('a NORMALIZED collision still returns a usable existingId', () => {
  const STORED = 'Clay Records';

  const variants: Array<[string, string]> = [
    ['a double space', 'Clay  Records'],
    ['a non-breaking space', 'Clay Records'],
    ['a zero-width joiner', 'Clay Records‍'],
    // A zero-width space between the words, built from an ESCAPE — the words
    // stay separated by a real space, so cleanName strips the invisible and
    // the result matches. An earlier version wrote it as a literal and
    // produced 'ClayRecords', which is genuinely not a collision.
    ['a zero-width space', 'Clay\u200B Records'],
  ];

  for (const [label, input] of variants) {
    it(`resolves ${label}`, async () => {
      const { POST } = await import('@/app/api/labels/route');

      const first = await POST(jsonRequest('/api/labels', { name: STORED }));
      const created = await first.json();

      // The precondition: this is NOT a plain string match, which is the whole
      // reason the server has to supply the id.
      expect(input).not.toBe(STORED);

      const second = await POST(jsonRequest('/api/labels', { name: input }));

      expect(second.status, input).toBe(409);
      expect((await second.json()).error.existingId).toBe(created.id);
    });
  }

  it('resolves an NFD-composed name against its NFC twin', async () => {
    const { POST } = await import('@/app/api/labels/route');

    // Built from escapes: 'Cafe' + COMBINING ACUTE vs the precomposed 'é'.
    const nfd = 'Café';
    const nfc = 'Café';
    expect(nfd).not.toBe(nfc);

    const first = await POST(jsonRequest('/api/labels', { name: nfc }));
    const created = await first.json();

    const second = await POST(jsonRequest('/api/labels', { name: nfd }));

    expect(second.status).toBe(409);
    expect((await second.json()).error.existingId).toBe(created.id);
  });
});

/**
 * THE RECOVERY PATH.
 *
 * The name pre-check is not a lock, so a concurrent write can land between the
 * check and the insert. That path returns 409 from a unique-violation catch
 * rather than from the pre-check, and §5.4 requires `existingId` there too —
 * "the same defect surfacing only under concurrency, which is the hardest
 * version to diagnose".
 *
 * The window is simulated by hooking the pre-check, the same technique the
 * other race tests in this suite use. Racing real threads would be
 * non-deterministic and would prove less.
 */
describe('the unique-violation recovery path also carries existingId', () => {
  it('returns the winning row when a concurrent create lands first', async () => {
    const queries = await import('@/lib/db/queries/labels');
    const { POST } = await import('@/app/api/labels/route');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    let winner: { id: string } | undefined;

    // The pre-check reports "no such name" and, in the same instant, a
    // concurrent caller creates it — exactly the interleaving the catch exists
    // for.
    /**
     * Only the PRE-CHECK is hooked, not every call.
     *
     * The recovery path calls the same function to find the winner, so a mock
     * returning undefined unconditionally makes the handler rethrow and the
     * test sees a 500 — the mock defeating the code under test rather than
     * exercising it. The first call simulates the race window; later calls
     * fall through to the real query.
     */
    const real = queries.findLabelByName;
    let firstCall = true;

    const spy = vi.spyOn(queries, 'findLabelByName').mockImplementation(async (name) => {
      if (firstCall) {
        firstCall = false;
        const inserted = await db.execute<{ id: string }>(
          sql`INSERT INTO labels (name) VALUES ('Spiderleg') RETURNING id`,
        );
        winner = inserted.rows[0];
        return undefined;
      }
      return real(name);
    });

    try {
      const response = await POST(jsonRequest('/api/labels', { name: 'Spiderleg' }));

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('DUPLICATE');
      // The id of the row that WON the race, so the client can select it —
      // not a bare message that leaves it stuck.
      expect(body.error.existingId).toBe(winner?.id);
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * `pressings` has no unique name — only the partial unique index on
 * discogs_release_id (§4.1). Its duplicate is reached by that column, and §5.4
 * applies to it the same way.
 */
describe('pressings return existingId for a discogs id collision', () => {
  it('names the pressing already holding that Discogs id', async () => {
    const { POST } = await import('@/app/api/pressings/route');

    const first = await POST(jsonRequest('/api/pressings', { discogsReleaseId: 424242 }));
    expect(first.status).toBe(201);
    const created = await first.json();

    const second = await POST(
      jsonRequest('/api/pressings', { discogsReleaseId: 424242, catalogNumber: 'OTHER' }),
    );

    // A found-or-create resource returns the existing row rather than a
    // conflict — verified rather than assumed, because §4 makes pressings
    // shared and found-or-created.
    if (second.status === 200) {
      expect((await second.json()).id).toBe(created.id);
      return;
    }

    expect(second.status).toBe(409);
    expect((await second.json()).error.existingId).toBe(created.id);
  });
});
