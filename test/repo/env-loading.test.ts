import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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
  writeFileSync(
    PROBE_CONFIG,
    `import base from '../../../vitest.config.mts';
     const { globalSetup: _omit, ...test } = base.test ?? {};
     export default {
       ...base,
       test: { ...test, include: ['test/repo/.env-loading-probe/probe.test.ts'] },
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

  // `.env.local` is temporarily hidden for the same reason the drizzle-config
  // suite hides it: on a machine whose .env.local defines a local
  // TEST_DATABASE_URL, it supplies the same value the .env.test load would, so
  // a working and a broken config resolve identically and the test cannot tell
  // them apart.
  const envLocal = join(REPO_ROOT, '.env.local');
  const stashed = join(REPO_ROOT, '.env.local.env-loading-test-stash');
  const hadEnvLocal = existsSync(envLocal);

  let output = '';
  if (hadEnvLocal) renameSync(envLocal, stashed);
  try {
    output = execFileSync('npx', PROBE_ARGS, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
    if (hadEnvLocal) renameSync(stashed, envLocal);
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
