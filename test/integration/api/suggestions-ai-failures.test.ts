import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, genres, llmRequests, records, recordGenres } from '@/db/schema';

/**
 * SPEC.md §9.2's failure boundary — R5's F1, reproduced before it is fixed.
 *
 * **The live run is what made this urgent.** A placeholder `ANTHROPIC_API_KEY`
 * of the `sk-ant-...-put-your-key-here` shape passed `isAnthropicConfigured()`,
 * claimed a rate-limit slot, and produced `500 INTERNAL_ERROR / "Internal
 * server error"` — for a credential the API had explicitly rejected. That is not
 * error copy: it is why the feature did not work, and the 500 sent the reader to
 * application logs for a deployment problem the app had already been told about
 * in words.
 *
 * §9.2 (A29b) requires a legible refusal for the quota and a user-visible error
 * rather than a crash for a parse failure. An upstream auth rejection is the
 * third case and had no handling at all.
 */

const analyse = vi.fn();
const configured = vi.fn(() => true);

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/client')>();
  return {
    ...actual,
    getGapAnalysisClient: () => ({ analyse }),
    isAnthropicConfigured: () => configured(),
  };
});

const { POST } = await import('@/app/api/suggestions/ai/route');

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  analyse.mockReset();
  configured.mockReset();
  configured.mockReturnValue(true);
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

/** What the SDK actually throws on a rejected key, as captured from the live run. */
function authenticationError() {
  return Object.assign(
    new Error(
      '401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."},"request_id":null}',
    ),
    { status: 401 },
  );
}

describe('an upstream credential rejection', () => {
  /**
   * Fails against: the current route, which lets the SDK throw reach
   * `withErrorHandling` and become `500 INTERNAL_ERROR`.
   *
   * **Measured live, not imagined.** This is the exact error the dev server
   * logged, and the user saw "Internal server error" for it.
   */
  it('is not reported as an internal error', async () => {
    await seedCollection();
    analyse.mockRejectedValue(authenticationError());

    const response = await call();
    const body = await response.json();

    expect(response.status).not.toBe(500);
    expect(body.error.code).not.toBe('INTERNAL_ERROR');
  });

  /**
   * Fails against: a route with no case for it.
   *
   * 502, alongside `LLM_UNREADABLE`: the failure is UPSTREAM rather than ours.
   * A distinct code so the UI can say something true about a credential instead
   * of offering a retry.
   */
  it('is a 502 with its own code', async () => {
    await seedCollection();
    analyse.mockRejectedValue(authenticationError());

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_UNAUTHORIZED');
  });

  /**
   * Fails against: a message that tells the user to try again.
   *
   * **A 401 is not transient.** The UI's generic "Try again." is wrong advice
   * for a credential the API has rejected — it will fail identically every time.
   * The message must describe a deployment problem.
   */
  it('does not advise a retry', async () => {
    await seedCollection();
    analyse.mockRejectedValue(authenticationError());

    const body = await (await call()).json();

    expect(body.error.message).not.toMatch(/try again/i);
  });

  /**
   * Fails against: a message naming the environment variable.
   *
   * **`errors.ts`'s own rule, which the current route breaks.** `notConfigured`
   * documents it: the message "must say what is unavailable in the user's terms
   * and never name the environment variable, which reaches a browser and
   * describes the deployment's shape." The images route obeys it ("Add a Vercel
   * Blob store"); `/api/suggestions/ai` says "Set ANTHROPIC_API_KEY."
   *
   * Found by reading the module's contract rather than from the live run, and
   * it applies to BOTH the unconfigured and the rejected paths.
   */
  it('never names the environment variable', async () => {
    await seedCollection();
    analyse.mockRejectedValue(authenticationError());

    const body = await (await call()).json();

    expect(body.error.message).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  /**
   * Fails against: the current route, which claims a slot before the call and
   * keeps it whatever happens.
   *
   * **The call was never billed.** An unreadable response DID cost the account,
   * so §9.2 is right to keep that slot — but a rejected credential never reached
   * the model. Ten clicks against a bad key currently exhaust an hour's budget
   * for requests that did not happen, which is a quota punishing the user for a
   * deployment fault.
   */
  it('refunds the slot, because nothing was billed', async () => {
    await seedCollection();
    analyse.mockRejectedValue(authenticationError());

    await call();

    expect(await db.select().from(llmRequests)).toHaveLength(0);
  });
});

describe('the slot is still spent when the account WAS charged', () => {
  /**
   * Fails against: a refund applied to every failure.
   *
   * The inverse of the test above, and the reason the refund must be narrow. An
   * unreadable response is a completed, billed call. Refunding it would let a
   * persistently failing model be retried without limit — the opposite of what
   * the quota protects.
   */
  it('an unreadable response keeps its slot', async () => {
    await seedCollection();
    analyse.mockResolvedValue({ ok: false, reason: 'unreadable' });

    await call();

    expect(await db.select().from(llmRequests)).toHaveLength(1);
  });

  /**
   * Fails against: a refund that fires for any thrown error.
   *
   * A 529 overload or a 500 from Anthropic means the request reached them and
   * may well have been counted. Only an AUTH failure is known not to have been
   * billed, so only that one is refunded — anything else keeps its slot, which
   * is the safe direction for a quota.
   */
  it('a non-auth upstream failure keeps its slot', async () => {
    await seedCollection();
    analyse.mockRejectedValue(Object.assign(new Error('529 overloaded_error'), { status: 529 }));

    await call();

    expect(await db.select().from(llmRequests)).toHaveLength(1);
  });
});

describe('the unconfigured path obeys the same message rule', () => {
  /**
   * Fails against: the current route's "AI suggestions are not configured. Set
   * ANTHROPIC_API_KEY."
   *
   * **This branch has never been exercised** — R5's finding 6. The integration
   * suite hardcodes `isAnthropicConfigured: () => true`, so the 503 was written
   * and never run.
   */
  it('returns 503 and names no environment variable', async () => {
    await seedCollection();
    configured.mockReturnValue(false);

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(body.error.message).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  /**
   * Fails against: an unconfigured route that spends a slot or calls the model.
   *
   * Nothing was billed and nothing can be, so the budget must be untouched.
   */
  it('spends no slot and does not call the model', async () => {
    await seedCollection();
    configured.mockReturnValue(false);

    await call();

    expect(analyse).not.toHaveBeenCalled();
    expect(await db.select().from(llmRequests)).toHaveLength(0);
  });
});
