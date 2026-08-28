import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desc } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, genres, llmRequests, records, recordGenres } from '@/db/schema';
import { LLM_REQUESTS_PER_HOUR } from '@/lib/llm/rate-limit';
import { GAP_ANALYSIS_MAX_TOKENS } from '@/lib/llm/client';
import { logger } from '@/lib/logger';
import { latestGapAnalysis } from '@/lib/db/queries/gap-analysis';

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

const { GET, POST } = await import('@/app/api/suggestions/ai/route');

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
    analyse.mockResolvedValue({
      ok: false,
      reason: 'malformed',
      length: 42,
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    });

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
    analyse.mockResolvedValue({
      ok: false,
      reason: 'malformed',
      length: 42,
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    });

    await call();

    expect(await db.select().from(llmRequests)).toHaveLength(1);
  });
});

/**
 * SPEC.md §5.8 — the diagnostic and the copy, both added 2026-08-26 after a
 * live failure that could not be diagnosed.
 *
 * Adam's gap analysis over 17 records returned 502 `LLM_UNREADABLE` and nothing
 * anywhere recorded why: the parser collapsed both failures into one value, the
 * route logged nothing, and `withErrorHandling` only logs THROWN errors while
 * this is a RETURNED response.
 */
describe('why the response could not be read, and what the user is told', () => {
  const truncated = {
    ok: false as const,
    reason: 'cut' as const,
    length: 3980,
    stopReason: 'max_tokens',
    inputTokens: 1200,
    outputTokens: 4000,
  };

  /**
   * **The copy R6's 401 lesson demands.** "Try again" was advice the app had no
   * reason to believe: a truncated answer stops in the same place, and the
   * retry costs another of ten hourly requests.
   *
   * Fails against a single message for both failure kinds.
   */
  it('tells a truncated response apart from an unreadable one', async () => {
    analyse.mockResolvedValue(truncated);

    const response = await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.message).toContain('ran out of room');
    expect(body.error.message).toContain('stop at the same place');

    /*
     * **A37 softened this from "will likely" to "may"**, and the reason is a
     * measurement rather than a preference. With at most six suggestions asked
     * for, a response that still truncates did so writing unusually long
     * reasons — roughly 2.5x headroom at six — so a retry is worth something
     * here in a way it was not when the model returned 34 unbounded.
     *
     * The message stays for the genuine case; it is no longer the expected one.
     */
    expect(body.error.message).toContain('may stop at the same place');
  });

  /**
   * **The cost, named.** A slot was spent whatever the outcome (§9.2's refund
   * covers 401 and 403 only), and the screen did not say so — information the
   * app had and the user could not see.
   */
  it('says a request was spent, on both failure kinds', async () => {
    for (const result of [truncated, { ...truncated, reason: 'malformed' as const, stopReason: 'end_turn' }]) {
      analyse.mockResolvedValue(result);

      const response = await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
      const body = await response.json();

      expect(body.error.message).toMatch(/one of your ten hourly requests/i);
    }
  });

  /**
   * **The cause the app must NOT assert** (Adam, 2026-08-26).
   * `stop_reason: max_tokens` proves the answer ran out of room. It does not
   * prove the collection is why — the model could have written a few verbose
   * suggestions about four records. Naming the collection would publish a
   * hypothesis as a diagnosis.
   *
   * Fails against copy that blames the collection's size.
   */
  it('does not blame the collection for a truncated answer', async () => {
    analyse.mockResolvedValue(truncated);

    const response = await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    const body = await response.json();

    expect(body.error.message).not.toMatch(/collection|outgrown|too (large|big|many)/i);
  });

  /**
   * **The log, and SHAPE ONLY.** The prompt carries the user's artists, labels
   * and want-list titles, so the reply can echo them, and Vercel logs are
   * readable by anyone with dashboard access. `describeError` became a redacted
   * projection for this reason after R6 reproduced a credential in a log line —
   * a deliberate log must not get a weaker standard than an accidental one.
   *
   * Fails against a route that logs nothing (the live defect), and against one
   * that logs response text.
   */
  it('logs stop_reason and token counts, and no response text', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(logger, 'error').mockImplementation((_scope, message) => {
      errors.push(message);
    });

    analyse.mockResolvedValue(truncated);
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    spy.mockRestore();

    const line = errors.join('\n');
    expect(line, 'the diagnostic that did not exist').toContain('stop_reason=max_tokens');
    expect(line).toContain('reason=cut');
    expect(line).toContain('out_tokens=4000');
    expect(line).toContain(`max_tokens=${GAP_ANALYSIS_MAX_TOKENS}`);
  });
});

/**
 * SPEC.md §4.3 (A38, 2026-08-26) — what a call COST, recorded on both paths.
 *
 * **The defect this fixes, and it is mine.** After A37 shipped I asked Adam for
 * the `out_tokens` of a successful run, having built a diagnostic that only
 * fires on failure: the log sits inside `!result.ok`, `llm_requests` had no
 * token columns, and `vercel logs` tails forward. The count was gone and the
 * 2.5x headroom estimate stayed an estimate.
 *
 * Same shape as the defect it was built to fix, one branch over — "a failure
 * records nothing" became "a success records nothing". **The success path is
 * where the BASELINE lives**, and it is invisible when a diagnostic is written
 * during an incident because nothing is going wrong on it.
 */
describe('what a call cost is recorded, on success as well as failure', () => {
  const usage = { stopReason: 'end_turn', inputTokens: 1533, outputTokens: 530 };

  /**
   * **The one that would have answered Adam's question.** Fails against the
   * shipped code, where `analyse` drops usage on success in a single ternary
   * (`parsed.ok ? parsed : {...parsed, ...observed}`).
   */
  it('records tokens for a SUCCESSFUL gap analysis', async () => {
    analyse.mockResolvedValue({
      ok: true,
      suggestions: [{ artist: 'Crass', title: 'Feeding', reason: 'x', genre: 'UK82' }],
      dropped: 0,
      ...usage,
    });

    const response = await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    expect(response.status).toBe(200);

    const [row] = await getTestDb()
      .select()
      .from(llmRequests)
      .orderBy(desc(llmRequests.requestedAt))
      .limit(1);

    expect(row.outputTokens, 'the baseline the headroom estimate needs').toBe(530);
    expect(row.inputTokens).toBe(1533);
    expect(row.stopReason).toBe('end_turn');
  });

  /** The failure path keeps recording, so a truncation is comparable to a success. */
  it('records tokens for a TRUNCATED gap analysis too', async () => {
    analyse.mockResolvedValue({
      ok: false,
      reason: 'cut',
      length: 3399,
      stopReason: 'max_tokens',
      inputTokens: 1533,
      outputTokens: 4000,
    });

    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    const [row] = await getTestDb()
      .select()
      .from(llmRequests)
      .orderBy(desc(llmRequests.requestedAt))
      .limit(1);

    expect(row.outputTokens).toBe(4000);
    expect(row.stopReason).toBe('max_tokens');
  });

  /**
   * **NULL means "not measured", never zero** (A38's first constraint).
   *
   * Rows predating the migration have unknown usage, and a `DEFAULT 0` would
   * fabricate a measurement for a call nobody measured — the same reasoning
   * that keeps `completed_at` nullable, and the same distinction as the two
   * pre-existing rows whose NULL means "this predates the question".
   *
   * Fails against a defaulted column.
   */
  it('leaves usage NULL when the transport reported none', async () => {
    analyse.mockResolvedValue({
      ok: true,
      suggestions: [],
      dropped: 0,
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
    });

    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    const [row] = await getTestDb()
      .select()
      .from(llmRequests)
      .orderBy(desc(llmRequests.requestedAt))
      .limit(1);

    expect(row.outputTokens, 'unknown is not zero').toBeNull();
    expect(row.stopReason).toBeNull();
  });
});

/**
 * SPEC.md §9.2 (A39) — the route STORES what it said, and never serves it.
 *
 * **Here rather than in E2E, and the first attempt is the lesson.** An E2E spec
 * stubbed `POST /api/suggestions/ai` with `page.route` and then asserted the
 * answer survived navigation — but stubbing the route means the real handler
 * never runs, so nothing was ever written. `gap_analysis_results` held 0 rows
 * while the test claimed to be testing persistence.
 *
 * Same family as the hollow test a mutation caught in A38: an assertion placed
 * where the code it names cannot execute. The behaviour is the ROUTE writing to
 * the database, so it belongs against a real database with the real handler.
 */
describe('the route records what it said', () => {
  const answer = {
    ok: true as const,
    suggestions: [{ artist: 'Rudimentary Peni', title: 'Death Church', reason: 'r', genre: 'UK82' }],
    dropped: 1,
    stopReason: 'end_turn',
    inputTokens: 1200,
    outputTokens: 480,
  };

  it('stores a successful analysis so it can be shown again', async () => {
    analyse.mockResolvedValue(answer);

    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    const stored = await latestGapAnalysis();

    expect(stored?.suggestions).toEqual(answer.suggestions);
    expect(stored?.dropped).toBe(1);
  });

  /**
   * **A failure must not overwrite a good answer.** The user's last real result
   * is what the screen shows; replacing it with nothing because a later request
   * was truncated would destroy the thing this feature exists to keep.
   *
   * Fails against a route that stores unconditionally.
   */
  it('leaves the stored answer alone when a later call fails', async () => {
    analyse.mockResolvedValue(answer);
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    analyse.mockResolvedValue({
      ok: false,
      reason: 'cut',
      length: 3399,
      stopReason: 'max_tokens',
      inputTokens: 1533,
      outputTokens: 4000,
    });
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    const stored = await latestGapAnalysis();

    expect(stored?.suggestions, 'the good answer survives a failed re-ask').toEqual(
      answer.suggestions,
    );
  });

  /**
   * **"Suggest" always calls.** Persisting removes the REASON to re-ask; it must
   * never intercept the ask. A route that returned the stored answer would be a
   * button that lies about what it did.
   *
   * Fails against a short-circuit that serves from the store.
   */
  it('calls the model again even when a stored answer exists', async () => {
    analyse.mockResolvedValue(answer);
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    analyse.mockClear();
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    expect(analyse, 'a second ask must reach the model').toHaveBeenCalledTimes(1);
  });
});

/**
 * SPEC.md §12d (A45) — the genre drill-down, at the ROUTE.
 *
 * **Not in E2E, and the reason is a fixture that is not mine to change.** The
 * `/suggestions` ask button renders only when `isAnthropicConfigured()`, and
 * `ANTHROPIC_API_KEY` is deliberately absent from `.env.test` — `snippet.spec.ts`
 * asserts the UNCONFIGURED state, so that absence is a fixture two specs depend
 * on. An E2E clicking the button would need a key, and adding one broke the
 * snippet spec when it was tried (recorded at A39).
 *
 * **So the behaviour is covered where it actually runs.** These exercise the
 * real handler against a real database, which is stronger than a stubbed E2E
 * would have been anyway.
 */
describe('the gap analysis can be scoped to a genre', () => {
  const answer = {
    ok: true as const,
    suggestions: [{ artist: 'Discharge', title: 'Hear Nothing', reason: 'r', genre: 'UK82' }],
    dropped: 0,
    stopReason: 'end_turn',
    inputTokens: 400,
    outputTokens: 200,
  };

  async function seedGenre(name: string) {
    const [genre] = await getTestDb().insert(genres).values({ name }).returning();
    return genre;
  }

  it('stores a scoped answer without touching the collection-wide one', async () => {
    const genre = await seedGenre('UK82');
    analyse.mockResolvedValue(answer);

    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    await POST(
      new Request(`http://localhost/api/suggestions/ai?genreId=${genre.id}`, { method: 'POST' }),
    );

    expect((await latestGapAnalysis())?.suggestions, 'collection-wide survives').toHaveLength(1);
    expect((await latestGapAnalysis(genre.id))?.suggestions, 'and the scope has its own').toHaveLength(1);
  });

  /** A bad scope must not cost one of ten requests. */
  it('rejects an unknown genre before claiming a slot', async () => {
    const before = await getTestDb().select().from(llmRequests);

    const response = await POST(
      // A well-formed v4 uuid that names nothing: the 400 branch is tested
      // separately, and this must reach the NOT-FOUND branch to mean anything.
      new Request('http://localhost/api/suggestions/ai?genreId=11111111-2222-4333-8444-555555555555', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(404);
    const after = await getTestDb().select().from(llmRequests);
    expect(after.length, 'a 404 spends nothing').toBe(before.length);
  });

  it('rejects a malformed genre id as a 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/suggestions/ai?genreId=not-a-uuid', { method: 'POST' }),
    );

    expect(response.status).toBe(400);
  });
});

/**
 * SPEC.md §12d (A45) — reading a stored answer for a scope, without asking.
 *
 * **The defect this closes, found by Adam:** switching the picker back to
 * "Whole collection" showed nothing, while the answer sat in the database. The
 * page reads one scope's answer server-side at load and the client cleared the
 * display on a scope change — correctly, since a different scope is a different
 * question — but nothing re-read the store for the newly selected scope.
 *
 * **A GET, deliberately.** §9.2 makes POST the verb because a POST spends a
 * request; reading a stored answer spends nothing, so it must not be the same
 * verb — or the read would be indistinguishable from an ask.
 */
describe('reading a stored answer costs nothing', () => {
  const answer = {
    ok: true as const,
    suggestions: [{ artist: 'Crass', title: 'Feeding', reason: 'r', genre: 'UK82' }],
    dropped: 0,
    stopReason: 'end_turn',
    inputTokens: 400,
    outputTokens: 200,
  };

  it('returns the collection-wide answer without spending a request', async () => {
    analyse.mockResolvedValue(answer);
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));

    const before = await getTestDb().select().from(llmRequests);
    const response = await GET(new Request('http://localhost/api/suggestions/ai'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);

    const after = await getTestDb().select().from(llmRequests);
    expect(after.length, 'reading spends nothing').toBe(before.length);
  });

  it('returns the answer for a scope, distinct from the collection-wide one', async () => {
    const [genre] = await getTestDb().insert(genres).values({ name: 'UK82' }).returning();

    analyse.mockResolvedValue(answer);
    await POST(new Request('http://localhost/api/suggestions/ai', { method: 'POST' }));
    analyse.mockResolvedValue({ ...answer, suggestions: [], dropped: 3 });
    await POST(
      new Request(`http://localhost/api/suggestions/ai?genreId=${genre.id}`, { method: 'POST' }),
    );

    const wide = await (await GET(new Request('http://localhost/api/suggestions/ai'))).json();
    const scoped = await (
      await GET(new Request(`http://localhost/api/suggestions/ai?genreId=${genre.id}`))
    ).json();

    expect(wide.data.suggestions, 'the collection-wide answer is still readable').toHaveLength(1);
    expect(scoped.data.dropped, 'and the scope has its own').toBe(3);
  });

  /**
   * **Never asked is not the same as asked-and-empty**, which is the
   * distinction A39 built and this read must preserve: `null` means nobody
   * asked, an empty suggestions array means the model was asked and had nothing.
   */
  it('reports null for a scope never asked about', async () => {
    const [genre] = await getTestDb().insert(genres).values({ name: 'Jazz' }).returning();

    const response = await GET(
      new Request(`http://localhost/api/suggestions/ai?genreId=${genre.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data, 'nobody asked, so there is no answer').toBeNull();
  });
});
