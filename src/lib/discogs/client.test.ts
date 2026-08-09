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
     * **This test constrains the retry COUNT, not the absence of a hang, and
     * the difference is worth stating.** Removing the `attempt >= MAX_RETRIES`
     * guard does not make this test fail — it makes the vitest worker die
     * ("Worker exited unexpectedly"), because the loop spins on an injected
     * `sleep` that resolves immediately, never yields, and exhausts memory
     * before any assertion or `testTimeout` can fire.
     *
     * Two attempts to convert that into a clean failure were abandoned per
     * CLAUDE.md §9: a mock that throws after a ceiling is caught by the
     * client's own network-error branch and feeds the loop, and one that
     * returns a non-retryable status still dies before reaching the ceiling.
     * The honest summary is that an unbounded client is caught LOUDLY but not
     * as an assertion. Recorded rather than papered over, and in NOTES.
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
