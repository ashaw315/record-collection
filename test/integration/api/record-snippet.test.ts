import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, records } from '@/db/schema';
import { PATCH, DELETE } from '@/app/api/records/[id]/snippet/route';
import { editSnippet, storeGeneratedSnippet } from '@/lib/db/queries/snippet';

/**
 * SPEC.md §5.2 (A31b): `PATCH` and `DELETE /api/records/:id/snippet`.
 *
 * **`POST` is unit 2's**, because it needs the Anthropic client. These two are
 * the paths that touch the user's own text, so they belong with the ownership
 * rule they enforce.
 *
 * Every handler gets the four cases CLAUDE.md §2 requires: happy path,
 * validation failure, not found, and — for the write that can destroy data — the
 * ownership refusal.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

/**
 * A well-formed v4 uuid that matches no row.
 *
 * NOT the nil uuid `00000000-...`: `isUuid` correctly rejects that as malformed
 * — the pattern requires a version digit and a variant nibble — so it exercises
 * the 400 path and never reaches the 404 one. Caught by this test failing with
 * `expected 400 to be 404`, which is the test being wrong rather than the code.
 */
const MISSING = '62e4e7db-951d-441c-acf0-11be68ab4daf';

async function seedRecord() {
  const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [record] = await db
    .insert(records)
    .values({ title: 'Why', artistId: artist.id })
    .returning();
  return record;
}

const row = async (id: string) => (await db.select().from(records).where(eq(records.id, id)))[0];

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/records/${id}/snippet`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) },
  );

const del = (id: string) =>
  DELETE(new Request(`http://localhost/api/records/${id}/snippet`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });

describe('PATCH /api/records/:id/snippet', () => {
  /** Fails against: a route that does not save the edit. */
  it('saves the edit and transfers ownership (happy path)', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');

    const response = await patch(record.id, { snippet: 'Mine.' });

    expect(response.status).toBe(200);
    const stored = await row(record.id);
    expect(stored.snippet).toBe('Mine.');
    expect(stored.snippetEditedAt).toBeInstanceOf(Date);
  });

  /**
   * Fails against: a route accepting unknown keys.
   *
   * CLAUDE.md §6: "Validate every route input with Zod at the boundary. Reject
   * unknown keys." A client sending `snippetEditedAt` must not be able to set
   * the ownership flag directly — that is the one field the server owns.
   */
  it.each([
    ['missing snippet', {}],
    ['empty snippet', { snippet: '' }],
    ['whitespace only', { snippet: '   ' }],
    ['unknown key', { snippet: 'ok', snippetEditedAt: null }],
    ['wrong type', { snippet: 42 }],
  ])('rejects %s', async (_case, body) => {
    const record = await seedRecord();

    const response = await patch(record.id, body);

    expect(response.status).toBe(400);
  });

  /** Fails against: a route that 500s or 200s on a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    const response = await patch(MISSING, { snippet: 'Mine.' });

    expect(response.status).toBe(404);
  });

  /** Fails against: a route that accepts a non-uuid and reaches the database. */
  it('400s on a malformed id', async () => {
    const response = await patch('not-a-uuid', { snippet: 'Mine.' });

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/records/:id/snippet', () => {
  /**
   * Fails against: a delete that clears the ownership timestamp.
   *
   * §4.2: "a deliberate deletion is an edit". Asserted through the ROUTE as well
   * as the query layer, because the route is where a well-meaning
   * `.set({ snippet: null, snippetEditedAt: null })` would be written.
   */
  it('clears the text and keeps ownership (happy path)', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');

    const response = await del(record.id);

    expect(response.status).toBe(200);
    const stored = await row(record.id);
    expect(stored.snippet).toBeNull();
    expect(stored.snippetEditedAt).toBeInstanceOf(Date);
  });

  /** Fails against: a delete that 500s on an already-empty snippet. */
  it('is idempotent on a record with no snippet', async () => {
    const record = await seedRecord();

    expect((await del(record.id)).status).toBe(200);
    expect((await del(record.id)).status).toBe(200);
  });

  /** Fails against: a route that 500s or 200s on a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    expect((await del(MISSING)).status).toBe(404);
  });

  /** Fails against: a route that accepts a non-uuid. */
  it('400s on a malformed id', async () => {
    expect((await del('not-a-uuid')).status).toBe(400);
  });
});
