import { getEnv } from '@/env';
import { TokenBucket } from './limiter';
import { assertNoLiveCall } from './no-live-calls';
import { safeImageUrl } from './fields';
import {
  MAX_IMAGE_BYTES,
  sniffImageType,
  type AcceptedImageType,
} from '@/lib/storage/image-type';

/**
 * The Discogs transport (SPEC.md §6). Every Discogs call in the app routes
 * through this module — auth, User-Agent, rate limiting and 429 handling live
 * here and nowhere else.
 *
 * `fetch`, the clock and `sleep` are all injected. Two reasons, and the second
 * is the important one: it makes the module testable without timers, and it
 * means a test that forgets to supply a fake `fetch` fails loudly instead of
 * quietly reaching the live API — which CLAUDE.md §2 forbids outright.
 *
 * Nothing here parses a Discogs payload beyond `JSON.parse`. Normalization is a
 * separate concern with separate tests; this layer knows about HTTP.
 */

const API_BASE = 'https://api.discogs.com';

/** §6: 60 requests/minute authenticated. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/**
 * Bounded, because retrying forever against a limiter that keeps refusing is a
 * hang — and a hung request inside a route handler is a hung page. Three
 * attempts after the first is enough to ride out a short window without
 * turning a bad minute into a bad five minutes.
 */
const MAX_RETRIES = 3;

/** Used when a 429 arrives with no usable `Retry-After`. */
const DEFAULT_RETRY_MS = 1_000;

/**
 * Total wall-clock ceiling on one logical request, retries and waiting
 * included.
 *
 * A SECOND bound alongside `MAX_RETRIES`, because the two fail differently and
 * the attempt count is not the thing that hurts in production. A wedged request
 * in a serverless function holds execution time until the platform kills it,
 * with the user watching a spinner — so the useful guarantee is "this returns
 * within ten seconds, one way or another", not "this makes at most four
 * attempts".
 *
 * It also bounds a hostile or mistaken `Retry-After: 3600`, which a
 * count-based limit alone would obey to the letter.
 */
const MAX_ELAPSED_MS = 10_000;

export class DiscogsError extends Error {
  readonly status: number | undefined;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'DiscogsError';
    this.status = options.status;
  }
}

export type DiscogsClient = {
  get<T = unknown>(path: string, params?: QueryParams): Promise<T>;
  /**
   * An image from Discogs, fetched so it can be STORED rather than hot-linked
   * (§5.7, §5.9).
   *
   * On this client, and not a standalone function, because it must spend from
   * the SAME token bucket. Images live on `i.discogs.com` while the API is
   * `api.discogs.com`, and the bucket only ever covered the API host — every
   * `get` goes through `request()`, which builds URLs against `API_BASE`. A
   * separate image path would let a bulk import fan out unbounded against
   * Discogs, which is the concurrent-bypass shape on a different axis.
   */
  fetchImage(url: string): Promise<{ bytes: ArrayBuffer; contentType: AcceptedImageType }>;
};

export type QueryParams = Record<string, string | number | boolean | undefined>;

export type DiscogsClientOptions = {
  token: string;
  userAgent: string;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * The wall-clock ceiling on one logical request. Injected so a test can
   * assert the timeout without waiting ten seconds for it — the abort fires
   * from the real timer system, which is the one thing a fake clock cannot
   * model.
   */
  maxElapsedMs?: number;
};

function buildUrl(path: string, params: QueryParams | undefined): string {
  const url = new URL(path, API_BASE);

  for (const [key, value] of Object.entries(params ?? {})) {
    // Absent and empty are both "no filter". Sending `q=` would ask Discogs to
    // match the empty string, and `undefined` would arrive as the literal text
    // "undefined" — the coercion class from NOTES, in query-string form.
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * `Retry-After` in seconds, per RFC 9110. Junk values fall back rather than
 * becoming NaN — `Number('soon')` is NaN, and a NaN wait is an instant retry
 * loop that looks like a hang while hammering a limiter that already said no.
 */
function retryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header === null) return DEFAULT_RETRY_MS;

  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_MS;

  return Math.ceil(seconds * 1_000);
}

/**
 * The process-wide client (SPEC.md §6: "a shared module that all Discogs calls
 * route through").
 *
 * Shared because the rate limiter's accounting only means anything if every
 * call spends from the same bucket — a client per request would let sixty
 * concurrent handlers each believe they had sixty tokens.
 *
 * Route handlers call this rather than constructing their own, and tests
 * replace it wholesale, which is what keeps a live call impossible by
 * construction rather than by discipline.
 */
let shared: DiscogsClient | undefined;

/**
 * Whether this client is about to use the REAL network.
 *
 * Compared by identity: an injected `fetch` is a test's own function and does
 * not reach Discogs, so the guard must not fire on it — that would break every
 * transport test in this suite. `globalThis.fetch` is the one that does.
 */
function usesRealNetwork(candidate: typeof fetch): boolean {
  return candidate === globalThis.fetch;
}

export function getDiscogsClient(): DiscogsClient {
  if (shared === undefined) {
    shared = createDiscogsClient({
      /**
       * The REAL fetch. CLAUDE.md §2 is enforced at the request site rather
       * than here — see `usesRealNetwork` — so `createDiscogsClient` cannot be
       * used to route around it, which an earlier version allowed.
       */
      fetch: globalThis.fetch,
      token: getEnv().DISCOGS_TOKEN,
      // §6: "set a descriptive User-Agent header. Discogs rejects requests
      // without one." Names the app and gives them somewhere to look.
      userAgent: 'RecordCollection/0.1 +https://github.com/adamshaw/record-collection',
    });
  }

  return shared;
}

export function createDiscogsClient(options: DiscogsClientOptions): DiscogsClient {
  // §6 calls this required, and it is: Discogs rejects requests without one.
  // Checked at construction so the failure names the real cause rather than
  // surfacing later as an opaque 403 on an unrelated request.
  if (options.userAgent.trim() === '') {
    throw new DiscogsError('A descriptive User-Agent is required for Discogs requests');
  }

  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const maxElapsedMs = options.maxElapsedMs ?? MAX_ELAPSED_MS;
  const bucket = new TokenBucket({ capacity: RATE_LIMIT, refillMs: RATE_WINDOW_MS, now });

  const headers = {
    // The token goes in a header and only there — a credential in a query
    // string ends up in logs and proxy caches.
    authorization: `Discogs token=${options.token}`,
    'user-agent': options.userAgent,
    accept: 'application/json',
  };

  async function request<T>(path: string, params?: QueryParams): Promise<T> {
    const url = buildUrl(path, params);
    const deadline = now() + maxElapsedMs;

    for (let attempt = 0; ; attempt += 1) {
      /**
       * RESERVED, not checked-then-taken. `waitMs()` followed by `take()` with
       * an await between is check-then-act: every concurrent caller saw a full
       * bucket, and 200 simultaneous requests ran 200 in flight against a
       * 60/minute limit. `reserve()` claims the token synchronously, so this
       * caller holds it before yielding.
       */
      const wait = bucket.reserve();

      /**
       * CLAUDE.md §2, checked at the CALL SITE rather than at construction.
       *
       * An earlier version wrapped the fetch that `getDiscogsClient` supplies,
       * which left `createDiscogsClient` a bypass: a caller passing
       * `globalThis.fetch` directly reached Discogs for real. Found when a test
       * written to assert the guard resolved with a genuine 36-field payload —
       * the guard, tested, and bypassed by the very thing testing it.
       *
       * Here it covers every construction path, and only when the real network
       * is in use: an injected `fetch` belongs to a test and reaches nothing.
       */
      // Checked BEFORE sleeping, not after: waiting out a delay and then
      // reporting that we ran out of time spends the very budget the deadline
      // exists to protect.
      if (now() + wait > deadline) {
        throw new DiscogsError('Discogs is rate limiting us. Try again in a moment.', {
          status: 429,
        });
      }
      if (wait > 0) await sleep(wait);

      /**
       * The individual request is bounded too, and the two bounds cover
       * different failures.
       *
       * `MAX_ELAPSED_MS` caps the whole logical request — retries and waiting
       * — which stops a hostile `Retry-After: 3600` parking us for an hour.
       * It does NOT stop a single response that never arrives: without a
       * signal, `await fetch(...)` waits forever and the deadline is only
       * consulted between attempts. The module header claimed a wall-clock
       * guarantee that neither bound provided alone.
       *
       * Timed against the deadline rather than a fixed value, so one slow
       * response cannot outlive the budget the caller was promised.
       */
      const remaining = Math.max(0, deadline - now());
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), remaining);

      let response: Response;
      try {
        /**
         * Checked INSIDE the try, so the refusal is handled like any other
         * transport failure and reaches the client as a 502 rather than a 500.
         *
         * An earlier version checked before the try: `assertNoLiveCall` throws
         * a plain Error, which escaped to `withErrorHandling` and became "our
         * bug" for a rule working exactly as designed. Caught by the guard's
         * own E2E specs asserting 502 — deterministically, on both projects.
         */
        if (usesRealNetwork(options.fetch)) {
          assertNoLiveCall(url);
        }

        response = await options.fetch(url, { headers, signal: abort.signal });
      } catch (cause) {
        // Already typed — the no-live-calls guard, or anything else that has
        // already said precisely what went wrong. Re-wrapping would replace a
        // sentence naming the fix with a generic one.
        if (cause instanceof DiscogsError) throw cause;

        // An abort is OUR deadline firing, not Discogs being unreachable, and
        // saying so is the difference between "try again" and "something is
        // wrong with the network".
        if (cause instanceof Error && cause.name === 'AbortError') {
          throw new DiscogsError('Discogs took too long to respond.', { status: 504, cause });
        }

        // The cause is kept for the log; callers get a typed error and the
        // route layer decides what reaches the client.
        throw new DiscogsError('Could not reach Discogs', { cause });
      } finally {
        // Always cleared: a pending timer keeps the process alive and would
        // abort a controller nothing is listening to.
        clearTimeout(timer);
      }

      if (response.status === 429) {
        const retryMs = retryAfterMs(response);
        // Their limiter outranks ours whenever the two disagree, and theirs is
        // the one that returns errors.
        bucket.blockUntil(now() + retryMs);

        // Either bound ends it. The attempt count catches a fast retry storm;
        // the deadline catches a slow one, including a `Retry-After` long
        // enough to park the request past any useful lifetime.
        if (attempt >= MAX_RETRIES || now() + retryMs > deadline) {
          throw new DiscogsError(
            'Discogs rate limit reached. Try again in a moment.',
            { status: 429 },
          );
        }

        await sleep(retryMs);
        continue;
      }

      if (!response.ok) {
        // Deterministic failures are not retried: a 404 stays a 404, and
        // retrying only multiplies the latency. The body is deliberately not
        // included — it is Discogs' prose, not ours, and may echo the request.
        throw new DiscogsError(`Discogs request failed with status ${response.status}`, {
          status: response.status,
        });
      }

      const body = await response.text();
      try {
        return JSON.parse(body) as T;
      } catch (cause) {
        // A gateway error page served as 200 with an HTML body. Returning
        // undefined here would read to the caller as "Discogs has nothing".
        throw new DiscogsError('Discogs returned a malformed response', {
          status: response.status,
          cause,
        });
      }
    }
  }

  /**
   * Reads a response body with a HARD ceiling, stopping mid-stream.
   *
   * `arrayBuffer()` would download every byte before anything could refuse an
   * oversized file — the cap enforced only after paying its full cost, which on
   * a Discogs primary image is exactly the case worth avoiding. Cancelling the
   * reader stops the transfer.
   */
  async function readCapped(response: Response, limit: number): Promise<Uint8Array> {
    const body = response.body;
    if (body === null) {
      throw new DiscogsError('Discogs returned an empty image.', { status: 502 });
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;

        total += value.byteLength;
        if (total > limit) {
          /**
           * Cancelled HERE rather than left to the `finally`.
           *
           * Measured: cancelling from the finally let the source stream's
           * `pull` deliver every remaining chunk first, so a 12MB body was
           * fully transferred despite the throw — the cap enforced after
           * paying its cost, which is the exact thing streaming avoids.
           */
          await reader.cancel();
          throw new DiscogsError(
            `That image is too large — over ${limit / (1024 * 1024)}MB.`,
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      // Releases the connection whether we finished or refused.
      await reader.cancel().catch(() => {});
    }

    const merged = new Uint8Array(new ArrayBuffer(total));
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  /** The bytes as a standalone ArrayBuffer, which is what storage accepts. */
  function merged(view: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(view.byteLength);
    new Uint8Array(copy).set(view);
    return copy;
  }

  async function fetchImage(
    imageUrl: string,
  ): Promise<{ bytes: ArrayBuffer; contentType: AcceptedImageType }> {
    /**
     * https only, checked BEFORE the request — the URL comes from whichever
     * contributor edited the release, and this fetch runs on our server, so an
     * attacker-chosen host would be contacted by us rather than by a browser.
     */
    if (safeImageUrl(imageUrl) === null) {
      throw new DiscogsError('That image URL is not one we will request.', { status: 400 });
    }

    // The shared bucket. This is the whole reason fetchImage lives here.
    const wait = bucket.reserve();
    if (wait > 0) await sleep(wait);

    let response: Response;
    try {
      if (usesRealNetwork(options.fetch)) {
        assertNoLiveCall(imageUrl);
      }

      response = await options.fetch(imageUrl, {
        headers: { 'user-agent': options.userAgent },
      });
    } catch (cause) {
      if (cause instanceof DiscogsError) throw cause;
      throw new DiscogsError('Could not reach Discogs for that image.', { cause });
    }

    if (!response.ok) {
      throw new DiscogsError(`Discogs returned ${response.status} for that image.`, {
        status: 502,
      });
    }

    const bytes = await readCapped(response, MAX_IMAGE_BYTES);

    /**
     * Sniffed, never taken from `Content-Type` — the same rule as the upload
     * endpoint. A URL ending `.jpeg` and a header saying `image/jpeg` are both
     * claims made by the host; the bytes are the fact.
     */
    const contentType = sniffImageType(bytes);
    if (contentType === null) {
      throw new DiscogsError('What Discogs returned is not an image we accept.', { status: 415 });
    }

    return {
      // `slice` on the typed array's own buffer, which `readCapped` allocates
      // as a plain ArrayBuffer — the SDK's PutBody does not accept a
      // SharedArrayBuffer-backed view.
      bytes: merged(bytes),
      contentType,
    };
  }

  return { get: request, fetchImage };
}
