import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, llmRequests, records } from '@/db/schema';
import { editSnippet } from '@/lib/db/queries/snippet';
import { LLM_REQUESTS_PER_HOUR } from '@/lib/llm/rate-limit';

/**
 * SPEC.md §5.2 (A31b): `POST /api/records/:id/snippet` — §10b's generation path.
 *
 * **Unit 1's refusal is CONSUMED, not re-derived.** `storeGeneratedSnippet`
 * already refuses when `snippet_edited_at` is set and already accepts
 * `confirmReplace`; this route's job is to pass the flag through and translate
 * the refusal into a 409. A second guard here would be two rules that can
 * disagree — which is the finding, if it turns out one is needed.
 */

const write = vi.fn();

vi.mock('@/lib/llm/snippet-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/snippet-client')>();
  return { ...actual, getSnippetClient: () => ({ write }) };
});

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/client')>();
  return { ...actual, isAnthropicConfigured: () => true };
});

const { POST } = await import('@/app/api/records/[id]/snippet/route');

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  write.mockReset();
  write.mockResolvedValue({ ok: true, snippet: 'A 1982 hardcore record.' });
});

afterAll(async () => {
  await closeTestDb();
});

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

const post = (id: string, body?: unknown) =>
  POST(
    new Request(`http://localhost/api/records/${id}/snippet`, {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    }),
    { params: Promise.resolve({ id }) },
  );

describe('POST /api/records/:id/snippet', () => {
  /** Fails against: a route that does not generate or does not store. */
  it('generates and stores (happy path)', async () => {
    const record = await seedRecord();

    const response = await post(record.id);

    expect(response.status).toBe(200);
    expect((await row(record.id)).snippet).toBe('A 1982 hardcore record.');
  });

  /**
   * Fails against: a route sending the record's own facts to the model.
   *
   * §10b's "never contradicts entered data" is enforced by WITHHOLDING, so the
   * route must pass artist and title only. Asserted at the call rather than in
   * the prompt builder, because the route is what chooses the subject.
   */
  it('sends only the artist and title to the model', async () => {
    const record = await seedRecord();

    await post(record.id);

    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(write.mock.calls[0][0]).sort()).toEqual(['artist', 'title']);
  });

  /** Fails against: a route that does not spend from the shared budget. */
  it('claims a slot as kind=snippet', async () => {
    const record = await seedRecord();

    await post(record.id);

    const rows = await db.select().from(llmRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('snippet');
  });

  /**
   * Fails against: a snippet budget separate from §9.2's.
   *
   * §4.3: both callers spend the same account, so ten gap analyses must exhaust
   * the budget a snippet draws on.
   */
  it('shares one budget with gap analysis', async () => {
    const record = await seedRecord();
    await db.insert(llmRequests).values(
      Array.from({ length: LLM_REQUESTS_PER_HOUR }, () => ({
        kind: 'gap_analysis',
        requestedAt: new Date(),
      })),
    );

    const response = await post(record.id);

    expect(response.status).toBe(429);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('the ownership refusal, consumed from unit 1', () => {
  /**
   * **THE test for this route.** Fails against a route that regenerates over
   * user-owned text.
   *
   * Both halves asserted: the 409 AND the text unchanged. A route could return
   * the right status having already written.
   */
  it('refuses with 409 and leaves the text alone', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');

    const response = await post(record.id);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('SNIPPET_EDITED');
    expect((await row(record.id)).snippet).toBe('Mine.');
  });

  /** Fails against: a route that ignores `confirmReplace`. */
  it('replaces when the user confirms', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');

    const response = await post(record.id, { confirmReplace: true });

    expect(response.status).toBe(200);
    expect((await row(record.id)).snippet).toBe('A 1982 hardcore record.');
  });

  /**
   * **Fails against: a route that spends a slot on a call it will refuse.**
   *
   * The ordering question this unit had to answer. Refusing AFTER generating
   * would bill the account and burn one of ten hourly slots to produce text that
   * is then thrown away — and the refusal is knowable before the call, unlike
   * §9.2's failures.
   */
  it('does not call the model or spend a slot when it will refuse', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');

    await post(record.id);

    expect(write).not.toHaveBeenCalled();
    expect(await db.select().from(llmRequests)).toHaveLength(0);
  });
});

describe('failures', () => {
  /**
   * Fails against: an unreadable response stored as an empty snippet, or
   * surfacing as a 500.
   */
  it('reports an unreadable response as 502 and stores nothing', async () => {
    const record = await seedRecord();
    write.mockResolvedValue({ ok: false, reason: 'unreadable' });

    const response = await post(record.id);

    expect(response.status).toBe(502);
    expect((await row(record.id)).snippet).toBeNull();
  });

  /**
   * Fails against: a route that 500s on a rejected credential.
   *
   * F1's treatment, applied to the second caller: a 401 is named, and the slot
   * is refunded because nothing was billed.
   */
  it('names a rejected credential and refunds the slot', async () => {
    const record = await seedRecord();
    write.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }));

    const response = await post(record.id);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_UNAUTHORIZED');
    expect(await db.select().from(llmRequests)).toHaveLength(0);
  });

  /** Fails against: a route that 500s or 200s for a record that does not exist. */
  it('404s for a record that does not exist', async () => {
    expect((await post(MISSING)).status).toBe(404);
  });

  /** Fails against: a route that accepts a non-uuid. */
  it('400s on a malformed id', async () => {
    expect((await post('not-a-uuid')).status).toBe(400);
  });

  /** Fails against: a route accepting unknown keys in the body. */
  it('400s on an unknown body key', async () => {
    const record = await seedRecord();

    expect((await post(record.id, { confirmReplace: true, snippet: 'x' })).status).toBe(400);
  });
});

describe('an edit that lands WHILE the model is writing', () => {
  /**
   * **Found by mutation, and it is the finding this unit was told to watch
   * for.** Making the route pass `confirmReplace: true` to the write —
   * defeating unit 1's guard entirely — passed all twelve tests above, because
   * every one of them exercises the SEQUENTIAL case that the cheap pre-check
   * already catches.
   *
   * The pre-check and the write are two rules that can disagree, and only the
   * race distinguishes them. The window is real: the model call takes seconds
   * (R5 measured 44s for gap analysis), and a user editing their snippet in that
   * window would have their text overwritten by a generation that read a null
   * timestamp before they typed.
   *
   * Unit 1's write already refuses atomically, so the route is correct — but
   * nothing PROVED the route relied on it until this test existed. The edit is
   * committed from inside the mocked client, which is the only place that is
   * genuinely between the pre-check and the write.
   */
  it('is not overwritten by a generation already in flight', async () => {
    const record = await seedRecord();

    write.mockImplementation(async () => {
      // The user edits while the model is working.
      await editSnippet(record.id, 'Typed while it was thinking.');
      return { ok: true, snippet: 'Generated over the top.' };
    });

    const response = await post(record.id);

    expect(response.status).toBe(409);
    expect((await row(record.id)).snippet).toBe('Typed while it was thinking.');
  });
});
