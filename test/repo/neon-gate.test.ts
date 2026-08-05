import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * The Neon transaction harness skips when NEON_TEST_DATABASE_URL is absent, so
 * CI and a fresh clone are not blocked. That skip is the risk: an untested
 * production driver is the one deferred item that fails SILENTLY and corrupts
 * data rather than erroring, and a silent skip is indistinguishable from a
 * passing check in a suite summary.
 *
 * This asserts the skip is VISIBLE. It runs the harness with the variable
 * removed and requires the summary to name both the variable and what has not
 * been verified.
 */
describe('the Neon verification gate cannot go quiet', () => {
  it('names the unverified gate in the test summary when skipped', () => {
    /**
     * A console.warn at module scope is SWALLOWED by vitest when the whole file
     * is skipped — verified, and it made the original "loud skip" silent in
     * practice. The gate is therefore a named test, which the reporter always
     * prints.
     */
    const output = execFileSync(
      'npx',
      [
        'vitest',
        'run',
        'test/integration/neon-transactions.test.ts',
        '--reporter=verbose',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NEON_TEST_DATABASE_URL: '' },
      },
    );

    expect(output).toMatch(/NEON_TEST_DATABASE_URL/);
    expect(output).toMatch(/NOT verified against the real Neon driver/);
  }, 120_000);

  it('keeps the gate test in the harness source, not only in a comment', () => {
    // A regression deleting the named gate test would make the skip invisible
    // again while every remaining test still passed.
    const source = readFileSync(
      join(REPO_ROOT, 'test/integration/neon-transactions.test.ts'),
      'utf-8',
    );

    expect(source).toMatch(/Neon verification gate/);
    expect(source).toMatch(/skipIf/);
  });
});
