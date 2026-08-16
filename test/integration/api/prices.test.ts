import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as addPrice } from '@/app/api/records/[id]/prices/route';
import { GET as getRecord } from '@/app/api/records/[id]/route';
import { artists, priceHistory, records } from '@/db/schema';

/**
 * SPEC.md §5.2: `POST /api/records/:id/prices` — "Append a price observation.
 * Body `{ price, priceType, source? }`. **Append-only (§7.5)** — there is no
 * update path, and a request shaped like an edit is rejected rather than
 * quietly appended as a new row."
 *
 * **The rejection is the load-bearing part.** §7.5's guarantee — "never UPDATE
 * a price_history row; always insert a new one" — is only meaningful if a
 * correction is a DELIBERATE new observation. An endpoint that accepted an `id`
 * and appended anyway would satisfy every test asserting the row count went up,
 * while letting a client believe it had edited history.
 */

const db = getTestDb();

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

let recordId: string;

beforeEach(async () => {
  await truncateAll();

  const [artist] = await db
    .insert(artists)
    .values({ name: 'Discharge' })
    .returning({ id: artists.id });
  const [record] = await db
    .insert(records)
    .values({ title: 'Hear Nothing', artistId: artist.id })
    .returning({ id: records.id });

  recordId = record.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

function post(id: string, body: unknown): Promise<Response> {
  return addPrice(
    new Request(`http://test/api/records/${id}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function rows() {
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.recordId, recordId))
    .orderBy(desc(priceHistory.recordedAt));
}

describe('POST /api/records/:id/prices', () => {
  it('appends an observation and returns it (happy path)', async () => {
    const response = await post(recordId, { price: '24.50', priceType: 'used' });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.price).toBe('24.50');
    expect(body.priceType).toBe('used');

    expect(await rows()).toHaveLength(1);
  });

  it('accepts an optional source', async () => {
    const response = await post(recordId, {
      price: '30.00',
      priceType: 'new',
      source: 'discogs',
    });

    expect(response.status).toBe(201);
    expect((await response.json()).source).toBe('discogs');
  });

  it('APPENDS rather than replacing, so history accumulates', async () => {
    /**
     * §7.5 in one assertion. Two observations of the same type on the same
     * record are two rows — the second does not overwrite the first, and both
     * survive to be read.
     */
    await post(recordId, { price: '20.00', priceType: 'used' });
    await post(recordId, { price: '35.00', priceType: 'used' });

    const history = await rows();
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.price).sort()).toEqual(['20.00', '35.00']);
  });

  it('REJECTS a request carrying an id, rather than appending it', async () => {
    /**
     * THE case this endpoint exists to refuse.
     *
     * A client sending `{ id, price }` believes it is editing an observation.
     * There is no update path (§5.2), so appending would silently do something
     * other than what was asked — and the row count would go up, satisfying
     * every naive test while the client's model of history is now wrong.
     *
     * `.strictObject` produces the 400; this asserts the CONSEQUENCE, which is
     * that nothing was written.
     */
    const response = await post(recordId, {
      id: UNUSED_UUID,
      price: '24.50',
      priceType: 'used',
    });

    expect(response.status).toBe(400);
    expect(await rows(), 'nothing appended for a request that meant to edit').toHaveLength(0);
  });

  it('rejects other edit-shaped keys the same way', async () => {
    // `recordedAt` is the other one a client would reach for when trying to
    // correct history: "the same observation, but dated differently".
    for (const shape of [
      { recordedAt: '2026-01-01T00:00:00Z', price: '1.00', priceType: 'used' },
      { priceId: UNUSED_UUID, price: '1.00', priceType: 'used' },
    ]) {
      expect((await post(recordId, shape)).status, JSON.stringify(shape)).toBe(400);
    }

    expect(await rows()).toHaveLength(0);
  });

  it('rejects a price type outside §4.2’s enum (validation failure)', async () => {
    const response = await post(recordId, { price: '10.00', priceType: 'wholesale' });

    expect(response.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it('requires a price type, because §7.6’s chain has no untyped case', async () => {
    // §4.2: `price_type` is NOT NULL precisely so the fallback chain is total.
    expect((await post(recordId, { price: '10.00' })).status).toBe(400);
  });

  it('rejects a price that is not a decimal amount', async () => {
    /**
     * The coercion class from NOTES, at a money boundary. `z.coerce.number()`
     * reads '0x50' as 80 and '5e4' as 50000; a price column would then hold a
     * number nobody typed. The format check IS the validation.
     */
    for (const price of ['0x50', '5e4', 'twenty', '', '-5.00', '10.001']) {
      expect((await post(recordId, { price, priceType: 'used' })).status, price).toBe(400);
    }

    expect(await rows()).toHaveLength(0);
  });

  it('404s for a record that does not exist (not found)', async () => {
    const response = await post(UNUSED_UUID, { price: '10.00', priceType: 'used' });

    expect(response.status).toBe(404);
    expect(await db.select().from(priceHistory)).toHaveLength(0);
  });

  it('400s on a malformed record id rather than treating it as missing', async () => {
    expect((await post('not-a-uuid', { price: '10.00', priceType: 'used' })).status).toBe(400);
  });

  it('reaches the record’s hydrated read as the latest price', async () => {
    /**
     * §5.2's GET returns "latest price". The round trip a client performs, and
     * the seam between appending and reading — the two have to agree on which
     * row is latest.
     */
    await post(recordId, { price: '20.00', priceType: 'used' });
    await post(recordId, { price: '35.00', priceType: 'new' });

    const response = await getRecord(new Request(`http://test/api/records/${recordId}`), {
      params: Promise.resolve({ id: recordId }),
    });
    const body = await response.json();

    expect(body.latestPrice.price).toBe('35.00');
  });
});
