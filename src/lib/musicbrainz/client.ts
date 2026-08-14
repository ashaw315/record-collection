import { getEnv } from '@/env';
import { TokenBucket } from '@/lib/discogs/limiter';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';

/**
 * The MusicBrainz transport (SPEC.md §12 step 11). Every MusicBrainz call in
 * the app routes through this module — User-Agent, rate limiting and 503
 * handling live here and nowhere else.
 *
 * **Deliberately its own module rather than a parameterised Discogs client.**
 * The two APIs differ in the details that matter: the rate limit is 60× tighter
 * and enforced all-or-nothing, the breach code is 503 rather than 429, and
 * MusicBrainz requires contact information in the User-Agent as a term of use.
 * Merging them would mean a client whose every behaviour is a conditional.
 *
 * The token bucket IS shared — that is generic infrastructure, and it has held
 * since step 1.
 *
 * `fetch`, the clock and `sleep` are injected. Two reasons, and the second is
 * the important one: it makes the module testable without timers, and a test
 * that forgets to supply a fake `fetch` fails loudly instead of quietly
 * reaching the live API, which CLAUDE.md §2 forbids outright.
 *
 * Nothing here parses a MusicBrainz payload beyond `JSON.parse`. Relation
 * normalization is a separate concern with separate tests; this layer knows
 * about HTTP.
 */

const API_BASE = 'https://musicbrainz.org/ws/2';

/**
 * **One request per second, per source IP** — verified against their current
 * rate-limiting documentation, not recalled.
 *
 * Enforced all-or-nothing on their side: exceeding the rate means requests are
 * "declined entirely" rather than throttled proportionally. So there is no
 * benefit to running close to the line and a real cost to crossing it, which is
 * why the bucket holds exactly one token.
 */
const RATE_LIMIT = 1;
const RATE_WINDOW_MS = 1_000;

/** Bounded: a limiter that keeps refusing must not become a hung page. */
const MAX_RETRIES = 3;

/** Used when a 503 arrives with no usable `Retry-After`. */
const DEFAULT_RETRY_MS = 1_000;

/**
 * The app's identity, sent on every request.
 *
 * MusicBrainz requires "enough information in the User-Agent for us
 * (MusicBrainz) to contact the application maintainers", in the form
 * `Application/version ( contact )`. Without it we are classified as an
 * anonymous agent and throttled far harder — a failure that presents as a rate
 * limit problem rather than as a missing header, which is why the contact is
 * required at construction rather than defaulted.
 */
const APP_NAME = 'RecordCollection';
const APP_VERSION = '0.1';

export class MusicBrainzError extends Error {
  readonly status: number | undefined;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = 'MusicBrainzError';
    this.status = options?.status;
  }
}

export type MusicBrainzClient = {
  get<T>(path: string): Promise<T>;
};

export type MusicBrainzClientOptions = {
  contactEmail: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * A status that will not improve by asking again.
 *
 * 404 is the one worth naming: an artist that does not exist is an ANSWER, and
 * retrying it three times spends three seconds of a one-per-second budget to
 * learn the same thing.
 */
function isPermanent(status: number): boolean {
  return status >= 400 && status < 500;
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get('Retry-After');
  if (header === null) return DEFAULT_RETRY_MS;

  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : DEFAULT_RETRY_MS;
}

export function createMusicBrainzClient(
  options: MusicBrainzClientOptions,
): MusicBrainzClient {
  const contact = options.contactEmail.trim();
  if (contact === '') {
    throw new MusicBrainzError(
      'MusicBrainz requires contact information in the User-Agent. ' +
        'Set MUSICBRAINZ_CONTACT_EMAIL — without it every request is treated as ' +
        'anonymous and throttled far harder, which presents as a rate-limit ' +
        'failure rather than a missing header.',
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const bucket = new TokenBucket({ capacity: RATE_LIMIT, refillMs: RATE_WINDOW_MS, now });

  const userAgent = `${APP_NAME}/${APP_VERSION} ( ${contact} )`;

  async function request<T>(path: string): Promise<T> {
    const url = new URL(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`);

    // Their default is XML; without this the body is unparseable JSON.
    url.searchParams.set('fmt', 'json');

    const target = url.toString();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      // Before the guard AND before the call: the wait is the whole point of a
      // one-per-second limit, and a test that never sleeps still proves the
      // spacing because the clock is injected.
      const waitMs = bucket.reserve();
      if (waitMs > 0) await sleep(waitMs);

      /**
       * CLAUDE.md §2, made structural. The guard is shared with Discogs
       * deliberately — a new external host must not be reachable from a test
       * merely because someone wrote a new client.
       *
       * Gated on `usesRealNetwork` for the same reason Discogs is: an injected
       * fake never touches a socket, and refusing it would make this module's
       * own retry and rate-limit tests impossible to write.
       */
      if (usesRealNetwork(fetchImpl)) assertNoLiveCall(target);

      let response: Response;
      try {
        response = await fetchImpl(target, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        });
      } catch (cause) {
        // A raw TypeError from fetch would surface as an internal error; this
        // is a transport failure and says so.
        throw new MusicBrainzError(
          `Could not reach MusicBrainz: ${cause instanceof Error ? cause.message : 'unknown error'}`,
          { status: 502 },
        );
      }

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          /**
           * A 200 carrying HTML is what an outage page or captive portal looks
           * like. Returning `undefined` would read downstream as "this artist
           * has no relations" — absence reported as fact, which §10a's own
           * rule forbids and which this project has shipped before.
           */
          throw new MusicBrainzError(
            'MusicBrainz returned a response that was not JSON. Treated as a ' +
              'failure rather than as an artist with no relationships.',
            { status: 502 },
          );
        }
      }

      if (isPermanent(response.status)) {
        throw new MusicBrainzError(
          response.status === 404
            ? 'MusicBrainz has no record of that artist.'
            : `MusicBrainz refused the request (${response.status}).`,
          { status: response.status },
        );
      }

      /**
       * **503 is their rate-limit signal**, where Discogs uses 429. Treating it
       * as a permanent failure would abandon a request that only needed to
       * wait — and at one request per second, waiting is the normal case.
       */
      if (attempt < MAX_RETRIES) {
        await sleep(retryAfterMs(response));
        continue;
      }

      throw new MusicBrainzError(
        `MusicBrainz is rate limiting us (${response.status}). Tried ${MAX_RETRIES + 1} times.`,
        { status: 503 },
      );
    }

    // Unreachable: the loop either returns or throws.
    throw new MusicBrainzError('MusicBrainz request failed.', { status: 502 });
  }

  return { get: request };
}

let shared: MusicBrainzClient | undefined;

/**
 * The application's MusicBrainz client.
 *
 * Mirrors `getDiscogsClient`: the REAL fetch, so CLAUDE.md §2 is enforced at the
 * request site via `usesRealNetwork` rather than here — `createMusicBrainzClient`
 * cannot be used to route around the guard.
 */
export function getMusicBrainzClient(): MusicBrainzClient {
  shared ??= createMusicBrainzClient({
    contactEmail: getEnv().MUSICBRAINZ_CONTACT_EMAIL ?? '',
    fetchImpl: globalThis.fetch,
  });

  return shared;
}
