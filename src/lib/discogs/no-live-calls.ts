import { resolveConnectionHost } from '@/lib/db/connection-string';
import { DiscogsError } from './client';

/**
 * Makes CLAUDE.md §2's rule structural: **no test may make a live external
 * call.**
 *
 * It was a rule and not a mechanism until step 7 broke it. `/records/new`'s
 * Discogs prefill runs in a SERVER COMPONENT, so Playwright's `page.route` —
 * which intercepts browser traffic only — was never in the request path. The
 * E2E dev server called api.discogs.com for real, cached the response, and
 * three specs passed against live data. They proved nothing about the code path
 * they claimed to test, which is the hollow-Neon shape exactly.
 *
 * The check lives on the CLIENT rather than in each test, because the tests
 * that need it are the ones nobody remembered to mock.
 */

/** localhost, 127.0.0.1 and ::1 — the only hosts the test database ever uses. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * **The database target is the primary signal**, and the reason is a correction.
 *
 * The first version of this guard keyed off `NODE_ENV === 'test'`, which
 * `playwright.config.ts` sets on its dev-server command — and Next FORCES
 * `NODE_ENV` to "development" for `next dev`, discarding it. Measured from
 * inside the running server: `{"NODE_ENV":"development","VITEST":null}`. The
 * guard was therefore inert in E2E, the one context where the leak actually
 * happened, while a repo test asserting the config file's text passed and
 * proved nothing.
 *
 * A flag is an ASSERTION someone can forget on a new runner. The database
 * target is an OBSERVATION that is true in every test context without anyone
 * remembering — the same reasoning that made `TEST_DATABASE_URL` beat
 * `NODE_ENV` for driver selection, and that one has held since step 1.
 *
 * `NODE_ENV` and `VITEST` remain as belt to that braces: a UNIT test may open
 * no database at all, so neither database signal is present and they are the
 * only ones left.
 *
 * **Broad refusal is the safe direction.** A false positive is a loud error in
 * development; a false negative is a live call that succeeds silently, which is
 * what happened twice.
 */
export function isTestContext(): boolean {
  if (process.env.VITEST === 'true') return true;
  if (process.env.NODE_ENV === 'test') return true;

  // Set at all means the local Docker database is in play — nothing else ever
  // sets it, and `resolveDriver` refuses a non-local value.
  if ((process.env.TEST_DATABASE_URL ?? '') !== '') return true;

  return pointsAtLocalDatabase(process.env.DATABASE_URL);
}

/**
 * Parsed with the library `pg` connects with, via `resolveConnectionHost` —
 * NOT with `new URL()`.
 *
 * That distinction closed a real hole in `assertLocalHost`: a `?host=`
 * parameter overrides the authority in the URL, so a string that LOOKS remote
 * can connect locally and vice versa. Reusing the same resolution means the two
 * guards cannot disagree about what "local" means.
 */
function pointsAtLocalDatabase(connectionString: string | undefined): boolean {
  if (connectionString === undefined || connectionString === '') return false;

  try {
    const host = resolveConnectionHost(connectionString).replace(/^\[|\]$/g, '');
    return LOCAL_HOSTS.has(host);
  } catch {
    // Unparseable: err toward "this is a test". A false positive is a loud
    // error someone fixes in a minute.
    return true;
  }
}

/**
 * Whether this client would actually reach the network.
 *
 * **The guard fires at the request site, not at construction**, so an injected
 * fake `fetch` is exempt while the real one is not. That distinction is what
 * lets a client's own unit tests exercise its retry and rate-limit paths — they
 * never touch a socket — while a code path that forgot to inject one is
 * refused.
 *
 * Lives beside the guard rather than inside a client because every transport
 * needs it, and a second copy is how two clients come to disagree about what
 * counts as a live call.
 */
export function usesRealNetwork(candidate: typeof fetch): boolean {
  return candidate === globalThis.fetch;
}

/**
 * Throws if a test is about to reach the network.
 *
 * Loudly, and naming the URL. Every §2-adjacent failure in this project has
 * been an absence reported as success — a guard that returned an empty result
 * would leave the next person debugging a "Discogs has nothing" response, when
 * the truth is that the call should never have been attempted.
 *
 * Not host-specific: the rule covers external calls generally, and §12 adds the
 * Anthropic API at step 12. An allow-list would need revisiting then, and the
 * revisit is the part that gets forgotten.
 */
export function assertNoLiveCall(url: string): void {
  if (!isTestContext()) return;

  /**
   * A `DiscogsError`, not a plain one, so the transport layer treats this as a
   * defined transport failure and the MESSAGE survives.
   *
   * A plain Error was wrapped as "Could not reach Discogs" — which sends the
   * next person debugging their network instead of reading the sentence that
   * names the fix. 502 rather than 500 for the same reason: a refused call is
   * not our internal fault.
   */
  throw new DiscogsError(
    `A test tried to reach ${safeHost(url)} (${url}). ` +
      'CLAUDE.md §2 forbids live external calls from tests — not even once. ' +
      `${mockAdvice(url)} ` +
      'A browser-level stub (page.route) does NOT cover server components, ' +
      'which is how this rule was broken in step 7.',
    { status: 502 },
  );
}

/**
 * Which client to mock, by host.
 *
 * **The coverage was never host-specific and still is not** — this guard
 * blocked musicbrainz.org before step 11 existed, which is the point of the
 * comment above. What IS host-specific is the advice, and getting that wrong is
 * its own failure: a message reading "Mock getDiscogsClient" on a MusicBrainz
 * test names a module unrelated to the failure and sends the reader to the
 * wrong file. A guard that fires correctly and then misdirects is worse than
 * silence, because the reader trusts it.
 *
 * An unknown host falls back to generic advice rather than guessing. §12 adds
 * the Anthropic API at step 14, and naming it after whichever client was
 * written most recently is exactly the drift this avoids.
 */
const CLIENTS_BY_HOST: ReadonlyArray<{ match: string; advice: string }> = [
  {
    match: 'discogs.com',
    advice: 'Mock getDiscogsClient for this test, as the other Discogs suites do.',
  },
  {
    match: 'musicbrainz.org',
    advice: 'Mock getMusicBrainzClient for this test, as the other MusicBrainz suites do.',
  },
];

function mockAdvice(url: string): string {
  const host = safeHost(url);
  const known = CLIENTS_BY_HOST.find((client) => host.endsWith(client.match));

  return known?.advice ?? 'Mock the client this code path uses rather than letting it reach the network.';
}

/** A malformed URL must not turn the guard's own error into a different one. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'an external host';
  }
}
