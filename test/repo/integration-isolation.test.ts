import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * Every integration test shares ONE local Postgres database and calls
 * truncateAll() in beforeEach (CLAUDE.md §2: truncate rather than re-migrate).
 * That is only safe if no two integration files run at the same time — two
 * concurrent files truncate each other's fixtures mid-test.
 *
 * This was latent until step 4 added a second integration file: with one file
 * there was nothing to race against. The symptom is ugly and misleading —
 * "Cannot read properties of undefined" from a row that existed a moment ago,
 * in a file that was not even edited, with a different subset failing per run.
 * Anyone meeting it fresh would go looking for a logic bug.
 *
 * Asserting on the resolved config rather than on observed behavior is
 * deliberate: a behavioral test for a race either runs the whole suite
 * repeatedly (slow, and green by luck) or reproduces the race (flaky by
 * construction). The setting is the invariant.
 *
 * The config is read by spawning tsx rather than imported directly: importing a
 * .mts path from a typechecked test needs allowImportingTsExtensions, and
 * loosening the tsconfig to satisfy one test is a worse trade than a subprocess.
 */
function readConfigField(expression: string): string {
  const probe = execFileSync(
    'npx',
    [
      'tsx',
      '--eval',
      `import config from './vitest.config.mts';
       process.stdout.write(String(${expression}));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return probe.trim();
}

describe('integration tests never run concurrently against the shared database', () => {
  it('disables file parallelism in the committed config', () => {
    // `fileParallelism: false` is what serializes files. Without it vitest runs
    // one worker per CPU and the truncate in one file lands inside another's
    // test.
    //
    // Read from the config itself, not from a CLI flag: a
    // --no-file-parallelism argument in one npm script would leave every other
    // invocation (vitest --watch, an IDE runner, `npx vitest run <path>`)
    // racing. The config is the only place that covers all of them.
    expect(readConfigField('config.test?.fileParallelism')).toBe('false');
  });
}, 60_000);
