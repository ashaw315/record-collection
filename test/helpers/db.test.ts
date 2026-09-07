import { describe, expect, it } from 'vitest';
import { parse } from 'pg-connection-string';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { assertLocalTestDatabase, getTestDb } from './db';

/**
 * These tests attack the guard. The previous version of this file confirmed it
 * instead — every case was a hostname-shaped string, so it exercised only the
 * inputs the guard was designed to catch and never the ones that defeat it.
 * That is why C1 shipped.
 *
 * The invariant under test: **the host this guard approves must be the host pg
 * actually dials.** Any input where those two diverge is a data-loss path,
 * because `truncateAll` runs between tests and wipes whatever it connects to.
 */

const LOCAL = 'postgresql://postgres:postgres@localhost:5433/record_collection_test';

describe('assertLocalTestDatabase', () => {
  describe('the C1 bypass: validated host vs connected host', () => {
    /**
     * Proven end-to-end against the live container during the step 1-3 review:
     * the old guard read "localhost" from URL.hostname and approved this, while
     * pg connected to the ?host= target.
     */
    it('refuses a localhost URL whose ?host= redirects to a remote database', () => {
      const bypass = `${LOCAL}?host=ep-prod.us-east-2.aws.neon.tech`;

      // The divergence that made this exploitable, asserted explicitly.
      expect(new URL(bypass).hostname).toBe('localhost');
      expect(parse(bypass).host).toBe('ep-prod.us-east-2.aws.neon.tech');

      expect(() => assertLocalTestDatabase(bypass)).toThrow();
    });

    it('refuses a ?host= override even when it points somewhere local', () => {
      // Rejected outright, not resolved-then-allowed. Permitting the benign
      // case is the crack the dangerous case comes through.
      expect(() => assertLocalTestDatabase(`${LOCAL}?host=127.0.0.1`)).toThrow();
    });

    it('refuses a ?host= hidden among other parameters', () => {
      expect(() =>
        assertLocalTestDatabase(`${LOCAL}?sslmode=require&host=evil.example.com`),
      ).toThrow();
    });

    it('refuses a ?host= in unexpected casing', () => {
      expect(() => assertLocalTestDatabase(`${LOCAL}?HOST=evil.example.com`)).toThrow();
      expect(() => assertLocalTestDatabase(`${LOCAL}?Host=evil.example.com`)).toThrow();
    });

    it('refuses a unix socket redirect, which has no verifiable TCP host', () => {
      expect(() => assertLocalTestDatabase(`${LOCAL}?host=/var/run/postgresql`)).toThrow();
    });
  });

  describe('authority tricks where the real host is not the obvious one', () => {
    const tricks = [
      // "localhost" appears, but as userinfo — the host is after the last '@'.
      'postgresql://localhost@evil.example.com:5432/db',
      'postgresql://user:localhost@evil.example.com:5432/db',
      // Substring games a naive `includes('localhost')` would wave through.
      'postgresql://u:p@localhost.evil.com:5432/db',
      'postgresql://u:p@evil-localhost:5432/db',
      'postgresql://u:p@notlocalhost:5432/db',
      'postgresql://u:p@127.0.0.1.evil.com:5432/db',
      // A database named "localhost" is not a host named localhost.
      'postgresql://u:p@evil.example.com:5432/localhost',
    ];

    for (const url of tricks) {
      it(`refuses ${url}`, () => {
        expect(() => assertLocalTestDatabase(url)).toThrow();
      });
    }
  });

  describe('IPv6 and alternate loopback encodings', () => {
    it('accepts the bracketed IPv6 loopback', () => {
      // URL.hostname returns "[::1]" WITH brackets, so the old LOCAL_HOSTS
      // entry of '::1' was dead code that never matched. Now handled.
      expect(() =>
        assertLocalTestDatabase('postgresql://postgres:postgres@[::1]:5433/db'),
      ).not.toThrow();
    });

    it('refuses a non-loopback IPv6 address', () => {
      expect(() =>
        assertLocalTestDatabase('postgresql://u:p@[2001:4860:4860::8888]:5432/db'),
      ).toThrow();
    });

    const obfuscated = [
      'postgresql://u:p@0x7f000001:5432/db', // hex 127.0.0.1
      'postgresql://u:p@2130706433:5432/db', // decimal 127.0.0.1
      'postgresql://u:p@127.1:5432/db', // short form
      'postgresql://u:p@127.0.0.2:5432/db', // different loopback address
    ];

    for (const url of obfuscated) {
      it(`refuses the alternate loopback spelling ${url}`, () => {
        // Narrow by design: docker-compose publishes on localhost and nothing
        // legitimately addresses it these ways, so accepting them would widen
        // the guard for no benefit.
        expect(() => assertLocalTestDatabase(url)).toThrow();
      });
    }
  });

  describe('accepts what the docker-compose test database actually looks like', () => {
    const accepted = [
      'postgresql://postgres:postgres@localhost:5433/record_collection_test',
      'postgresql://postgres:postgres@127.0.0.1:5433/record_collection_test',
      'postgres://postgres:postgres@localhost:5432/anything',
      'postgresql://postgres:postgres@localhost:5433/db?sslmode=disable',
    ];

    for (const url of accepted) {
      it(`accepts ${url}`, () => {
        expect(() => assertLocalTestDatabase(url)).not.toThrow();
      });
    }

    it('returns the connection string unchanged so callers can pass it through', () => {
      expect(assertLocalTestDatabase(LOCAL)).toBe(LOCAL);
    });
  });

  describe('refuses ambiguous input rather than guessing', () => {
    it('throws on undefined, naming the variable', () => {
      expect(() => assertLocalTestDatabase(undefined)).toThrowError(/TEST_DATABASE_URL/);
    });

    it('throws on an empty string, naming the variable', () => {
      expect(() => assertLocalTestDatabase('')).toThrowError(/TEST_DATABASE_URL/);
    });

    it('throws on a non-postgres scheme rather than inferring a host from it', () => {
      // pg-connection-string does not throw on garbage; it invents a host
      // ("not-a-url" -> "base"). The guard must reject before that fallback.
      expect(parse('not-a-url').host).toBe('base');
      expect(() => assertLocalTestDatabase('not-a-url')).toThrow();
      expect(() => assertLocalTestDatabase('mysql://user:pass@localhost:3306/db')).toThrow();
    });
  });

  describe('error messages are safe to put in a CI log', () => {
    it('names the offending host', () => {
      let message = '';
      try {
        assertLocalTestDatabase('postgresql://u:p@ep-prod.us-east-2.aws.neon.tech/recorddb');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain('ep-prod.us-east-2.aws.neon.tech');
    });

    it('does not echo the password', () => {
      // The old implementation interpolated the whole connection string into
      // the parse-failure message, sending credentials to CI logs.
      let message = '';
      try {
        assertLocalTestDatabase('postgresql://admin:sup3rs3cret@db.example.com:5432/prod');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toContain('sup3rs3cret');
    });
  });

  /**
   * The invariant stated as an executable property rather than a list of cases:
   * for every string the guard accepts, the host pg resolves must be local.
   * A future change that reintroduces a parser mismatch fails here even if it
   * passes every hand-written case above.
   */
  describe('property: anything accepted resolves to a local host in pg', () => {
    const corpus = [
      LOCAL,
      'postgresql://postgres:postgres@127.0.0.1:5433/db',
      'postgresql://postgres:postgres@[::1]:5433/db',
      `${LOCAL}?host=evil.example.com`,
      `${LOCAL}?host=127.0.0.1`,
      'postgresql://localhost@evil.example.com:5432/db',
      'postgresql://u:p@localhost.evil.com:5432/db',
      'postgresql://u:p@2130706433:5432/db',
      'not-a-url',
      '',
    ];

    for (const cs of corpus) {
      it(`holds for ${JSON.stringify(cs)}`, () => {
        let accepted = true;
        try {
          assertLocalTestDatabase(cs);
        } catch {
          accepted = false;
        }

        if (accepted) {
          const host = parse(cs).host ?? '';
          const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
          expect(['localhost', '127.0.0.1', '::1']).toContain(bare);
        }
      });
    }
  });
});

/**
 * The guard's whole purpose is that pg cannot be pointed somewhere remote.
 * This closes the loop against a real connection rather than a parsed string:
 * the string that defeated the old guard must now be rejected before any
 * socket is opened.
 */
describe('end-to-end: the bypass string never reaches a connection', () => {
  it('refuses the ?host= bypass before pg can dial it', async () => {
    const bypass = `${LOCAL}?host=127.0.0.1`;

    expect(() => assertLocalTestDatabase(bypass)).toThrow();

    // Demonstrates that pg WOULD have honoured the override — i.e. the guard is
    // the only thing standing between this string and a foreign database.
    const pool = new Pool({ connectionString: bypass });
    try {
      expect(parse(bypass).host).toBe('127.0.0.1');
    } finally {
      await pool.end();
    }
  });
});

/**
 * **The apparatus generating the signal — made structural rather than
 * remembered** (A47, 2026-09-07).
 *
 * Five times in one session a number was believed before the thing producing it
 * was checked. The dramatic instance: a Playwright run and `npm test` against
 * the SAME local database on port 5433, where `truncateAll` deleted the E2E
 * seed data mid-flight and produced **52 bogus E2E failures** across specs the
 * diff never touched, plus two rounds of phantom unit failures in three
 * different files. Both suites re-ran clean serially. Nothing was wrong with
 * the code; the instrument was measuring itself.
 *
 * **"Check what else is running" is a habit, and habits are what this project
 * has already learned not to rely on** — `run-result.ts` exists because the
 * exit-code rule was written down and then walked into three more times. A rule
 * that must be remembered fails at the moment it matters, because that moment
 * looks like every other moment.
 *
 * So the SECOND runner is refused rather than trusted to notice: a session-level
 * advisory lock is held for the life of the run, and a second `truncateAll`
 * against the same database cannot take it.
 */
describe('concurrent runs against one test database (A47)', () => {
  /**
   * Fails against: a `truncateAll` that proceeds while another runner holds the
   * lock — which is the shipped behaviour this guards, and the one that produced
   * 52 failures in code that was fine.
   */
  it('refuses to truncate while another runner holds the database', async () => {
    const { assertExclusiveTestDatabase, TRUNCATE_LOCK_KEY } = await import('./db');

    const connectionString = process.env.TEST_DATABASE_URL;
    if (connectionString === undefined) return;

    // A SEPARATE connection standing in for the other suite's runner.
    const rival = new Pool({ connectionString });

    try {
      const { rows } = await rival.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [TRUNCATE_LOCK_KEY],
      );
      expect(rows[0].locked, 'the rival should hold the lock').toBe(true);

      await expect(assertExclusiveTestDatabase()).rejects.toThrow(/another test run/i);
    } finally {
      await rival.query('SELECT pg_advisory_unlock_all()');
      await rival.end();
    }
  });

  /**
   * Fails against: a guard that refuses when nothing else is running — which
   * would make every ordinary run fail and get the mechanism deleted.
   */
  it('permits the run when nothing else holds the database', async () => {
    const { assertExclusiveTestDatabase } = await import('./db');

    if (process.env.TEST_DATABASE_URL === undefined) return;

    await expect(assertExclusiveTestDatabase()).resolves.toBeUndefined();
  });

  /**
   * Fails against: a guard that takes the lock and drops it, so the window it
   * protects closes the moment it is checked.
   *
   * **The lock must be held for the LIFE of the run**, because the contention it
   * prevents happens between tests, not at startup.
   */
  it('holds the lock rather than releasing it after checking', async () => {
    const { assertExclusiveTestDatabase, TRUNCATE_LOCK_KEY } = await import('./db');

    const connectionString = process.env.TEST_DATABASE_URL;
    if (connectionString === undefined) return;

    await assertExclusiveTestDatabase();

    const rival = new Pool({ connectionString });
    try {
      const { rows } = await rival.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [TRUNCATE_LOCK_KEY],
      );
      expect(rows[0].locked, 'a rival must NOT be able to take the held lock').toBe(false);
    } finally {
      await rival.query('SELECT pg_advisory_unlock_all()');
      await rival.end();
    }
  });
});

/**
 * **The gap the first version of this guard left, found by measuring it** (A47).
 *
 * A session advisory lock dies with its connection. `e2e/global-setup.ts` calls
 * `truncateAll()` then `closeTestDb()`, so the E2E run held the lock for its
 * SETUP and released it before a single test ran — which is precisely the window
 * the incident happened in. The guard would have passed the scenario it was
 * written for.
 *
 * So E2E holds the database through a lock that survives the pool: a row, with
 * the owner's pid, removed when the run ends.
 */
describe('the E2E hold outlives its setup connection (A47)', () => {
  it('still blocks a unit run after the setup pool has closed', async () => {
    const { holdTestDatabase, releaseTestDatabase, assertExclusiveTestDatabase, closeTestDb } =
      await import('./db');

    if (process.env.TEST_DATABASE_URL === undefined) return;

    await holdTestDatabase('e2e');
    // What `global-setup.ts` does immediately afterwards.
    await closeTestDb();

    /*
     * **Rewritten to a DIFFERENT pid**, because the hold deliberately exempts
     * its own process — a run must not block itself between `globalSetup` and
     * its tests. `process.pid + 1` stands in for the other runner; the row is
     * what survives, which is the property under test.
     *
     * `ppid` rather than an invented number: `currentHolder` clears a hold whose
     * process is gone, so a fake pid would be swept as dead and the guard would
     * correctly let the run through — testing the sweep instead of the block.
     */
    const db = getTestDb();
    await db.execute(sql`UPDATE test_harness.run_hold SET pid = ${process.ppid} WHERE id = 1`);

    try {
      await expect(assertExclusiveTestDatabase()).rejects.toThrow(/another test run/i);
    } finally {
      await releaseTestDatabase();
    }
  });

  it('lets the next run proceed once released', async () => {
    const { holdTestDatabase, releaseTestDatabase, assertExclusiveTestDatabase } =
      await import('./db');

    if (process.env.TEST_DATABASE_URL === undefined) return;

    await holdTestDatabase('e2e');
    await releaseTestDatabase();

    await expect(assertExclusiveTestDatabase()).resolves.toBeUndefined();
  });
});
