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

  it('covers EVERY construction path, not just the shared client', async () => {
    /**
     * REWRITTEN twice, and the second rewrite is the interesting one.
     *
     * The first version grepped `client.ts` for `guardedFetch` — a test whose
     * subject is a file, which passes as long as a NAME exists. It did not
     * notice that the name covered only `getDiscogsClient`, leaving
     * `createDiscogsClient` a bypass: a caller passing `globalThis.fetch`
     * directly reached Discogs for real.
     *
     * That bypass was found by a DIFFERENT test resolving with a genuine
     * 36-field Discogs payload — the guard, tested, and bypassed by the very
     * test written to assert it.
     *
     * So this asserts behaviour on the path the grep missed.
     */
    const { createDiscogsClient } = await import('@/lib/discogs/client');

    const client = createDiscogsClient({
      token: 'irrelevant',
      userAgent: 'RecordCollection/0.1 +https://example.test',
      // The REAL fetch, exactly as a careless caller would supply it.
      fetch: globalThis.fetch,
    });

    await expect(client.get('/releases/381756')).rejects.toThrow(/test tried to reach/i);
  });

  it('does not fire on an injected fetch, which reaches nothing', async () => {
    /**
     * The other half: the guard must not break the transport tests. An injected
     * `fetch` is a test's own function and contacts no network, so refusing it
     * would be a false positive that made the module untestable.
     */
    const { createDiscogsClient } = await import('@/lib/discogs/client');

    const client = createDiscogsClient({
      token: 'irrelevant',
      userAgent: 'RecordCollection/0.1 +https://example.test',
      fetch: (async () =>
        new Response('{"ok":true}', {
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
    });

    await expect(client.get('/releases/1')).resolves.toEqual({ ok: true });
  });
});

describe('the credential is NOT the protection, and the guard is', () => {
  /**
   * REWRITTEN after the security review. The previous version read `.env.test`
   * and asserted the token looked like a placeholder — a test whose subject is
   * a FILE, which would pass whatever `isTestContext` does. I recorded that
   * exact shape in NOTES and then wrote it again in this file.
   *
   * The behavioural claim is the one worth making: whatever the credential is,
   * the guard refuses the call.
   */
  it('refuses a live call even with a perfectly valid credential', async () => {
    /**
     * Measured during the review: `GET /releases/381756` with a BOGUS token
     * returns 200. Discogs authenticates for rate limits, not for access, so a
     * placeholder never prevented anything — only the guard does.
     */
    const { createDiscogsClient } = await import('@/lib/discogs/client');
    const { assertNoLiveCall } = await import('@/lib/discogs/no-live-calls');

    expect(() => assertNoLiveCall('https://api.discogs.com/releases/381756')).toThrow(
      /test tried to reach/i,
    );

    // And the shared client refuses too, which is the path that matters.
    const client = createDiscogsClient({
      token: 'a-perfectly-valid-looking-token-aaaaaaaa',
      userAgent: 'RecordCollection/0.1 +https://example.test',
      fetch: globalThis.fetch,
    });

    await expect(client.get('/releases/381756')).rejects.toThrow(/test tried to reach/i);
  });

  it('keeps a placeholder in .env.test, while not relying on it', () => {
    // Still worth asserting — a real credential in a test environment is wrong
    // regardless — but the guard above is what provides the safety.
    const envTest = readFileSync('.env.test', 'utf8');
    const line = envTest.split('\n').find((entry) => entry.startsWith('DISCOGS_TOKEN='));
    const value = (line ?? '').slice('DISCOGS_TOKEN='.length).trim();

    expect(value, 'set to something, so the app boots').not.toBe('');
    expect(value, 'never the developer real token').not.toMatch(/^[A-Za-z]{40}$/);
  });
});

/**
 * **The guard must be structurally unable to fire on a deployment.**
 *
 * R6's finding, and it is the inverse of everything above: those assert the
 * guard is PRESENT everywhere a test runs, and this asserts it is ABSENT
 * everywhere a test cannot run.
 *
 * `isTestContext()` returns true when `TEST_DATABASE_URL` is set AT ALL, and
 * `.env.example` documents that variable — so one plausible paste into Vercel's
 * environment refuses every Discogs, MusicBrainz and Anthropic call in
 * production. The message it refuses with says "A test tried to reach
 * api.discogs.com… CLAUDE.md §2 forbids live external calls from tests", on a
 * deployment, with no test running, which sends whoever is on call to entirely
 * the wrong place.
 *
 * `VERCEL` is the right signal because it is set by the platform rather than by
 * a file: nothing a person pastes into an env config produces it, and no test
 * context has it. A guard keyed on an OBSERVATION beats one keyed on a flag —
 * the same reasoning that made the database target beat `NODE_ENV` — and this
 * is the observation "the platform says this is a deployment".
 */
describe('the guard cannot fire on a Vercel deployment', () => {
  const TEST_SIGNALS = ['VITEST', 'NODE_ENV', 'TEST_DATABASE_URL'] as const;

  function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
    const saved = new Map<string, string | undefined>();
    for (const key of Object.keys(overrides)) saved.set(key, process.env[key]);

    try {
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      run();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('is inert on Vercel even when TEST_DATABASE_URL is set, the plausible paste', () => {
    withEnv(
      {
        VERCEL: '1',
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/record_collection_test',
        VITEST: undefined,
        NODE_ENV: 'production',
      },
      () => {
        expect(isTestContext()).toBe(false);
      },
    );
  });

  it.each(TEST_SIGNALS)('is inert on Vercel even when %s says otherwise', (signal) => {
    const value = signal === 'NODE_ENV' ? 'test' : 'true';

    withEnv({ VERCEL: '1', [signal]: value }, () => {
      expect(isTestContext(), `${signal} overrode the platform signal`).toBe(false);
    });
  });

  it('is inert on Vercel when DATABASE_URL is unparseable, rather than erring to refusal', () => {
    // pointsAtLocalDatabase catches an unparseable value and errs toward "this
    // is a test", which is right in development and is a total integration
    // outage on a deployment.
    withEnv(
      { VERCEL: '1', DATABASE_URL: 'not-a-url', VITEST: undefined, TEST_DATABASE_URL: undefined },
      () => {
        expect(isTestContext()).toBe(false);
      },
    );
  });

  it('still guards everywhere that is NOT a deployment', () => {
    // The property above must not have been bought by weakening this one.
    withEnv({ VERCEL: undefined, VITEST: 'true' }, () => {
      expect(isTestContext()).toBe(true);
    });

    withEnv({ VERCEL: undefined, VITEST: undefined, NODE_ENV: 'test' }, () => {
      expect(isTestContext()).toBe(true);
    });

    withEnv(
      {
        VERCEL: undefined,
        VITEST: undefined,
        NODE_ENV: 'development',
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/record_collection_test',
      },
      () => {
        expect(isTestContext()).toBe(true);
      },
    );
  });
});
