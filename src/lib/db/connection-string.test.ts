import { describe, expect, it } from 'vitest';
import { parse } from 'pg-connection-string';
import { assertLocalHost, resolveConnectionHost } from './connection-string';

/**
 * These tests attack the guard rather than confirm it.
 *
 * C1 shipped because the guard validated with `new URL().hostname` while `pg`
 * connected using pg-connection-string, and the two disagree whenever a `host`
 * query parameter is present. Every case below is one where a naive parser and
 * the real one diverge, or could be made to.
 */

const LOCAL = 'postgresql://postgres:postgres@localhost:5433/record_collection_test';
const NEON = 'postgresql://user:pass@ep-prod.us-east-2.aws.neon.tech/recorddb';

describe('resolveConnectionHost', () => {
  it('agrees with pg on a plain local URL', () => {
    expect(resolveConnectionHost(LOCAL)).toBe('localhost');
    expect(resolveConnectionHost(LOCAL)).toBe(parse(LOCAL).host);
  });

  it('agrees with pg on a plain remote URL', () => {
    expect(resolveConnectionHost(NEON)).toBe('ep-prod.us-east-2.aws.neon.tech');
    expect(resolveConnectionHost(NEON)).toBe(parse(NEON).host);
  });

  /**
   * The C1 vector itself. `new URL(...).hostname` reads "localhost" here; pg
   * connects to the query-parameter host. Proven end-to-end against a live
   * container during the step 1-3 review.
   */
  it('resolves the ?host= override the way pg does, not the way URL does', () => {
    const bypass = `${LOCAL}?host=ep-prod.us-east-2.aws.neon.tech`;

    expect(new URL(bypass).hostname).toBe('localhost');
    expect(resolveConnectionHost(bypass)).toBe('ep-prod.us-east-2.aws.neon.tech');
  });

  it('never disagrees with pg across a corpus of adversarial strings', () => {
    // The anti-drift assertion: if a future pg bump changes parse semantics,
    // this fails rather than silently reopening C1.
    const corpus = [
      LOCAL,
      NEON,
      `${LOCAL}?host=evil.example.com`,
      `${LOCAL}?host=127.0.0.1`,
      `${LOCAL}?sslmode=require`,
      'postgresql://user:pass@127.0.0.1:5432/db',
      'postgresql://user@localhost/db',
      'postgres://localhost/db',
      'postgresql://user:p%40ss@localhost:5432/db',
      'postgresql://localhost:5432/db?application_name=x',
    ];

    for (const cs of corpus) {
      expect(resolveConnectionHost(cs), `diverged on ${cs}`).toBe(parse(cs).host);
    }
  });

  /**
   * pg-connection-string never throws on malformed input — it falls back and
   * invents a host: `parse('not-a-url')` yields "base", `parse('garbage://x')`
   * yields "x". That permissiveness is the reason resolveConnectionHost checks
   * the scheme itself; without it a typo'd env var would be treated as a
   * hostname rather than rejected.
   */
  it('rejects a string with no postgres scheme rather than inferring a host', () => {
    expect(parse('not-a-url').host).toBe('base'); // documents the upstream quirk
    expect(() => resolveConnectionHost('not-a-url')).toThrowError(/scheme|postgresql:\/\//i);
  });

  it('rejects a non-postgres scheme that pg would otherwise parse', () => {
    expect(parse('garbage://x').host).toBe('x'); // upstream would accept this
    expect(() => resolveConnectionHost('garbage://x')).toThrowError(/scheme|postgresql:\/\//i);

    /**
     * `mysql://user:pass@localhost:3306/db` has host "localhost", which the
     * host allowlist ACCEPTS. So the scheme check is the only thing rejecting
     * it, and asserting the scheme message is what pins that — a bare
     * .toThrow() here would pass even if the rejection came from somewhere
     * else entirely.
     */
    expect(() => resolveConnectionHost('mysql://user:pass@localhost:3306/db')).toThrowError(
      /scheme|postgresql:\/\//i,
    );
  });

  /**
   * The `catch` around pg-connection-string's parse, which no test reached
   * until the .toThrow() sweep. Mutation-verified as LIVE BUT UNCONSTRAINED
   * (NOTES.md case 2): removing the throw failed nothing, but parse() genuinely
   * throws on these — verified by calling it directly — so the branch is real
   * and reachable, not dead.
   *
   * Each input passes the scheme check and fails inside parse(), which is the
   * only way to reach this branch.
   */
  describe('a postgres-scheme string that pg-connection-string cannot parse', () => {
    const unparseable = [
      'postgresql://[', // unterminated IPv6 bracket
      'postgresql://%', // malformed percent-encoding
      'postgresql://u:p@[unclosed:5432/db',
      'postgresql://u:p@host:notaport/db', // non-numeric port
    ];

    for (const url of unparseable) {
      it(`rejects ${url} with the parse message, not the scheme one`, () => {
        // Asserts it reached the PARSE branch: if the scheme check had caught
        // it, the message would name the scheme instead.
        expect(() => resolveConnectionHost(url)).toThrowError(/could not be parsed/i);
      });
    }
  });

  it('rejects a postgres URL with an empty host', () => {
    expect(() => resolveConnectionHost('postgresql:///db')).toThrowError(/host/i);
  });
});

describe('assertLocalHost', () => {
  describe('accepts genuinely local targets', () => {
    const accepted = [
      'postgresql://postgres:postgres@localhost:5433/record_collection_test',
      'postgresql://postgres:postgres@127.0.0.1:5433/record_collection_test',
      'postgres://postgres:postgres@localhost:5432/anything',
      // IPv6 loopback in bracket form. `new URL().hostname` returns "[::1]"
      // WITH brackets, which is why the original LOCAL_HOSTS entry of '::1'
      // was dead code that never matched anything.
      'postgresql://postgres:postgres@[::1]:5433/db',
    ];

    for (const url of accepted) {
      it(`accepts ${url}`, () => {
        expect(() => assertLocalHost(url)).not.toThrow();
      });
    }
  });

  describe('refuses the C1 bypass class', () => {
    it('refuses a localhost authority carrying a remote ?host= override', () => {
      expect(() =>
        assertLocalHost(`${LOCAL}?host=ep-prod.us-east-2.aws.neon.tech`),
      ).toThrowError(/host.*(parameter|query)/i);
    });

    it('refuses a host query param even when it points somewhere local', () => {
      // Rejected outright rather than resolved: a connection string that
      // redirects its own host is never something a test helper should accept,
      // and allowing the "harmless" case is how the dangerous case gets in.
      expect(() => assertLocalHost(`${LOCAL}?host=127.0.0.1`)).toThrowError(
        /host.*(parameter|query)/i,
      );
    });

    it('refuses a host param regardless of casing or position', () => {
      expect(() => assertLocalHost(`${LOCAL}?sslmode=require&host=evil.com`)).toThrow();
      expect(() => assertLocalHost(`${LOCAL}?HOST=evil.com`)).toThrow();
    });
  });

  describe('refuses remote hosts', () => {
    const refused = [
      'postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/recorddb',
      'postgresql://user:pass@db.example.com:5432/prod',
      'postgresql://user:pass@10.0.0.5:5432/prod',
      // Authority tricks: the real host is what follows the last '@'.
      'postgresql://user:pass@localhost.evil.com:5432/prod',
      'postgresql://localhost@evil.example.com:5432/db',
      'postgresql://user:localhost@evil.example.com:5432/db',
      // Suffix/prefix games that a substring check would wave through.
      'postgresql://u:p@127.0.0.1.evil.com:5432/db',
      'postgresql://u:p@notlocalhost:5432/db',
      // Alternate loopback encodings are NOT accepted: they are never what the
      // docker-compose test database is addressed as, so treating them as local
      // widens the guard for no benefit.
      'postgresql://u:p@0x7f000001:5432/db',
      'postgresql://u:p@2130706433:5432/db',
      'postgresql://u:p@127.1:5432/db',
      // A different loopback address is still not the compose host.
      'postgresql://u:p@127.0.0.2:5432/db',
    ];

    for (const url of refused) {
      it(`refuses ${url}`, () => {
        expect(() => assertLocalHost(url)).toThrow();
      });
    }

    it('names the offending host so the failure is diagnosable', () => {
      let message = '';
      try {
        assertLocalHost('postgresql://u:p@ep-prod.us-east-2.aws.neon.tech/recorddb');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('ep-prod.us-east-2.aws.neon.tech');
    });

    it('does not echo credentials when reporting a bad host', () => {
      // The thrown error reaches CI logs; the connection string carries a
      // password.
      let message = '';
      try {
        assertLocalHost('postgresql://admin:sup3rs3cret@db.example.com:5432/prod');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).not.toContain('sup3rs3cret');
    });
  });

  describe('refuses ambiguous input rather than guessing', () => {
    it('throws on undefined', () => {
      expect(() => assertLocalHost(undefined)).toThrow();
    });

    it('throws on an empty string', () => {
      expect(() => assertLocalHost('')).toThrow();
    });

    it('throws on a string that is not a connection string', () => {
      expect(() => assertLocalHost('not-a-url')).toThrow();
    });

    it('throws on a unix socket path, which has no TCP host to verify', () => {
      // pg accepts a socket directory as `host`; it is not a hostname and the
      // guard cannot reason about where it points.
      expect(() => assertLocalHost('postgresql:///db?host=/var/run/postgresql')).toThrow();
    });
  });
});
