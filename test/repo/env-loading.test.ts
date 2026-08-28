import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * `npm test` must pass on its own. It previously passed only when the caller
 * happened to export TEST_DATABASE_URL inline — `drizzle.config.ts` loads
 * `.env.test` for the CLI, but nothing loaded it into vitest's own process, so
 * global setup threw. That is the same failure family as the `.env.test`
 * mutation caught in the drizzle-config suite: it worked because of how it was
 * invoked, and CI does not invoke it that way.
 *
 * So this asserts on the *outcome* — a real vitest process, spawned with no
 * inline TEST_DATABASE_URL and a hostile ambient environment, resolves the
 * local test database — rather than on the presence of a `config()` call in
 * vitest.config.mts, which a mutation could satisfy while loading nothing.
 */

const PROBE_DIR = join(REPO_ROOT, 'test', 'repo', '.env-loading-probe');
const PROBE_SPEC = join(PROBE_DIR, 'probe.test.ts');
const PROBE_CONFIG = join(PROBE_DIR, 'vitest.probe.mts');
// No --reporter flag: `basic` was removed in Vitest 4 and is now resolved as a
// custom reporter module, which fails to load and kills the run before the
// probe reports.
const PROBE_ARGS = [
  'vitest',
  'run',
  '--config',
  'test/repo/.env-loading-probe/vitest.probe.mts',
];

/**
 * Writes a throwaway spec that reports the TEST_DATABASE_URL its process sees,
 * plus a config that re-exports the real one with globalSetup stripped.
 *
 * Stripping it matters: the real globalSetup applies migrations and throws when
 * TEST_DATABASE_URL is absent, which is precisely the state the first test puts
 * the process in. Without this the probe would die in setup and report nothing,
 * making a broken config and a working one indistinguishable. It is spread from
 * the real config rather than hand-written so the env loading under test is
 * still the real thing.
 */
function writeProbe(): void {
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(
    PROBE_SPEC,
    `import { it } from 'vitest';
     it('reports', () => {
       process.stdout.write('PROBE_URL=' + (process.env.TEST_DATABASE_URL ?? '') + '\\n');
     });
    `,
  );
  /*
   * **Built explicitly, NOT spread from `base.test`.**
   *
   * The previous version did `const { globalSetup: _omit, ...test } = base.test`
   * and added an `include`. Both stopped working the day A46 introduced
   * `test.projects[]`: `globalSetup` moved inside a project, so the destructure
   * stripped a key that was no longer there, and a sibling `include` loses to
   * `projects`, so the probe recursively spawned the WHOLE suite — whose global
   * setup then threw on the very variable this test removes.
   *
   * **It hung rather than failed**, which is why the run that broke it stayed
   * green. `test/repo/probe-config-integrity.test.ts` now guards the shape.
   *
   * `resolve` is still taken from the real config, because path aliases are what
   * the probe needs in order to load at all. What must NOT be inherited is the
   * project structure and its setup.
   */
  writeFileSync(
    PROBE_CONFIG,
    `import base from '../../../vitest.config.mts';
     export default {
       ...base,
       test: {
         environment: 'node',
         include: ['test/repo/.env-loading-probe/probe.test.ts'],
       },
     };
    `,
  );
}

/**
 * Spawns vitest on the probe. Running the real binary against the real config
 * is the point: importing vitest.config.mts directly would prove only that the
 * file evaluates, not that vitest applies it before tests run.
 */
function resolveUrlUnderVitest(): string {
  writeProbe();

  /*
   * **`.env.local` is no longer hidden, because it CANNOT affect this probe.**
   *
   * The original rationale — "on a machine whose .env.local defines a local
   * TEST_DATABASE_URL, it supplies the same value the .env.test load would, so a
   * working and a broken config resolve identically" — no longer holds, and
   * `vitest.config.mts` is why. It loads that file into an ISOLATED object:
   *
   *     config({ path: '.env.local', processEnv: localOnly, quiet: true });
   *
   * and then copies exactly ONE variable out of it, `NEON_TEST_DATABASE_URL`.
   * `TEST_DATABASE_URL` is never read from `.env.local` by any path, so the file
   * cannot make a broken config look like a working one here. The isolation the
   * rename was performing is already performed by the config under test.
   *
   * **And the rename had a failure mode worth being rid of.** It restored in
   * `finally`, which does not run on a kill: a killed run stranded the
   * developer's credentials under an unfamiliar name, gitignored and therefore
   * invisible, from 2026-08-25 to 08-28 — surfacing as a Neon suite that
   * silently skipped and three wrong diagnoses of an "environmental" hazard.
   *
   * **Nothing on disk is touched now, so there is nothing for a kill to
   * strand.** `test/repo/probe-config-integrity.test.ts` fails if a rename
   * returns.
   */
  let output = '';
  try {
    output = execFileSync('npx', PROBE_ARGS, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      /*
       * **Bounded, because a hang here stalls the WHOLE suite.** Without it the
       * parent blocks forever on a child that never exits, and the run reads as
       * "still going" rather than as a failure — which cost four interventions
       * in one session before it was diagnosed.
       */
      timeout: 90_000,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        // The ambient environment a CI runner presents: no test database URL
        // exported, and a remote DATABASE_URL present to prove it is not the
        // fallback being picked up.
        TEST_DATABASE_URL: undefined,
        DATABASE_URL: 'postgresql://user:pass@ep-prod.us-east-2.aws.neon.tech/recorddb',
      },
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    output = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
  } finally {
    rmSync(PROBE_DIR, { recursive: true, force: true });
  }

  const match = /PROBE_URL=(.*)/.exec(output);
  return match?.[1]?.trim() ?? '';
}

describe('npm test loads .env.test without help from the caller', () => {
  it('resolves TEST_DATABASE_URL to the local test database with nothing exported', () => {
    const url = resolveUrlUnderVitest();

    // Reduced to a short label before asserting, for the same reason the
    // drizzle-config suite does it: vitest source-maps a failing frame from
    // test/repo/, walks the repo root, and chokes on favicon.ico, replacing the
    // assertion message with an unreadable sourcemap error.
    const target =
      url === ''
        ? 'UNSET (vitest never loaded .env.test)'
        : /@(localhost|127\.0\.0\.1)/.test(url)
          ? 'local'
          : `NON-LOCAL (${url.replace(/:\/\/[^@]*@/, '://***@')})`;

    expect(target).toBe('local');
  }, 120_000);

  it('lets an explicitly exported TEST_DATABASE_URL win over the file', () => {
    // dotenv must not overwrite an already-set value: pointing a run at a
    // different local database is how a developer works on two branches at
    // once, and .env.test silently reclaiming it would be a surprise.
    writeProbe();

    let output = '';
    try {
      output = execFileSync('npx', PROBE_ARGS, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // Bounded for the same reason as the probe above.
        timeout: 90_000,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          TEST_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/override_db',
        },
      });
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
    } finally {
      rmSync(PROBE_DIR, { recursive: true, force: true });
    }

    const url = /PROBE_URL=(.*)/.exec(output)?.[1]?.trim() ?? '';
    const database = url === '' ? 'UNSET' : (/\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? 'UNPARSEABLE');

    expect(database).toBe('override_db');
  }, 120_000);
});
