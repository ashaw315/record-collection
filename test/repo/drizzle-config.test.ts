import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * H2: drizzle.config.ts used to re-implement env checking and driver selection
 * with a weaker `if (!url) throw`, so `db:migrate` — the one command that
 * writes schema — accepted connection strings that boot validation rejected.
 * It also loaded .env.local but never .env.test, so `NODE_ENV=test
 * npm run db:migrate` read the developer's own DATABASE_URL.
 *
 * These run the real CLI in a controlled environment. `.env.local` is
 * deliberately NOT relied on: on a developer machine it can mask a regression
 * by supplying a fallback value, which is exactly what happened when this fix
 * was first mutation-tested.
 */

function runMigrate(env: Record<string, string | undefined>): {
  ok: boolean;
  output: string;
} {
  try {
    const output = execFileSync('npx', ['drizzle-kit', 'migrate'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}` };
  }
}

describe('drizzle.config.ts shares one schema with the app', () => {
  /**
   * **Removed: an assertion that `drizzle.config.ts` contains two import
   * statements.**
   *
   * It asserted the FORM of the fix rather than its effect, and the effect is
   * already covered here by "rejects a DATABASE_URL that boot validation would
   * reject", which loads the config the way drizzle-kit does and checks the
   * resolved behaviour. Mutation-verified: replacing the `parseEnv` import with
   * a hand-rolled stub fails that test on its own, so the text check added
   * nothing.
   *
   * Not a general licence to delete file-text tests — two others in this
   * directory survived the same scrutiny. `neon-gate.test.ts` greps a test file
   * for its gate, and mutation showed it is the ONLY thing that catches the
   * gate being renamed away; its behavioural sibling passes, because the
   * warning text it matches is unchanged. A file-text assertion is right
   * exactly when the property is about a file — that a test still exists, that
   * a generated block has not been appended — and wrong when it stands in for
   * behaviour that can be observed.
   */

  it('imports from modules free of the server-only marker', () => {
    // src/env.ts and src/db/client.ts both carry `import 'server-only'`, whose
    // entry point throws outside a React Server Component context. Importing
    // either here breaks the CLI outright.
    const source = readFileSync(join(REPO_ROOT, 'drizzle.config.ts'), 'utf-8');

    expect(source).not.toMatch(/from\s+['"]\.\/src\/env['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\/src\/db\/client['"]/);
  });

  it('rejects a DATABASE_URL that boot validation would reject', () => {
    // Previously accepted: the old `if (!url) throw` only checked presence.
    const result = runMigrate({
      NODE_ENV: 'development',
      TEST_DATABASE_URL: '',
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
    });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('DATABASE_URL');
  });

  it('refuses a TEST_DATABASE_URL whose ?host= redirects off-box', () => {
    // Migrations must not be applied anywhere resolveDriver would refuse to
    // query — applying schema to the wrong database is as damaging as reading
    // it, and this is the C1 vector.
    const result = runMigrate({
      NODE_ENV: 'test',
      TEST_DATABASE_URL:
        'postgresql://postgres:postgres@localhost:5433/db?host=ep-prod.us-east-2.aws.neon.tech',
    });

    expect(result.ok).toBe(false);
  });

  /**
   * Asserting only "migrate succeeded" is not enough, and proving that cost a
   * mutation-test round: on a machine whose .env.local happens to define a
   * local TEST_DATABASE_URL, removing the .env.test load still succeeds — via
   * .env.local. A developer without that line would have migrated the Neon
   * database in the same run, silently.
   *
   * So the assertion is on the *resolved target*, evaluated by loading the
   * config the way drizzle-kit does. `.env.test` must win under NODE_ENV=test
   * regardless of what .env.local holds.
   */
  it('resolves NODE_ENV=test to the local test database, never to DATABASE_URL', () => {
    // `.env.local` is temporarily hidden. On a machine whose .env.local happens
    // to define a local TEST_DATABASE_URL, it supplies the same value the
    // .env.test load would, so both a working and a broken config resolve
    // identically and the test cannot tell them apart. Hiding it makes
    // .env.test the only possible source, which is the thing under test.
    //
    // A developer whose .env.local lacks that line — or carries only the Neon
    // DATABASE_URL — is the case this protects: without the .env.test load
    // they would migrate production.
    const envLocal = join(REPO_ROOT, '.env.local');
    const stashed = join(REPO_ROOT, '.env.local.drizzle-config-test-stash');
    const hadEnvLocal = existsSync(envLocal);

    let url = '';
    if (hadEnvLocal) renameSync(envLocal, stashed);
    try {
      // tsx, not `node --experimental-strip-types`: the config's imports omit
      // file extensions (TypeScript `bundler` resolution), which Node's
      // type-stripping rejects outright with ERR_MODULE_NOT_FOUND.
      //
      // The probe writes ONLY the URL to stdout and the assertions run outside
      // this try, so vitest never has to source-map a tsx-transpiled frame —
      // doing so previously replaced the assertion message with an unreadable
      // "Unexpected token" sourcemap error.
      const probe = execFileSync(
        'npx',
        [
          'tsx',
          '--eval',
          `import config from './drizzle.config.ts';
           process.stdout.write(String(config.dbCredentials.url));`,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_ENV: 'test',
            // Hostile ambient environment: a remote DATABASE_URL is present and
            // no TEST_DATABASE_URL is exported. Only the .env.test load can
            // keep this off the remote database.
            TEST_DATABASE_URL: undefined,
            DATABASE_URL: 'postgresql://user:pass@ep-prod.us-east-2.aws.neon.tech/recorddb',
          },
        },
      );
      url = probe.trim();
    } finally {
      if (hadEnvLocal) renameSync(stashed, envLocal);
    }

    // Compared as plain strings rather than via a regex/substring matcher.
    // Vitest source-maps the frame of a failing assertion, and doing so from
    // this file walks the repo root and chokes on a binary (favicon.ico),
    // replacing the message with an unreadable sourcemap error. Reducing the
    // check to an equality on a short label keeps the diagnosis in the message
    // itself, where it survives that formatting.
    const target = /@(localhost|127\.0\.0\.1)/.test(url)
      ? 'local'
      : `NON-LOCAL (${url.replace(/:\/\/[^@]*@/, '://***@')})`;

    expect(target).toBe('local');
  }, 60_000);
});
