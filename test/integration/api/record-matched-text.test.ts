import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, getTestDb, truncateAll } from '../../helpers/db';
import { artists, recordMatchedText, records } from '@/db/schema';
import { DELETE, GET, PATCH } from '@/app/api/records/[id]/matched-text/route';
import { pickLive } from '@/lib/db/queries/ask';
import { storeGeneratedMatchedText } from '@/lib/db/queries/matched-text';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * **SPEC §5.2's matched-text resource (§4.6, A78; the coordinator, 17 Nov): GET, PATCH and DELETE
 * `/api/records/:id/matched-text`, the only writer of `edited`.** Generation is not an endpoint: `generated` is written
 * by the drafting script on Adam's machine, so nothing here touches it, and every test of a write asserts that.
 *
 * The four cases per method, as CLAUDE.md §2 requires: happy path, validation, not found, unauthenticated. The last is
 * the middleware's, held the way every route's is here (influences.test.ts, ask.test.ts): the path is asserted to run
 * under the middleware as a session route, which is the boundary a handler called directly cannot observe.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

/** A well-formed v4 uuid that matches no row (not the nil uuid, which `isUuid` rejects as malformed and would 400). */
const MISSING = '62e4e7db-951d-441c-acf0-11be68ab4daf';

async function seedRecord(about: string | null = null): Promise<string> {
  const [artist] = await db.insert(artists).values({ name: `Artist ${Math.random()}` }).returning();
  const [record] = await db.insert(records).values({ title: 'Described', artistId: artist.id, snippet: about }).returning();
  return record.id;
}

const row = async (id: string) => (await db.select().from(recordMatchedText).where(eq(recordMatchedText.recordId, id)))[0];

const path = (id: string) => `http://localhost/api/records/${id}/matched-text`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string) => GET(new Request(path(id)), params(id));
const patch = (id: string, body: unknown, raw = false) =>
  PATCH(new Request(path(id), { method: 'PATCH', body: raw ? String(body) : JSON.stringify(body), headers: { 'content-type': 'application/json' } }), params(id));
const del = (id: string) => DELETE(new Request(path(id), { method: 'DELETE' }), params(id));

describe('GET /api/records/:id/matched-text', () => {
  /** Fails against: a GET that leaves out a field, or an `effective` that is not the edit where one is set. */
  it('answers the six fields, with effective the edit where one is set (happy path)', async () => {
    const id = await seedRecord();
    await storeGeneratedMatchedText(id, 'Slow piano, sparse.', 'model-a');
    expect((await patch(id, { edited: 'Slow piano, and a little hiss.' })).status).toBe(200);

    const response = await get(id);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ generated: 'Slow piano, sparse.', generatedModel: 'model-a', edited: 'Slow piano, and a little hiss.', effective: 'Slow piano, and a little hiss.' });
    expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.editedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /** Fails against: an `effective` that is not `generated` where no edit is set. */
  it('answers effective as the generated text where there is no edit', async () => {
    const id = await seedRecord();
    await storeGeneratedMatchedText(id, 'Slow piano, sparse.', 'model-a');

    const { data } = await (await get(id)).json();

    expect(data).toMatchObject({ generated: 'Slow piano, sparse.', edited: null, editedAt: null, effective: 'Slow piano, sparse.' });
  });

  /** Fails against: a GET that 404s a record with no row. §5.2: no matched text is a state of the record, not a missing record. */
  it('answers every field null with 200 for a record with no row', async () => {
    const id = await seedRecord();

    const response = await get(id);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ generated: null, generatedModel: null, generatedAt: null, edited: null, editedAt: null, effective: null });
  });

  /** Fails against: a GET answering nulls for a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    expect((await get(MISSING)).status).toBe(404);
  });

  /** Fails against: a GET that accepts a non-uuid and reaches the database. */
  it('400s on a malformed id', async () => {
    expect((await get('not-a-uuid')).status).toBe(400);
  });
});

describe('PATCH /api/records/:id/matched-text', () => {
  /** Fails against: a PATCH that does not write the edit, writes `generated`, or answers a shape other than GET's. */
  it('writes edited and edited_at and nothing else, answering as GET does (happy path)', async () => {
    const id = await seedRecord();
    await storeGeneratedMatchedText(id, 'Slow piano, sparse.', 'model-a');
    const before = await row(id);

    const response = await patch(id, { edited: '  Slow piano, and a little hiss.  ' });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ generated: 'Slow piano, sparse.', edited: 'Slow piano, and a little hiss.', effective: 'Slow piano, and a little hiss.' });
    const after = await row(id);
    expect(after.edited, 'trimmed').toBe('Slow piano, and a little hiss.');
    expect(after.editedAt).toBeInstanceOf(Date);
    expect({ generated: after.generated, generatedModel: after.generatedModel, generatedAt: after.generatedAt }, 'the generated half untouched')
      .toEqual({ generated: before.generated, generatedModel: before.generatedModel, generatedAt: before.generatedAt });
  });

  /** Fails against: a PATCH that only UPDATEs, so a record the model never described cannot be described by hand. */
  it('inserts the row where none exists, with the generated half null, so the record counts as covered (§4.8’s escape hatch)', async () => {
    const described = await seedRecord('An ABOUT.');
    await storeGeneratedMatchedText(described, 'Slow piano, sparse.', 'model-a');
    const byHand = await seedRecord('Another ABOUT, and nothing drafted.');
    expect(await pickLive(), 'one record with an ABOUT lacks text').toBe(false);

    const response = await patch(byHand, { edited: 'Brass, loud and fast.' });

    expect(response.status).toBe(200);
    expect(await row(byHand)).toMatchObject({ edited: 'Brass, loud and fast.', generated: null, generatedModel: null, generatedAt: null });
    expect(await pickLive(), 'the hand-written description covers it').toBe(true);
  });

  /**
   * Fails against: a PATCH that keeps the first edit, or refuses the second for want of a confirmReplace. §4.6: a second
   * edit starts from the first. The claim is that the edit is replaced, not that its time moved (the sweep of 21 Nov):
   * nothing in the product reads edited_at or generated_at to decide anything, both are stamped by `new Date()` in
   * matched-text.ts and so hold milliseconds, and `>=` below can only say the stamp did not go backwards.
   */
  it('replaces an edit with the next one, no confirmReplace', async () => {
    const id = await seedRecord();
    await patch(id, { edited: 'First.' });
    const first = (await row(id)).editedAt;

    const response = await patch(id, { edited: 'Second.' });

    expect(response.status).toBe(200);
    const after = await row(id);
    expect(after.edited).toBe('Second.');
    expect(after.editedAt?.getTime(), 'the stamp did not go backwards; both are JavaScript clocks').toBeGreaterThanOrEqual(first?.getTime() ?? Infinity);
  });

  /** Fails against: a route accepting an empty edit (the CHECK would refuse it as a 500), unknown keys, or a non-string. */
  it.each([
    ['missing edited', {}],
    ['empty edited', { edited: '' }],
    ['whitespace only', { edited: '   ' }],
    ['unknown key', { edited: 'ok', generated: 'mine now' }],
    ['wrong type', { edited: 42 }],
  ])('rejects %s with 400', async (_case, body) => {
    const id = await seedRecord();

    expect((await patch(id, body)).status).toBe(400);
    expect(await row(id), 'nothing written').toBeUndefined();
  });

  /** Fails against: a route that throws on a body that is not JSON. */
  it('400s on a body that is not JSON', async () => {
    const id = await seedRecord();
    expect((await patch(id, '{not json', true)).status).toBe(400);
  });

  /** Fails against: a route that 500s on the foreign key, or 200s, for a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    expect((await patch(MISSING, { edited: 'Mine.' })).status).toBe(404);
  });

  /** Fails against: a route that accepts a non-uuid. */
  it('400s on a malformed id', async () => {
    expect((await patch('not-a-uuid', { edited: 'Mine.' })).status).toBe(400);
  });
});

describe('DELETE /api/records/:id/matched-text', () => {
  /** Fails against: a DELETE that touches `generated`, or leaves `edited_at`. */
  it('clears edited and edited_at, never generated, so the pick reads the generated text again (happy path)', async () => {
    const id = await seedRecord();
    await storeGeneratedMatchedText(id, 'Slow piano, sparse.', 'model-a');
    await patch(id, { edited: 'Mine.' });

    const response = await del(id);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ generated: 'Slow piano, sparse.', edited: null, editedAt: null, effective: 'Slow piano, sparse.' });
    expect(await row(id)).toMatchObject({ generated: 'Slow piano, sparse.', generatedModel: 'model-a', edited: null, editedAt: null });
  });

  /** Fails against: a DELETE that 404s or 500s where there is no edit, or no row at all. The state asked for holds either way. */
  it('is idempotent on a record with no edit, and on one with no row', async () => {
    const id = await seedRecord();

    expect((await del(id)).status).toBe(200);
    expect((await del(id)).status).toBe(200);
    expect(await row(id), 'no row is created by a clear').toBeUndefined();
  });

  /** Fails against: a route that 200s for a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    expect((await del(MISSING)).status).toBe(404);
  });

  /** Fails against: a route that accepts a non-uuid. */
  it('400s on a malformed id', async () => {
    expect((await del('not-a-uuid')).status).toBe(400);
  });
});

/*
  The repo's convention for the unauthenticated case (refresh-prices.test.ts, influences.test.ts): §3 puts every route
  behind the middleware, so a handler called directly never sees an unauthenticated request, and this asserts the boundary
  where it lives. Fails against: the path added to PUBLIC_PATHS, or excluded by the matcher. It is a proxy for the 401 and
  is named as one.
*/
describe('unauthenticated access', () => {
  it('is a session route under the middleware', () => {
    const p = `/api/records/${MISSING}/matched-text`;
    expect(middlewareRuns(p)).toBe(true);
    expect(routeAuthMode(p)).toBe('session');
  });
});
