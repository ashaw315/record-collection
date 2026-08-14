import { describe, expect, it, vi } from 'vitest';
import { MusicBrainzError, createMusicBrainzClient } from './client';

/**
 * SPEC.md §12 step 11 — the MusicBrainz transport.
 *
 * **Stricter than Discogs in two ways that are not negotiable**, both verified
 * against their current documentation rather than recalled:
 *
 *   - **one request per second** per source IP, enforced all-or-nothing. They
 *     decline the request entirely rather than throttling it, so exceeding the
 *     rate does not slow us down — it fails us.
 *   - **a `User-Agent` carrying contact information.** Without it we are
 *     classified as an anonymous agent and subject to harsher throttling.
 *
 * Their breach code is **503**, not Discogs' 429 — a difference worth encoding
 * rather than assuming the two APIs behave alike.
 *
 * `fetch`, the clock and `sleep` are injected, as in the Discogs client: it
 * makes the module testable without real timers, and a test that forgets to
 * supply a fake `fetch` fails loudly instead of reaching the live API.
 */

/** A minimal artist payload — this layer does not parse relations. */
const ARTIST = { id: '0c9bfbdc-4e64-497d-bf80-5c891e6766a3', name: 'Discharge' };

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function harness(responses: Array<Response | Error>) {
  let index = 0;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  });

  const slept: number[] = [];
  let clock = 0;

  const client = createMusicBrainzClient({
    contactEmail: 'someone@example.com',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms: number) => {
      slept.push(ms);
      clock += ms;
    },
  });

  return { client, calls, slept, advance: (ms: number) => (clock += ms) };
}

describe('the User-Agent MusicBrainz requires', () => {
  it('sends a User-Agent carrying contact information', async () => {
    /**
     * Their documentation: "Each request sent to MusicBrainz needs to include a
     * User-Agent header, with enough information in the User-Agent for us
     * (MusicBrainz) to contact the application maintainers."
     *
     * Asserted on the CONTACT, not merely on the header existing — a
     * User-Agent without contact details is the anonymous case they throttle
     * hardest, which would look like a rate-limit bug rather than a missing
     * header.
     */
    const { client, calls } = harness([ok(ARTIST)]);

    await client.get('/artist/abc');

    const agent = new Headers(calls[0].init?.headers).get('User-Agent');
    expect(agent, 'the app identifies itself').toMatch(/RecordCollection/);
    expect(agent, 'and can be contacted').toContain('someone@example.com');
  });

  it('refuses to construct a client with no contact information', () => {
    /**
     * A missing contact is not a degraded request, it is a violation of their
     * terms — and the failure it produces (harsher throttling) looks like
     * something else entirely. Better to fail at construction, where the cause
     * is obvious.
     */
    expect(() => createMusicBrainzClient({ contactEmail: '' })).toThrow(/contact/i);
  });
});

describe('one request per second', () => {
  it('spaces consecutive requests by at least a second', async () => {
    /**
     * Their limit is one per second per source IP, "all-or-nothing": exceeding
     * it means requests are "declined entirely" rather than slowed. So the
     * spacing has to happen on our side — there is no partial credit.
     */
    const { client, slept } = harness([ok(ARTIST), ok(ARTIST), ok(ARTIST)]);

    await client.get('/artist/one');
    await client.get('/artist/two');
    await client.get('/artist/three');

    expect(slept.length, 'the first is free, the next two wait').toBe(2);
    for (const waited of slept) {
      expect(waited, 'at least a full second between calls').toBeGreaterThanOrEqual(1000);
    }
  });

  it('does not wait when a second has already passed', async () => {
    // A user who pauses between actions must not be charged for time that has
    // already elapsed.
    const { client, slept, advance } = harness([ok(ARTIST), ok(ARTIST)]);

    await client.get('/artist/one');
    advance(5_000);
    await client.get('/artist/two');

    expect(slept, 'nothing to wait for').toEqual([]);
  });
});

describe('503 — their breach code, not 429', () => {
  it('retries a 503 and succeeds', async () => {
    /**
     * MusicBrainz returns **503 Service Unavailable** when the rate limit is
     * exceeded, where Discogs returns 429. Treating 503 as a permanent failure
     * would abandon a request that only needed to wait.
     */
    const { client } = harness([new Response('', { status: 503 }), ok(ARTIST)]);

    expect(await client.get('/artist/abc')).toEqual(ARTIST);
  });

  it('honours Retry-After when they send one', async () => {
    // Their limiter is the authority when it disagrees with our accounting.
    const { client, slept } = harness([
      new Response('', { status: 503, headers: { 'Retry-After': '3' } }),
      ok(ARTIST),
    ]);

    await client.get('/artist/abc');

    expect(slept.some((ms) => ms >= 3_000), 'waited the full three seconds').toBe(true);
  });

  it('gives up after bounded retries rather than hanging', async () => {
    /**
     * A limiter that keeps refusing must not turn into a hung page. Bounded for
     * the same reason the Discogs client is.
     */
    const { client } = harness([new Response('', { status: 503 })]);

    await expect(client.get('/artist/abc')).rejects.toThrow(MusicBrainzError);
  });
});

describe('errors say what happened', () => {
  it('maps a 404 to a not-found error rather than a retry', async () => {
    // An artist that does not exist is an answer, not a transport failure —
    // retrying it four times wastes four seconds of a one-per-second budget.
    const { client, calls } = harness([new Response('', { status: 404 })]);

    await expect(client.get('/artist/nope')).rejects.toMatchObject({ status: 404 });
    expect(calls.length, 'asked once').toBe(1);
  });

  it('does not retry a 400', async () => {
    const { client, calls } = harness([new Response('', { status: 400 })]);

    await expect(client.get('/artist/bad')).rejects.toThrow(MusicBrainzError);
    expect(calls.length).toBe(1);
  });

  it('surfaces a network failure as a MusicBrainzError, not a raw one', async () => {
    const { client } = harness([new TypeError('fetch failed')]);

    await expect(client.get('/artist/abc')).rejects.toThrow(MusicBrainzError);
  });

  it('rejects a body that is not JSON rather than returning undefined', async () => {
    /**
     * A 200 carrying HTML is what a captive portal or an outage page looks
     * like. Returning `undefined` here would read downstream as "this artist
     * has no relations" — absence reported as fact.
     */
    const { client } = harness([
      new Response('<html>maintenance</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    ]);

    await expect(client.get('/artist/abc')).rejects.toThrow(MusicBrainzError);
  });
});

describe('the request itself', () => {
  it('asks for JSON explicitly', async () => {
    // Their default is XML. `fmt=json` is what makes the payload parseable.
    const { client, calls } = harness([ok(ARTIST)]);

    await client.get('/artist/abc?inc=artist-rels');

    expect(calls[0].url).toContain('fmt=json');
    expect(calls[0].url, 'without dropping the caller’s own params').toContain('inc=artist-rels');
  });

  it('targets the MusicBrainz web service', async () => {
    const { client, calls } = harness([ok(ARTIST)]);

    await client.get('/artist/abc');

    expect(calls[0].url).toMatch(/^https:\/\/musicbrainz\.org\/ws\/2\//);
  });
});

describe('CLAUDE.md §2 — the guard is not bypassable by writing a new client', () => {
  it('refuses a live call when the REAL fetch is used', async () => {
    /**
     * The load-bearing test of this unit. The guard is gated on
     * `usesRealNetwork` so a client's own tests can inject a fake — and that
     * gate is exactly the shape that could be turned into an escape hatch by
     * someone adding a transport and forgetting the check.
     *
     * Asserted with NO `fetchImpl`, so the client falls back to the real one.
     * If this ever passes, step 11 has reopened the hole step 7 closed.
     */
    const client = createMusicBrainzClient({ contactEmail: 'someone@example.com' });

    await expect(client.get('/artist/0c9bfbdc')).rejects.toThrow(
      /forbids live external calls/i,
    );
  });

  it('names the MusicBrainz client in that refusal, not the Discogs one', async () => {
    // The advice has to be right or it sends the reader to the wrong module.
    const client = createMusicBrainzClient({ contactEmail: 'someone@example.com' });

    await expect(client.get('/artist/0c9bfbdc')).rejects.toThrow(/getMusicBrainzClient/);
  });
});
