import { parse } from 'pg-connection-string';

/**
 * Connection-string validation for the destructive test-database guards.
 *
 * The rule this module exists to enforce: **never validate with one parser and
 * connect with another.** `new URL(cs).hostname` and the host `pg` actually
 * dials diverge whenever a `host` query parameter is present — pg-connection-
 * string lets `?host=` override the URL authority entirely. A guard reading
 * `URL.hostname` therefore approves `postgresql://…@localhost/db?host=prod`
 * while `pg` connects to prod, which is a direct path to `truncateAll` wiping
 * real data.
 *
 * So parsing here goes through pg's own parser, at the version `pg` resolves.
 */

/**
 * Hosts that are unambiguously the local Docker test database.
 *
 * Deliberately narrow. Alternate loopback spellings (`0x7f000001`, `2130706433`,
 * `127.1`, other 127.0.0.0/8 addresses) are rejected: docker-compose.yml
 * publishes on localhost and nothing legitimately addresses it another way, so
 * accepting them would widen the guard for no benefit.
 *
 * `::1` is stored unbracketed because that is what pg-connection-string yields.
 * `new URL().hostname` returns `[::1]` WITH brackets, which is why the previous
 * `LOCAL_HOSTS` entry of `'::1'` was dead code that could never match.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Returns the host `pg` will actually connect to, applying the same precedence
 * pg does — including the `?host=` override.
 *
 * Throws if the string cannot be parsed into a host at all.
 */
export function resolveConnectionHost(connectionString: string): string {
  // pg-connection-string is permissive by design: it never throws on garbage,
  // it falls back. `parse('not-a-url')` yields host "base"; `parse('garbage://x')`
  // yields host "x". Neither is a postgres URL, so the scheme is checked first —
  // otherwise a typo'd value would be silently treated as a hostname.
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
    throw new Error(
      'Connection string must start with postgresql:// or postgres://. ' +
        'pg-connection-string accepts almost any input and infers a host from it, ' +
        'so an unrecognised scheme is rejected here rather than parsed.',
    );
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(connectionString);
  } catch {
    throw new Error('Connection string could not be parsed.');
  }

  const host = parsed.host;
  if (host === null || host === undefined || host === '') {
    throw new Error('Connection string does not specify a host.');
  }

  return host;
}

/**
 * Case-insensitive search for a `host` query parameter.
 *
 * Checked on the raw string rather than via a parsed query object so that odd
 * encodings cannot hide it. A connection string that redirects its own host is
 * rejected outright — even when the override points somewhere local — because
 * allowing the benign case is how the dangerous one gets in.
 */
function hasHostQueryParameter(connectionString: string): boolean {
  const queryStart = connectionString.indexOf('?');
  if (queryStart === -1) return false;

  const query = connectionString.slice(queryStart + 1);
  return query
    .split('&')
    .some((pair) => pair.split('=')[0]?.trim().toLowerCase() === 'host');
}

/**
 * Throws unless `connectionString` unmistakably addresses the local Docker test
 * database.
 *
 * Used by every destructive path: `truncateAll` deletes every row in every
 * table and runs automatically between tests, so pointing it at a remote
 * database must be structurally impossible rather than merely unlikely.
 *
 * Error messages name the host but never echo the connection string, which
 * carries a password and reaches CI logs.
 */
export type DriverSelection =
  | { driver: 'pg'; connectionString: string }
  | { driver: 'neon'; connectionString: string };

export interface DriverEnv {
  DATABASE_URL: string;
  // Optional properties, matching what Zod's `.optional()` produces, so the
  // parsed Env is assignable here without restating its shape.
  TEST_DATABASE_URL?: string | undefined;
  NODE_ENV?: string | undefined;
}

/**
 * Chooses the driver from `TEST_DATABASE_URL` alone, never from `NODE_ENV`.
 *
 * This is a data-safety boundary. Playwright does not set `NODE_ENV=test`, so
 * selecting on it would have E2E runs connect to the real Neon database — and
 * the reset-between-tests rule (CLAUDE.md §2) truncates whatever it connects
 * to. Presence of a test database URL is the only signal that cannot silently
 * point at production.
 *
 * Lives here rather than in src/db/client.ts so that drizzle.config.ts can use
 * the identical function: client.ts is marked `server-only`, which throws when
 * drizzle-kit loads its config as a plain CLI module. Migrations and queries
 * must never disagree about which database they address.
 */
export function resolveDriver(env: DriverEnv): DriverSelection {
  // `TEST_DATABASE_URL=` in a .env file means absent, not "the empty string".
  const testUrl =
    env.TEST_DATABASE_URL !== undefined && env.TEST_DATABASE_URL !== ''
      ? env.TEST_DATABASE_URL
      : undefined;

  if (testUrl !== undefined) {
    // A TEST_DATABASE_URL is a promise that this points at the disposable local
    // database, and everything downstream (truncate-between-tests) acts on that
    // promise. Verify it here rather than trusting it: validation uses pg's own
    // parser, so a `?host=` override cannot redirect the connection past a
    // check that read only the URL authority.
    assertLocalHost(testUrl);
    return { driver: 'pg', connectionString: testUrl };
  }

  if (env.NODE_ENV === 'test') {
    throw new Error(
      'Refusing to select a database driver: NODE_ENV is "test" but TEST_DATABASE_URL is not set. ' +
        'Falling back to DATABASE_URL here would point tests at the real database, which the ' +
        'reset-between-tests rule would then truncate. Start the local test database with ' +
        '`npm run db:test:up` and set TEST_DATABASE_URL.',
    );
  }

  return { driver: 'neon', connectionString: env.DATABASE_URL };
}

export function assertLocalHost(connectionString: string | undefined): string {
  if (connectionString === undefined || connectionString === '') {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests require the local Docker test ' +
        'database — start it with `npm run db:test:up`.',
    );
  }

  if (hasHostQueryParameter(connectionString)) {
    throw new Error(
      'Refusing a connection string carrying a `host` query parameter. It overrides the ' +
        'host in the URL authority, so what is validated is not what pg connects to — the ' +
        'exact bypass that lets a destructive test helper reach a remote database.',
    );
  }

  const host = stripBrackets(resolveConnectionHost(connectionString));

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run destructive test helpers against non-local host "${host}". ` +
        'Integration tests truncate every table, so they may only ever point at the ' +
        'local Docker test database (localhost, 127.0.0.1 or ::1).',
    );
  }

  return connectionString;
}
