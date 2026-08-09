import { getEnv } from '@/env';
import { TokenBucket } from './limiter';
import { assertNoLiveCall } from './no-live-calls';

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
};

export type QueryParams = Record<string, string | number | boolean | undefined>;

export type DiscogsClientOptions = {
  token: string;
  userAgent: string;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
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

/** The real `fetch`, refused in a test context. */
const guardedFetch: typeof fetch = (input, init) => {
  assertNoLiveCall(typeof input === 'string' ? input : String(input));
  return globalThis.fetch(input, init);
};

export function getDiscogsClient(): DiscogsClient {
  if (shared === undefined) {
    shared = createDiscogsClient({
      /**
       * CLAUDE.md §2, enforced rather than trusted.
       *
       * The guard wraps the REAL `fetch`, at the one place it is supplied. A
       * test that mocks this module never reaches here; a test that injects
       * its own `fetch` into `createDiscogsClient` is exercising the transport
       * deliberately and is equally unaffected. What it stops is the case that
       * actually happened: a server component calling Discogs for real during
       * an E2E run, where a browser-level stub was never in the path.
       */
      fetch: guardedFetch,
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
    const deadline = now() + MAX_ELAPSED_MS;

    for (let attempt = 0; ; attempt += 1) {
      const wait = bucket.waitMs();
      // Checked BEFORE sleeping, not after: waiting out a delay and then
      // reporting that we ran out of time spends the very budget the deadline
      // exists to protect.
      if (now() + wait > deadline) {
        throw new DiscogsError('Discogs is rate limiting us. Try again in a moment.', {
          status: 429,
        });
      }
      if (wait > 0) await sleep(wait);
      bucket.take();

      let response: Response;
      try {
        response = await options.fetch(url, { headers });
      } catch (cause) {
        // The cause is kept for the log; callers get a typed error and the
        // route layer decides what reaches the client.
        throw new DiscogsError('Could not reach Discogs', { cause });
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

  return { get: request };
}
