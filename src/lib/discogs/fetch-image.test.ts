import { describe, expect, it, vi } from 'vitest';
import { createDiscogsClient, DiscogsError } from './client';

/**
 * Fetching a Discogs cover so it can be STORED rather than hot-linked
 * (SPEC.md §5.7, §5.9).
 *
 * **Hot-linking is the thing this exists to avoid.** A Discogs image URL is
 * chosen by whichever contributor edited the release, and rendering it directly
 * makes every visitor's browser issue a request to a host a stranger picked,
 * carrying their IP. That is the contributor-controlled outbound request the
 * `safeImageUrl` allow-list closed; hot-linking would reopen it on a wider axis.
 *
 * **The limiter question, answered explicitly.** Images are served from
 * `i.discogs.com` while the API is `api.discogs.com`. The existing bucket lives
 * inside `createDiscogsClient` and every call goes through `request()`, which
 * builds URLs against `API_BASE` — so it covered the API host ONLY, and an
 * image fetch outside it would let a bulk import fan out unbounded against
 * Discogs. `fetchImage` therefore hangs off the same client and spends from the
 * same bucket, which is what makes the limit real rather than nominal.
 */

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMAGE_URL = 'https://i.discogs.com/abc/cover.jpeg';

/** A response whose body streams `chunks` in order. */
function streaming(chunks: Uint8Array[], init?: { status?: number; headers?: HeadersInit }) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

function clientWith(fetchImpl: typeof fetch, options?: { now?: () => number }) {
  return createDiscogsClient({
    token: 'test-token',
    userAgent: 'RecordCollection/test',
    fetch: fetchImpl,
    now: options?.now,
    sleep: async () => {},
  });
}

describe('fetchImage', () => {
  it('returns the bytes and the sniffed type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streaming([PNG_HEADER, new Uint8Array([1, 2, 3])]));

    const result = await clientWith(fetchImpl as unknown as typeof fetch).fetchImage(IMAGE_URL);

    expect(result.contentType).toBe('image/png');
    expect(new Uint8Array(result.bytes).slice(0, 8)).toEqual(PNG_HEADER);
  });

  it('refuses a URL that is not https, without fetching it', async () => {
    /**
     * The same allow-list as `safeImageUrl`, applied before the request rather
     * than before the render. `http://` here is not merely a scheme preference:
     * the URL comes from a Discogs contributor and this fetch runs on OUR
     * server, so an attacker-chosen host would be contacted by us.
     */
    const fetchImpl = vi.fn();

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).fetchImage('http://evil.test/pixel.gif'),
    ).rejects.toThrow(DiscogsError);

    expect(fetchImpl, 'nothing may be requested at all').not.toHaveBeenCalled();
  });

  it('refuses a javascript: URL', async () => {
    const fetchImpl = vi.fn();

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).fetchImage('javascript:alert(1)'),
    ).rejects.toThrow(DiscogsError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('aborts past the size cap instead of downloading the whole thing', async () => {
    /**
     * THE case this streams for. A Discogs primary image can be large, and
     * `await response.arrayBuffer()` on a hostile or merely huge file downloads
     * every byte before anything can refuse it — the cap would be enforced only
     * after paying its entire cost.
     *
     * The stream yields one chunk past the limit; the reader must stop there.
     */
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(PNG_HEADER, 0);

    /**
     * `cancelled` is the assertion, not a chunk counter.
     *
     * A first version counted `pull` calls and expected them to stop near the
     * limit — but a ReadableStream calls `pull` EAGERLY to fill its internal
     * queue, so the count measures what was enqueued, not what crossed the
     * wire. It read 12 with the cap working perfectly. `cancel` firing is the
     * observable fact that the transfer was stopped rather than drained.
     */
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls >= 100) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        pulls += 1;
      },
      cancel() {
        cancelled = true;
      },
    });

    const fetchImpl = vi.fn().mockResolvedValue(new Response(body));

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).fetchImage(IMAGE_URL),
    ).rejects.toThrow(/too large/i);

    expect(cancelled, 'the body was cancelled rather than drained').toBe(true);
    // An unbounded source: without a cap this would run to 100MB. Stopping at
    // all is the property, and it stopped well inside the source's length.
    expect(pulls, 'it stopped rather than reading the whole 100MB').toBeLessThan(100);
  });

  it('refuses bytes that are not one of §5.9’s three types', async () => {
    // A URL ending in .jpeg proves nothing about what the host returns. The
    // same sniff-not-declare rule as the upload endpoint.
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    const fetchImpl = vi.fn().mockResolvedValue(streaming([html]));

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).fetchImage(IMAGE_URL),
    ).rejects.toThrow(/not an image/i);
  });

  it('throws on a non-OK response rather than storing an error page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).fetchImage(IMAGE_URL),
    ).rejects.toThrow(DiscogsError);
  });

  it('spends from the SAME bucket as the API calls', async () => {
    /**
     * The limiter question made into an assertion.
     *
     * Images are on `i.discogs.com` and the API on `api.discogs.com`. If
     * `fetchImage` used its own bucket — or none — a bulk import would fan out
     * unbounded against the image host: the concurrent-bypass shape again, on a
     * different axis.
     *
     * A clock frozen at one instant means no token ever refills, so the 61st
     * call in a 60/minute window MUST wait. Sixty API calls exhaust the bucket;
     * the image fetch is the 61st and has to be delayed by the same accounting.
     */
    let slept = 0;
    /**
     * A FRESH Response per call. A body can only be read once, so returning one
     * shared object made the second API call read an already-consumed stream —
     * which surfaced as "malformed response" and looked like a JSON bug.
     */
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      return url.startsWith('https://i.discogs.com')
        ? streaming([PNG_HEADER])
        : new Response(JSON.stringify({ id: 1 }), {
            headers: { 'content-type': 'application/json' },
          });
    });

    const client = createDiscogsClient({
      token: 'test-token',
      userAgent: 'RecordCollection/test',
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => 1_000_000,
      sleep: async (ms) => {
        slept += ms;
      },
    });

    for (let i = 0; i < 60; i += 1) await client.get('/releases/1');
    expect(slept, 'the first sixty fit inside the window').toBe(0);

    await client.fetchImage(IMAGE_URL);

    expect(slept, 'the image fetch waited on the shared bucket').toBeGreaterThan(0);
  });

  it('refuses to reach a real host in a test context', async () => {
    // CLAUDE.md §2's guard, on this path too — the image host is a second way
    // out of the process and the guard is keyed on the URL.
    await expect(clientWith(globalThis.fetch).fetchImage(IMAGE_URL)).rejects.toThrow(
      /tried to reach/i,
    );
  });
});
