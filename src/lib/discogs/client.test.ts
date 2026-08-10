import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscogsError, createDiscogsClient } from './client';

/**
 * SPEC.md §6, the transport every Discogs call routes through.
 *
 * CLAUDE.md §2: "Always mock Discogs and the Anthropic API. Never allow a test
 * to make a live external call — not even 'just once to check.'" `fetch` is
 * injected rather than stubbed globally, so a test that forgets to mock it
 * fails with a missing dependency instead of quietly reaching the network.
 *
 * Nothing here parses a payload — normalization is unit 3. This file is about
 * headers, retries, waiting and errors.
 */

const TOKEN = 'test-token';

/** MAX_RETRIES in client.ts is 3, so 1 initial attempt + 3 retries. */
const MAX_ATTEMPTS = 4;

/** MAX_ELAPSED_MS in client.ts: the total-time ceiling on one logical request. */
const MAX_ELAPSED_MS = 10_000;

/** A clock and a sleep the test drives, so no test waits in real time. */
function harness() {
  let now = 0;
  const slept: number[] = [];

  return {
    now: () => now,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeClient(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  const h = harness();
  const client = createDiscogsClient({
    token: TOKEN,
    userAgent: 'RecordCollection/0.1 +https://example.test',
    fetch: fetchImpl,
    now: h.now,
    sleep: h.sleep,
    ...overrides,
  });

  return { client, h };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request headers', () => {
  it('sends the token as an Authorization header', async () => {
    // §6: "personal access token in DISCOGS_TOKEN, sent as
    // `Authorization: Discogs token=...`".
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/1');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe(`Discogs token=${TOKEN}`);
  });

  it('sends a User-Agent, which Discogs rejects requests without', async () => {
    /**
     * §6 calls this REQUIRED and it is confirmed by hand against the live API.
     * A missing User-Agent fails every request, so it is worth its own
     * assertion rather than being implied by the happy path.
     */
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/1');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const agent = new Headers(init.headers).get('user-agent');

    expect(agent).toBeTruthy();
    // Descriptive, per §6 — a bare "node" or an empty string is what gets
    // blocked, and both would satisfy a mere toBeTruthy.
    expect(agent).toMatch(/RecordCollection/);
  });

  it('refuses to construct a client without a User-Agent', () => {
    expect(() =>
      createDiscogsClient({
        token: TOKEN,
        userAgent: '   ',
        fetch: vi.fn() as unknown as typeof fetch,
      }),
    ).toThrow(/user-agent/i);
  });

  it('never puts the token in the URL', async () => {
    // A token in a query string lands in logs and proxies. It belongs in a
    // header, and only there.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/database/search', { q: 'discharge' });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).not.toContain(TOKEN);
  });

  it('encodes query parameters and drops absent ones', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/database/search', {
      artist: 'Discharge & Co',
      catno: undefined,
      q: '',
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('artist=Discharge+%26+Co');
    expect(url, 'an absent param is not sent as "undefined"').not.toContain('catno');
    // An empty string is absence, not a filter for "" — the coercion class in
    // NOTES, in query-string form.
    expect(url, 'an empty param is not sent as an empty filter').not.toContain('q=');
  });
});

describe('rate limiting', () => {
  it('waits rather than exceeding the limit', async () => {
    /**
     * §6: 60/minute. The 61st call in a window must WAIT — not fail, and not
     * fire and hope. Driving 61 calls is the only way to observe the boundary;
     * asserting on the limiter's internals would test the limiter, which
     * limiter.test.ts already does.
     */
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client, h } = makeClient(fetchMock as unknown as typeof fetch);

    for (let i = 0; i < 60; i += 1) await client.get(`/releases/${i}`);
    expect(h.slept, 'the first 60 are free').toEqual([]);

    await client.get('/releases/61');

    expect(h.slept.length, 'the 61st waited').toBe(1);
    expect(h.slept[0]).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(61);
  });
});

describe('429 handling', () => {
  it('respects Retry-After and then succeeds', async () => {
    // §6: "On 429, respect Retry-After".
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'retry-after': '3' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { client, h } = makeClient(fetchMock as unknown as typeof fetch);

    await expect(client.get('/releases/1')).resolves.toEqual({ ok: true });

    expect(h.slept, 'Retry-After is seconds, and it waited that long').toEqual([3_000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a clear error rather than silently failing when it keeps 429ing', async () => {
    /**
     * §6: "surface a clear error to the client rather than silently failing".
     * Returning undefined or an empty result here would read to the caller as
     * "Discogs has nothing", which is the absence-as-success shape.
     */
    const fetchMock = vi.fn(
      async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }),
    );

    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const error = await client.get('/releases/1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DiscogsError);
    expect((error as DiscogsError).status).toBe(429);
    expect((error as DiscogsError).message).toMatch(/rate limit/i);
  });

  it('gives up after a bounded number of retries', async () => {
    /**
     * Unbounded retrying against a limiter that keeps saying no is a hang, and
     * a hung request in a route handler is a hung page.
     *
     * This test was originally unable to catch the removal of
     * `attempt >= MAX_RETRIES`: the loop spun on an injected `sleep` that
     * resolves immediately, never yielded, and killed the vitest worker before
     * any assertion or `testTimeout` could fire. It constrained the retry COUNT
     * and not the absence of a hang, and said so.
     *
     * **The deadline below closed that.** With `MAX_ELAPSED_MS` in place,
     * removing the attempt bound now FAILS here rather than crashing — the
     * runaway loop terminates on time instead of running forever, so the
     * assertion is reached. Two bounds, and each one makes the other testable.
     */
    const fetchMock = vi.fn(
      async () => new Response('', { status: 429, headers: { 'retry-after': '1' } }),
    );

    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const error = await client.get('/releases/1').catch((thrown: unknown) => thrown);

    // It stopped on its OWN terms — a DiscogsError, not the mock's escape
    // hatch, which would mean it was still going when the ceiling caught it.
    expect(error).toBeInstanceOf(DiscogsError);
    expect((error as DiscogsError).status).toBe(429);

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect(fetchMock.mock.calls.length, 'it did retry, rather than failing at once').toBeGreaterThan(
      1,
    );
  });

  it('gives up once the total deadline passes, however few attempts that took', async () => {
    /**
     * A SECOND bound, on elapsed time rather than attempt count, because the
     * two fail differently and the attempt bound cannot be tested for its own
     * removal (see the note above).
     *
     * The production risk is not an OOM — that is what a vitest worker does.
     * In a Vercel function an unbounded retry is a WEDGED REQUEST holding
     * execution time until the platform kills it, with the user watching a
     * spinner. A deadline caps that at a known number of seconds regardless of
     * how the attempt accounting behaves.
     *
     * Unlike the attempt bound, removing this one FAILS rather than hangs: a
     * single enormous Retry-After trips it on the first retry, so the test
     * never needs the loop to run away.
     */
    const fetchMock = vi.fn(
      async () =>
        // 60s: well inside MAX_RETRIES, so only the deadline can stop this.
        new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    );

    const { client, h } = makeClient(fetchMock as unknown as typeof fetch);

    const error = await client.get('/releases/1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DiscogsError);
    expect((error as DiscogsError).status).toBe(429);

    // It refused BEFORE sleeping a minute, rather than waiting and then failing.
    const slept = h.slept.reduce((total, ms) => total + ms, 0);
    expect(slept, 'never waits longer than the deadline allows').toBeLessThanOrEqual(
      MAX_ELAPSED_MS,
    );
    expect(fetchMock.mock.calls.length, 'it stopped on time, not on attempts').toBeLessThan(
      MAX_ATTEMPTS,
    );
  });

  it('does not wait past the deadline even when Retry-After asks for longer', async () => {
    // A hostile or broken `Retry-After: 3600` must not park a request for an
    // hour. Discogs' header is respected up to OUR ceiling, not beyond it.
    const fetchMock = vi.fn(
      async () => new Response('', { status: 429, headers: { 'retry-after': '3600' } }),
    );

    const { client, h } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/1').catch(() => undefined);

    const slept = h.slept.reduce((total, ms) => total + ms, 0);
    expect(slept).toBeLessThanOrEqual(MAX_ELAPSED_MS);
  });

  it('falls back to a sane wait when Retry-After is missing or junk', async () => {
    // The header is not guaranteed, and `Retry-After: soon` must not become
    // NaN and then an instant retry loop.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': 'soon' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { client, h } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/1');

    expect(h.slept).toHaveLength(1);
    expect(h.slept[0]).toBeGreaterThan(0);
    expect(Number.isNaN(h.slept[0])).toBe(false);
  });
});

describe('other failures', () => {
  it('reports a 404 as a typed error carrying the status', async () => {
    const fetchMock = vi.fn(async () => new Response('Not Found', { status: 404 }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const error = await client.get('/releases/999').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DiscogsError);
    expect((error as DiscogsError).status).toBe(404);
  });

  it('does not retry a 404', async () => {
    // Retrying a deterministic failure just multiplies the latency.
    const fetchMock = vi.fn(async () => new Response('Not Found', { status: 404 }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/999').catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure as a typed error rather than leaking the cause', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const error = await client.get('/releases/1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DiscogsError);
    // The cause is kept for the log, not for the response body.
    expect((error as DiscogsError).cause).toBeInstanceOf(TypeError);
  });

  it('reports malformed JSON as an error rather than returning undefined', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html>gateway error</html>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await expect(client.get('/releases/1')).rejects.toBeInstanceOf(DiscogsError);
  });

  it('never includes the token in an error message', async () => {
    // Errors reach logs and, via withErrorHandling, the operator. §5 forbids
    // stack traces in responses; a leaked credential would be worse.
    const fetchMock = vi.fn(async () => new Response('denied', { status: 401 }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const error = (await client.get('/releases/1').catch((e: unknown) => e)) as DiscogsError;

    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});

describe('concurrency', () => {
  /**
   * THE SECURITY FINDING, and the reason every rate-limit test above is
   * insufficient: they drive the client SEQUENTIALLY, so `waitMs()` and
   * `take()` are never interleaved.
   *
   * Measured before the fix: 200 concurrent `get()` against a 60/minute bucket
   * gave `maxInFlight: 200`. A complete bypass, not a partial one — and both
   * `matchOwnershipForResults` and the versions endpoint fan out with
   * `Promise.all` on the ordinary path, so normal use triggers it.
   */
  it('never has more requests in flight than the bucket allows', async () => {
    /**
     * The clock does NOT advance while a caller sleeps, which is what makes
     * this test honest.
     *
     * The default harness moves the clock inside `sleep`, so each waiting
     * caller's wake-up refilled the bucket for the next one and all 200 ran
     * regardless of the fix — the harness modelled 200 requests spread over
     * minutes rather than 200 at once. Probed to establish that: `reserve()`
     * returns 60 free then 1000/2000/3000ms staggered against a stable clock,
     * and one identical 1000ms to everyone against a jumping one.
     *
     * A sleep that resolves without moving time is the correct model of
     * concurrency: every caller arrives in the same instant.
     */
    let inFlight = 0;
    let maxInFlight = 0;

    const fetchMock = (async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yields, so concurrency is observable rather than instantaneous.
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const { client } = makeClient(fetchMock, {
      now: () => 0,
      sleep: async () => {
        await new Promise((resolve) => setImmediate(resolve));
      },
    });

    const attempts = Array.from({ length: 200 }, (_, i) =>
      client.get(`/releases/${i}`).catch(() => undefined),
    );
    await Promise.all(attempts);

    expect(maxInFlight, '60 per minute is a ceiling, not a suggestion').toBeLessThanOrEqual(60);
  });

  it('still completes every concurrent request', async () => {
    // Rate limiting must DELAY, never drop. A limiter that lost requests would
    // silently return fewer results than the caller asked for.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const results = await Promise.all(
      Array.from({ length: 120 }, (_, i) => client.get(`/releases/${i}`)),
    );

    expect(results).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(120);
  });
});

describe('a slow response', () => {
  /**
   * §6's deadline claimed a wall-clock guarantee it did not provide: it bounded
   * the GAPS between attempts and never a single hung response, because no
   * `AbortSignal` reached `fetch`.
   *
   * The existing deadline tests resolve immediately and would pass with no
   * timeout at all — the security review's point exactly.
   */
  it('gives up on a fetch that never resolves', async () => {
    /**
     * A REAL timeout, deliberately short, because this is the one property that
     * cannot be tested on a fake clock: the abort has to fire from the same
     * timer system the fetch is waiting on.
     *
     * 50ms rather than the production 10s so the suite does not wait — the
     * ceiling is injected for exactly this reason.
     */
    const neverResolves = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        // Rejects the way a real fetch does when its signal aborts.
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }) as unknown as typeof fetch;

    const client = createDiscogsClient({
      token: TOKEN,
      userAgent: 'RecordCollection/0.1 +https://example.test',
      fetch: neverResolves,
      maxElapsedMs: 50,
    });

    const error = await client.get('/releases/1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DiscogsError);
    expect((error as DiscogsError).message).toMatch(/took too long|timed out/i);
  });

  it('bounds the request by the REMAINING deadline, not a fresh timeout', async () => {
    /**
     * The two bounds must compose. A per-request timeout reset on every attempt
     * would let three retries take three times the promised budget — the
     * deadline would bound the gaps and the timeout would bound each response,
     * with nothing bounding the whole.
     */
    let observed: number | undefined;

    const slow = (async (_url: string, init?: RequestInit) => {
      const started = Date.now();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          observed = Date.now() - started;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }) as unknown as typeof fetch;

    const client = createDiscogsClient({
      token: TOKEN,
      userAgent: 'RecordCollection/0.1 +https://example.test',
      fetch: slow,
      maxElapsedMs: 60,
    });

    await client.get('/releases/1').catch(() => undefined);

    expect(observed, 'aborted at the deadline, not later').toBeLessThan(200);
  });

  it('passes an AbortSignal to fetch, which is what makes that possible', async () => {
    // Asserted directly as well as behaviourally: a client that timed out its
    // own promise while leaving the request running would pass the test above
    // and still hold a connection open.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get('/releases/1');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal, 'the request itself is bounded').toBeDefined();
  });
});
