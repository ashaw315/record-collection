import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, genres, llmRequests, records, recordGenres } from '@/db/schema';
import { LLM_REQUESTS_PER_HOUR } from '@/lib/llm/rate-limit';

/**
 * SPEC.md §5.8 `POST /api/suggestions/ai` — §9.2's gap analysis.
 *
 * **The client is mocked in every test.** No live call is possible: the module
 * is replaced, and the no-live-calls guard covers `api.anthropic.com` at the
 * request site for anything that slips past — verified against that host rather
 * than assumed from its comment.
 */

const analyse = vi.fn();

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/client')>();
  return {
    ...actual,
    getGapAnalysisClient: () => ({ analyse }),
    isAnthropicConfigured: () => true,
  };
});

const { POST } = await import('@/app/api/suggestions/ai/route');

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  analyse.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeTestDb();
});

const call = () =>
  POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }), {
    params: Promise.resolve({}),
  });

async function seedCollection() {
  const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [genre] = await db.insert(genres).values({ name: 'UK82' }).returning();
  const [record] = await db
    .insert(records)
    .values({ title: 'Why', artistId: artist.id })
    .returning();
  await db.insert(recordGenres).values({ recordId: record.id, genreId: genre.id });
}

const ONE_SUGGESTION = {
  ok: true,
  suggestions: [
    { artist: 'Anti-Cimex', title: 'Raped Ass', reason: 'Swedish käng.', genre: 'UK82' },
  ],
  dropped: 0,
};

describe('POST /api/suggestions/ai', () => {
  /** Fails against: a route that does not exist or returns the wrong shape. */
  it('returns the model suggestions (happy path)', async () => {
    await seedCollection();
    analyse.mockResolvedValue(ONE_SUGGESTION);

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);
    expect(body.data.suggestions[0].artist).toBe('Anti-Cimex');
  });

  /**
   * Fails against: a route that does not consume a request from the budget.
   *
   * §9.2's limit is enforced server-side, so a successful call must LEAVE A
   * TRACE. Without this the limiter exists and nothing feeds it.
   */
  it('claims a rate-limit slot for a successful call', async () => {
    await seedCollection();
    analyse.mockResolvedValue(ONE_SUGGESTION);

    await call();

    const rows = await db.select().from(llmRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('gap_analysis');
  });

  /**
   * Fails against: a limit trusted from the client, or one that returns 500.
   *
   * §9.2 (A29b): exhaustion is a legible refusal naming when capacity returns.
   * 429 rather than 500, because a spent quota is not an internal fault — and
   * the body must carry the retry time, since "try later" is the same
   * non-answer as a bare error.
   */
  it('refuses with 429 and says when capacity returns', async () => {
    await seedCollection();
    await db.insert(llmRequests).values(
      Array.from({ length: LLM_REQUESTS_PER_HOUR }, () => ({
        kind: 'gap_analysis',
        requestedAt: new Date(),
      })),
    );

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAt).toBeTruthy();
  });

  /**
   * Fails against: a route that calls the model anyway once refused.
   *
   * The point of a server-side limit is that the spend does not happen. A 429
   * that still made the call would be a rate limit on the RESPONSE, not on the
   * request.
   */
  it('does not call the model when refused', async () => {
    await seedCollection();
    await db.insert(llmRequests).values(
      Array.from({ length: LLM_REQUESTS_PER_HOUR }, () => ({
        kind: 'gap_analysis',
        requestedAt: new Date(),
      })),
    );

    await call();

    expect(analyse).not.toHaveBeenCalled();
  });

  /**
   * Fails against: an unreadable response surfacing as a crash, or as an empty
   * list.
   *
   * §9.2: "Handle parse failure gracefully with a user-visible error, not a
   * crash." And R5's distinction — the user must be able to tell "the model had
   * nothing to say" from "we could not read the answer".
   */
  it('reports an unreadable response as an error, not as no suggestions', async () => {
    await seedCollection();
    analyse.mockResolvedValue({ ok: false, reason: 'unreadable' });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_UNREADABLE');
  });

  /**
   * Fails against: collapsing an empty result into an error.
   *
   * The other half. An empty array is a successful answer — "no gaps found" —
   * and a complete collection is entitled to it.
   */
  it('an empty result is a 200 with no suggestions', async () => {
    await seedCollection();
    analyse.mockResolvedValue({ ok: true, suggestions: [], dropped: 0 });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suggestions).toEqual([]);
  });

  /**
   * Fails against: a route that drops suggestions silently.
   *
   * A29d requires the count to reach the user: a shorter list with no
   * explanation makes the model's error invisible.
   */
  it('reports how many suggestions were dropped', async () => {
    await seedCollection();
    analyse.mockResolvedValue({ ...ONE_SUGGESTION, dropped: 2 });

    const body = await (await call()).json();

    expect(body.data.dropped).toBe(2);
  });

  /**
   * Fails against: a spent slot on a failed call.
   *
   * An unreadable response DID cost a request against the account, so the slot
   * is consumed. Refunding it would let a persistently failing model be
   * retried without limit — the opposite of what the quota protects.
   */
  it('a failed analysis still consumes its slot', async () => {
    await seedCollection();
    analyse.mockResolvedValue({ ok: false, reason: 'unreadable' });

    await call();

    expect(await db.select().from(llmRequests)).toHaveLength(1);
  });
});
