import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf-8');

/**
 * The deploy applies migrations, so code and schema cannot separate (A49).
 *
 * **The gap this closes, which bit twice.** Code deploys automatically on push;
 * schema migrated by hand. Nothing sequenced them, so every schema change had a
 * window where the deployed code was ahead of the deployed schema — bounded only
 * by how fast someone remembered.
 *
 * NOTES predicted the serious version and it arrived exactly as written: A48
 * shipped `saveDerivedActs` writing to `artist_derived_acts`, the migration was
 * never applied to production, and a lineup import Adam triggered by hand
 * returned a live 500 (`42P01 relation does not exist`) surfaced as "Internal
 * server error".
 *
 * Three options were recorded. **"Migrate before push" is a habit rather than a
 * mechanism and is the thing that failed.** "Tolerate the column's absence" buys
 * a silently-no-op write, which is the absent-versus-unknown failure this
 * project keeps naming. This is the third and the one NOTES called honest: the
 * two cannot separate, because one command does both.
 */
describe('the deploy applies migrations (A49)', () => {
  const vercel = JSON.parse(read('vercel.json')) as { buildCommand?: string };
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  /**
   * Fails against the shipped configuration — no `buildCommand`, so Vercel runs
   * `next build` alone and a migration is never applied by a deploy.
   */
  it('runs a migration step before building', () => {
    expect(vercel.buildCommand).toBeDefined();
    expect(vercel.buildCommand).toMatch(/db:deploy|db:migrate/);
  });

  /**
   * Fails against a build that migrates and then trusts the exit code.
   *
   * `drizzle-kit migrate` prints "migrations applied successfully" and exits 0
   * even when a diverged ledger made it apply nothing — three databases in this
   * project reached that state. The deploy must assert the STATE, which is what
   * `verify-migration-state.mjs` exists to do.
   */
  it('verifies the resulting state rather than trusting an exit code', () => {
    const command = vercel.buildCommand ?? '';
    const script = pkg.scripts[command.replace(/^npm run /, '')] ?? command;

    expect(`${command} ${script}`).toMatch(/verify:state|verify-migration-state/);
  });

  /**
   * Fails against a build that migrates but does not build, or builds without
   * migrating — both of which would "pass" a looser check on the command string.
   */
  it('still builds the app', () => {
    const command = vercel.buildCommand ?? '';
    const script = pkg.scripts[command.replace(/^npm run /, '')] ?? command;

    expect(`${command} ${script}`).toMatch(/next build|npm run build/);
  });

  /**
   * **The ordering is the whole point.** A build that compiles first and
   * migrates second would still deploy code ahead of schema if the migration
   * failed — the artifact exists and Vercel ships it. Migrate, verify, then
   * build, so a bad migration fails the deploy before there is anything to ship.
   */
  it('migrates BEFORE it builds, so a failed migration blocks the deploy', () => {
    const command = vercel.buildCommand ?? '';
    const script = pkg.scripts[command.replace(/^npm run /, '')] ?? command;
    const line = `${command} ${script}`;

    const migrateAt = line.search(/drizzle-kit migrate|db:migrate|db:deploy/);
    const buildAt = line.search(/next build/);

    expect(migrateAt).toBeGreaterThanOrEqual(0);
    expect(buildAt).toBeGreaterThan(migrateAt);
  });
});
