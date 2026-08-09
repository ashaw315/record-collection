import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTestContext } from '@/lib/discogs/no-live-calls';

/**
 * The guard against live external calls is only worth having if it is PRESENT
 * in every context a test can run in. A guard absent from one path is worse
 * than none, because it certifies a safety it is not providing — which is the
 * driver-selection lesson: that bug came from assuming `NODE_ENV` was set
 * everywhere it mattered, and Playwright does not set it by default.
 *
 * So this file asserts the property in each context rather than trusting a
 * comment that says it holds.
 */

describe('the guard is active where tests run', () => {
  it('is active in vitest, right now, in this process', () => {
    // The strongest available form: not a claim about vitest, a measurement of
    // the process actually running this assertion.
    expect(isTestContext()).toBe(true);
  });

  it('does not rely on NODE_ENV reaching the E2E dev server, because it does not', () => {
    /**
     * An earlier version of this test asserted that `playwright.config.ts`
     * runs the dev server with `NODE_ENV=test`. It does — and Next FORCES
     * NODE_ENV to "development" for `next dev`, so the variable never arrives.
     * Measured from inside the running server:
     * `{"NODE_ENV":"development","VITEST":null}`.
     *
     * That test passed while the guard was inert in E2E. It asserted the
     * config's TEXT, not the server's BEHAVIOUR — the same shape as asserting
     * a status without a message, and it certified a safety that did not
     * exist.
     *
     * So the guard's primary signal is the DATABASE TARGET, which no runner
     * can override, and the behavioural assertion lives in
     * `e2e/no-live-discogs.spec.ts` where it can observe the real server.
     */
    const guard = readFileSync('src/lib/discogs/no-live-calls.ts', 'utf8');

    expect(guard, 'the database target is the primary signal').toMatch(
      /pointsAtLocalDatabase|TEST_DATABASE_URL/,
    );
  });

  it('is wired into the shared client, not merely available', () => {
    /**
     * The module could exist, be tested, and be imported by nothing — the
     * uncalled-module trap from NOTES, which this project has already hit.
     * `getDiscogsClient` is the one place the REAL fetch is supplied, so the
     * guard has to be on it.
     */
    const client = readFileSync('src/lib/discogs/client.ts', 'utf8');

    expect(client).toMatch(/assertNoLiveCall/);
    expect(client, 'the guard wraps the real fetch, not a caller-supplied one').toMatch(
      /guardedFetch/,
    );
  });
});

describe('the credential is NOT the protection', () => {
  it('uses a placeholder DISCOGS_TOKEN, while not relying on it', () => {
    /**
     * `.env.test` already held a placeholder (`e2e-discogs-token`) when a live
     * call reached Discogs during an E2E run — and the call SUCCEEDED, with
     * fresh marketplace data proving it was real.
     *
     * Measured rather than assumed: `GET /releases/381756` with a bogus token
     * returns **200**. Discogs authenticates for RATE LIMITS, not for access;
     * release detail is public. So a bad credential does not fail a leaked
     * call, it just makes it slower to be throttled.
     *
     * I had reported the opposite — that .env.test carried a real token and
     * removing it would prevent this. Both halves were wrong. The placeholder
     * is kept because a credential that cannot authenticate is still the right
     * thing to put in a test environment, but it is NOT the guard, and this
     * test exists to stop anyone believing it is.
     */
    const envTest = readFileSync('.env.test', 'utf8');
    const line = envTest.split('\n').find((entry) => entry.startsWith('DISCOGS_TOKEN='));

    expect(line, 'DISCOGS_TOKEN must be set, so the app can boot').toBeDefined();

    const value = (line ?? '').slice('DISCOGS_TOKEN='.length).trim();

    expect(value, 'set to something').not.toBe('');
    expect(value, 'never the developer real token').not.toMatch(/^[A-Za-z]{40}$/);
  });
});
