import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **"The script ran" and "the script did what it is for" are different claims,
 * and §14's list checks the first.**
 *
 * SPEC.md §14 requires eleven scripts that "must pass". `db:test:reset` passed
 * that bar for the whole project while being broken: it destroyed the container
 * and recreated it, and because docker-compose.yml puts the data directory on
 * `tmpfs`, the new database had ZERO tables. Nothing in the script migrated.
 * Exit 0, and an unusable database — so the next `npm test` failed somewhere
 * else entirely, with the cause a command earlier that had reported success.
 *
 * R6 found it by running the script and counting tables rather than reading its
 * exit code, which is the whole lesson.
 *
 * These are file-text assertions, and that is the right instrument here: the
 * property is about what a package.json script CONTAINS. Executing
 * `db:test:reset` for real would tear down the very database the suite is
 * running against, so the behavioural version of this test cannot exist inside
 * the suite it would break.
 */

const packageJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'),
) as { scripts: Record<string, string> };

describe('the scripts SPEC.md §14 requires are all present', () => {
  const REQUIRED = [
    'dev',
    'build',
    'start',
    'typecheck',
    'lint',
    'test',
    'test:e2e',
    'db:generate',
    'db:migrate',
    'db:test:up',
    'db:test:reset',
  ];

  it.each(REQUIRED)('defines %s', (name) => {
    expect(packageJson.scripts[name], `§14 requires a ${name} script`).toBeTruthy();
  });
});

describe('db:test:reset leaves a USABLE database, not merely a running one', () => {
  /**
   * Fails against the previous script, which stopped at `docker compose up`.
   */
  it('applies migrations after recreating the container', () => {
    const script = packageJson.scripts['db:test:reset'] ?? '';

    expect(script).toMatch(/drizzle-kit migrate/);
  });

  it('recreates the container before migrating, not after', () => {
    const script = packageJson.scripts['db:test:reset'] ?? '';

    expect(script.indexOf('docker compose up')).toBeLessThan(script.indexOf('drizzle-kit migrate'));
  });

  it('migrates under NODE_ENV=test, so it cannot reach the real database', () => {
    /**
     * The important half. drizzle.config.ts loads .env.test ONLY under
     * NODE_ENV=test; without it the CLI reads the developer's own .env.local
     * and `db:test:reset` would migrate the Neon database this script has no
     * business touching. `resolveDriver` would then also refuse to select a
     * test driver, so the failure is loud rather than destructive — but relying
     * on a downstream guard to catch a command aimed at the wrong database is
     * not the same as aiming it correctly.
     */
    const script = packageJson.scripts['db:test:reset'] ?? '';

    expect(script).toMatch(/NODE_ENV=test\s+drizzle-kit migrate/);
  });

  it('chains with && so a failed step stops the script', () => {
    // With `;` the migrate would run against a container that never came up,
    // and the script would still exit on the last command's status.
    const script = packageJson.scripts['db:test:reset'] ?? '';

    expect(script).not.toMatch(/;\s*docker|;\s*NODE_ENV/);
    expect(script.split('&&').length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * `db:test:up` is deliberately NOT given the same treatment, and this records
 * why so it is not filed as the same defect.
 *
 * It starts a container and says so. Its name is a claim about the container,
 * not about the schema, and `test/global-setup.ts` migrates on every run — so
 * the path `db:test:up` is on already applies migrations before any test reads
 * a table. `db:test:reset` was different because DESTROYING the data is the
 * thing it does, which is what made "and now it has no schema" a surprise
 * rather than a description.
 */
describe('db:test:up is a claim about the container only', () => {
  it('starts the container and does not pretend to migrate', () => {
    expect(packageJson.scripts['db:test:up']).toMatch(/docker compose up/);
  });
});
