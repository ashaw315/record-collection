import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as addEntry } from '@/app/api/records/[id]/journal/route';
import { DELETE as removeEntry } from '@/app/api/journal/[id]/route';
import { GET as getRecord } from '@/app/api/records/[id]/route';
import { artists, journalEntries, records } from '@/db/schema';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.2: `POST /api/records/:id/journal` — "Body `{ entryDate?, note }`;
 * `entryDate` defaults to today" — and `DELETE /api/journal/:id`.
 *
 * §10 requires the record detail screen to carry "journal entries with
 * add-entry form", which is why these exist: the hydrated read has returned
 * entries since step 5, and nothing could write one.
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
  return addEntry(
    new Request(`http://test/api/records/${id}/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function remove(id: string): Promise<Response> {
  return removeEntry(new Request(`http://test/api/journal/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/records/:id/journal', () => {
  it('creates an entry and returns it (happy path)', async () => {
    const response = await post(recordId, { note: 'Played it after the pub. Still loud.' });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.note).toBe('Played it after the pub. Still loud.');
    expect(body.recordId).toBe(recordId);

    const rows = await db.select().from(journalEntries);
    expect(rows).toHaveLength(1);
  });

  it('defaults entryDate to today when the body omits it', async () => {
    /**
     * §5.2 says so, and §4.2 gives the column `DEFAULT CURRENT_DATE`. Asserted
     * against the DATABASE's today rather than the test process's: the two can
     * differ by a day across a timezone boundary, and a test comparing to a
     * locally-computed date would fail at 23:00 UTC for reasons having nothing
     * to do with the code.
     */
    const response = await post(recordId, { note: 'no date given' });

    expect(response.status).toBe(201);

    const [row] = await db
      .select({ entryDate: journalEntries.entryDate })
      .from(journalEntries)
      .limit(1);
    const [{ today }] = await db.execute<{ today: string }>(
      sql`SELECT CURRENT_DATE::text AS today`,
    ).then((result) => (Array.isArray(result) ? result : result.rows));

    expect(row.entryDate).toBe(today);
  });

  it('accepts an explicit entryDate, because a note is often written later', async () => {
    // "I played this last Tuesday" is the normal case, not the exception.
    const response = await post(recordId, { entryDate: '2026-03-15', note: 'backdated' });

    expect(response.status).toBe(201);
    expect((await response.json()).entryDate).toBe('2026-03-15');
  });

  it('rejects an empty note (validation failure)', async () => {
    // §4.2 has `note TEXT NOT NULL`. An entry with no note is a row that says
    // nothing, and the column would accept '' — so the boundary must not.
    const response = await post(recordId, { note: '   ' });

    expect(response.status).toBe(400);
    expect(await db.select().from(journalEntries)).toHaveLength(0);
  });

  it('rejects a malformed entryDate rather than storing a wrong day', async () => {
    /**
     * `2026-13-45` is the shape that reached production once already (NOTES:
     * the purchaseDate finding). A date the database would refuse, or worse
     * silently coerce, must be a 400.
     */
    const response = await post(recordId, { entryDate: '2026-13-45', note: 'bad date' });

    expect(response.status).toBe(400);
  });

  it('rejects a date in the wrong century, which a calendar check cannot catch', async () => {
    /**
     * `1823-04-11` is a real day. `isCalendarDate` accepts it and should — the
     * thing wrong with it is not its shape. §4.1 bounds the year fields at 1877
     * (sound recording began) for the same reason, and this is that argument
     * applied to a date.
     *
     * Asserted at the ENDPOINT, not only in the schema's unit tests: a bound
     * enforced solely in the form is a suggestion, and this endpoint is
     * reachable without it.
     */
    expect((await post(recordId, { entryDate: '1823-04-11', note: 'x' })).status).toBe(400);
    expect((await post(recordId, { entryDate: '2087-04-11', note: 'x' })).status).toBe(400);

    expect(await db.select().from(journalEntries)).toHaveLength(0);
  });

  it('rejects the day after tomorrow, which is nobody’s today', async () => {
    /**
     * The upper bound is today PLUS one day, unlike §4.1's year rule which
     * allows a whole next year for a band already announced.
     *
     * **The extra day is timezone slack, not laxity.** The server bounds in UTC
     * while the client sends its own LOCAL calendar date — a journal entry's
     * date is a human fact, the day the user played the record — and east of
     * Greenwich that is routinely a day ahead of UTC. Rejecting it made the API
     * refuse the user's genuine today, offered by the form's own date input.
     *
     * This previously asserted `CURRENT_DATE + 1` was a 400, which is what
     * broke it. Two days out is beyond every timezone and still refused, so the
     * bound keeps doing the job §4.1 wants — catching `2087-04-11` above.
     */
    const [{ dayAfter }] = await db
      .execute<{ dayAfter: string }>(sql`SELECT (CURRENT_DATE + 2)::text AS "dayAfter"`)
      .then((result) => (Array.isArray(result) ? result : result.rows));

    expect((await post(recordId, { entryDate: dayAfter, note: 'x' })).status).toBe(400);
  });

  it('accepts tomorrow-in-UTC, because it is today somewhere east', async () => {
    /**
     * The complement, and the case the change exists for. Without it the API
     * rejects a date its own form offered to a user in Sydney.
     */
    const [{ tomorrow }] = await db
      .execute<{ tomorrow: string }>(sql`SELECT (CURRENT_DATE + 1)::text AS tomorrow`)
      .then((result) => (Array.isArray(result) ? result : result.rows));

    expect((await post(recordId, { entryDate: tomorrow, note: 'x' })).status).toBe(201);
  });

  it('accepts today, the boundary in the other direction', async () => {
    const [{ today }] = await db
      .execute<{ today: string }>(sql`SELECT CURRENT_DATE::text AS today`)
      .then((result) => (Array.isArray(result) ? result : result.rows));

    expect((await post(recordId, { entryDate: today, note: 'x' })).status).toBe(201);
  });

  it('404s for a record that does not exist (not found)', async () => {
    const response = await post(UNUSED_UUID, { note: 'orphan' });

    expect(response.status).toBe(404);
    expect(await db.select().from(journalEntries)).toHaveLength(0);
  });

  it('400s on a malformed record id rather than treating it as missing', async () => {
    expect((await post('not-a-uuid', { note: 'x' })).status).toBe(400);
  });

  it('is behind auth (unauthenticated)', () => {
    expect(middlewareRuns('/api/records/abc/journal')).toBe(true);
    expect(routeAuthMode('/api/records/abc/journal')).toBe('session');
    expect(middlewareRuns('/api/journal/abc')).toBe(true);
    expect(routeAuthMode('/api/journal/abc')).toBe('session');
  });

  it('rejects an unknown key rather than discarding it', async () => {
    // The tagIds shape: accepted, dropped, 201 returned, user believes it
    // landed. `.strict()` turns a future silent drop into a 400.
    const response = await post(recordId, { note: 'ok', mood: 'nostalgic' });

    expect(response.status).toBe(400);
  });

  it('appears in the record’s hydrated read, newest first', async () => {
    /**
     * The round trip a client performs, and the ordering §5's hydration already
     * uses — `entry_date DESC`. A journal reads newest-first: the last thing
     * you thought about a record is the thing you want to see.
     */
    await post(recordId, { entryDate: '2026-01-01', note: 'older' });
    await post(recordId, { entryDate: '2026-06-01', note: 'newer' });

    const response = await getRecord(new Request(`http://test/api/records/${recordId}`), {
      params: Promise.resolve({ id: recordId }),
    });
    const body = await response.json();

    expect(body.journalEntries.map((entry: { note: string }) => entry.note)).toEqual([
      'newer',
      'older',
    ]);
  });
});

describe('DELETE /api/journal/:id', () => {
  async function seedEntry(): Promise<string> {
    const response = await post(recordId, { note: 'deletable' });
    return (await response.json()).id;
  }

  it('deletes the entry (happy path)', async () => {
    const entryId = await seedEntry();

    const response = await remove(entryId);

    expect(response.status).toBe(204);
    expect(await db.select().from(journalEntries)).toHaveLength(0);
  });

  it('404s for an entry that does not exist (not found)', async () => {
    expect((await remove(UNUSED_UUID)).status).toBe(404);
  });

  it('400s on a malformed id (validation failure)', async () => {
    expect((await remove('not-a-uuid')).status).toBe(400);
  });

  it('leaves the record alone', async () => {
    /**
     * The discriminating case for the cascade direction. §4.2 cascades
     * entries when a RECORD is deleted; nothing cascades the other way, and a
     * journal entry is not a reason to lose the record it describes.
     */
    const entryId = await seedEntry();

    await remove(entryId);

    const still = await db.select().from(records).where(eq(records.id, recordId));
    expect(still).toHaveLength(1);
  });

  it('is idempotent enough to 404 rather than 500 on a second delete', async () => {
    const entryId = await seedEntry();

    expect((await remove(entryId)).status).toBe(204);
    expect((await remove(entryId)).status).toBe(404);
  });
});
