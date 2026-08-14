import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNoLiveCall, isTestContext } from './no-live-calls';

/**
 * CLAUDE.md §2: "Always mock Discogs and the Anthropic API. Never allow a test
 * to make a live external call — not even 'just once to check.'"
 *
 * That was a rule and not a mechanism, and in step 7 I broke it: the
 * `/records/new` prefill runs in a SERVER COMPONENT, so a Playwright
 * `page.route` stub — which only intercepts browser traffic — was never in the
 * path. The E2E dev server called api.discogs.com for real and cached the
 * response. Three specs then passed against live data, proving nothing about
 * the mocked path. Same class as the hollow Neon test.
 *
 * This module makes the rule structural. The check is on the CLIENT rather than
 * on each test, because the tests that need it most are the ones nobody
 * remembered to mock.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const NEON = 'postgresql://user:pass@ep-royal-rain-123.us-east-1.aws.neon.tech/db';
const LOCAL_TEST = 'postgresql://postgres:postgres@localhost:5433/record_collection_test';

/** No signal at all — the baseline the stubs below depart from. */
function clearSignals() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('TEST_DATABASE_URL', '');
  vi.stubEnv('DATABASE_URL', NEON);
}

describe('recognising a test context', () => {
  /**
   * THE DATABASE TARGET IS THE PRIMARY SIGNAL, and that is the correction this
   * module exists to record.
   *
   * The first version keyed off `NODE_ENV === 'test'`, which is set by the
   * Playwright config's dev-server command — and Next FORCES NODE_ENV to
   * "development" for `next dev`, discarding it. Measured from inside the
   * running server: `{"NODE_ENV":"development","VITEST":null}`. So the guard
   * was inert in E2E, the one context where the leak actually happened, while a
   * repo test asserting the config file's text passed and proved nothing.
   *
   * A flag is an assertion someone can forget on a new runner. The database
   * target is an OBSERVATION that is true in every test context without anyone
   * remembering — the same reasoning that made TEST_DATABASE_URL beat NODE_ENV
   * for driver selection, which has held since step 1.
   */
  it('recognises a local test database as a test context', () => {
    clearSignals();
    vi.stubEnv('DATABASE_URL', LOCAL_TEST);

    expect(isTestContext()).toBe(true);
  });

  it('recognises TEST_DATABASE_URL being set at all', () => {
    // Vitest resolves its connection from here, and integration tests only ever
    // point at the local Docker database.
    clearSignals();
    vi.stubEnv('TEST_DATABASE_URL', LOCAL_TEST);

    expect(isTestContext()).toBe(true);
  });

  it('recognises 127.0.0.1 as well as localhost', () => {
    clearSignals();
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5433/x');

    expect(isTestContext()).toBe(true);
  });

  it('still recognises vitest by NODE_ENV', () => {
    // Belt and braces: a UNIT test may open no database at all, so neither
    // database signal is present and this is the only one left.
    clearSignals();
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NODE_ENV', 'test');

    expect(isTestContext()).toBe(true);
  });

  it('still recognises vitest by its own marker', () => {
    clearSignals();
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('VITEST', 'true');

    expect(isTestContext()).toBe(true);
  });

  it('does NOT treat production against Neon as a test context', () => {
    // The guard must never fire in production: it would take Discogs offline
    // for the user rather than for a test.
    clearSignals();
    vi.stubEnv('NODE_ENV', 'production');

    expect(isTestContext()).toBe(false);
  });

  it('does not treat ordinary development against Neon as a test context', () => {
    // `npm run dev` reaches the real database (step 6's dev-targets-neon rule),
    // so a developer clicking through the app still gets live Discogs data.
    clearSignals();

    expect(isTestContext()).toBe(false);
  });

  it('is not fooled by a host query parameter pointing elsewhere', () => {
    /**
     * `?host=` overrides the authority in the URL, so a string that LOOKS
     * local can connect to a remote database. `assertLocalHost` closed that
     * hole for the test helpers; this guard reuses the same parsing rather
     * than reimplementing it, so the two cannot disagree.
     *
     * Erring toward "this is a test" is the safe direction: a false positive
     * is a loud error in development, a false negative is a live call.
     */
    clearSignals();
    vi.stubEnv('DATABASE_URL', `${NEON}?host=localhost`);

    expect(isTestContext()).toBe(true);
  });
});

describe('the guard itself', () => {
  it('throws when a test tries to reach Discogs', () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(() => assertNoLiveCall('https://api.discogs.com/releases/381756')).toThrow();
  });

  it('names what was attempted, rather than failing vaguely', () => {
    /**
     * §2's failures in this project are almost always ABSENCE reported as
     * success. A guard that returned an empty result, or threw something
     * generic, would leave the next person debugging a "Discogs has nothing"
     * response. The message has to say what happened and which URL.
     */
    vi.stubEnv('NODE_ENV', 'test');

    expect(() => assertNoLiveCall('https://api.discogs.com/releases/381756')).toThrow(
      /test tried to reach api\.discogs\.com/i,
    );
    expect(() => assertNoLiveCall('https://api.discogs.com/releases/381756')).toThrow(
      /releases\/381756/,
    );
  });

  it('says how to fix it, since the fix is always the same', () => {
    // The remedy is mocking `getDiscogsClient`, every time. Naming it turns a
    // confusing failure into a one-line fix.
    vi.stubEnv('NODE_ENV', 'test');

    expect(() => assertNoLiveCall('https://api.discogs.com/x')).toThrow(/getDiscogsClient/);
  });

  it('does not throw outside a test context', () => {
    // Every signal cleared, including the database one — production points at
    // Neon, which is what makes this the not-a-test case.
    clearSignals();
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => assertNoLiveCall('https://api.discogs.com/releases/1')).not.toThrow();
  });

  it('throws for ANY host, not just Discogs', () => {
    /**
     * The rule is about live external calls, and §12 adds the Anthropic API at
     * step 12. A guard that allow-listed one host would have to be revisited
     * then — and the revisit is what gets forgotten.
     */
    vi.stubEnv('NODE_ENV', 'test');

    expect(() => assertNoLiveCall('https://api.anthropic.com/v1/messages')).toThrow(
      /api\.anthropic\.com/,
    );
  });

  it('tells a MusicBrainz caller to mock the MUSICBRAINZ client', () => {
    /**
     * The guard was already host-agnostic — it blocked musicbrainz.org before
     * step 11 existed, which is what its "not host-specific" comment promised.
     * What was wrong was the ADVICE: every message said "Mock
     * getDiscogsClient", which for a MusicBrainz test names the wrong module
     * and sends the reader to a file that has nothing to do with their failure.
     *
     * A guard that fires correctly and then misdirects is worse than one that
     * says nothing, because the reader trusts it.
     */
    let message = 'NO THROW';
    try {
      assertNoLiveCall('https://musicbrainz.org/ws/2/artist/0c9bfbdc?inc=artist-rels');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message, 'the rule still fires').toMatch(/forbids live external calls/i);
    expect(message, 'and names the right client').toMatch(/getMusicBrainzClient/);
    expect(message, 'not the Discogs one').not.toMatch(/getDiscogsClient/);
  });

  it('still names the Discogs client for a Discogs URL', () => {
    // The existing advice must survive being made host-aware.
    let message = 'NO THROW';
    try {
      assertNoLiveCall('https://api.discogs.com/database/search?q=x');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/getDiscogsClient/);
    expect(message).not.toMatch(/getMusicBrainzClient/);
  });

  it('falls back to generic advice for a host it does not know', () => {
    /**
     * §12 adds the Anthropic API at step 14. An unknown host must still be
     * refused with a usable message rather than being named after whichever
     * client was written most recently.
     */
    let message = 'NO THROW';
    try {
      assertNoLiveCall('https://api.anthropic.com/v1/messages');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/forbids live external calls/i);
    expect(message).toMatch(/api\.anthropic\.com/);
    expect(message, 'no misleading client name').not.toMatch(/getDiscogsClient|getMusicBrainzClient/);
  });
});