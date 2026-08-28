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
    expect(output).toMatch(/NOT checked against the real Neon driver/);
  }, 120_000);

  /**
   * **A SKIP MUST NOT BE COUNTED AS A PASS.**
   *
   * Adam, 2026-08-28: *"the file's absence makes the Neon tests skip, and the
   * gate reports a skip as passing. That is absent-versus-unknown in the test
   * harness itself — 'we could not check' reported as 'we checked and it was
   * fine.'"*
   *
   * **This is the reporting bug that hid a three-day outage.** `.env.local` was
   * stranded on Aug 25; the Neon suite skipped from then on; the summary stayed
   * green; and the consequence surfaced two days later as a mysterious
   * "environmental hazard" with three wrong candidate causes.
   *
   * The original gate made the skip NAMED, which was right and insufficient: a
   * named test that PASSES still adds to the passed count, and nobody reads 205
   * green lines looking for one whose name says it checked nothing.
   *
   * **So the gate test must itself be reported as skipped**, not passed. Vitest
   * counts skipped separately, which makes "3175 passed, 1 skipped" carry the
   * information "3175 passed" alone destroys.
   *
   * Fails against the original `expect(configured).toBe(false)` formulation,
   * which passes to announce a skip.
   */
  it('reports the unverified gate as SKIPPED rather than passed', () => {
    const output = execFileSync(
      'npx',
      ['vitest', 'run', 'test/integration/neon-transactions.test.ts', '--reporter=verbose'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NEON_TEST_DATABASE_URL: '' },
        timeout: 120_000,
      },
    );

    /*
     * The summary must show a skip. A run whose only Neon line is a PASS is the
     * failure this test exists for — it means an unverified driver was counted
     * as a verified one.
     */
    expect(output, 'the summary must carry a skipped count').toMatch(/\d+ skipped/);
    expect(
      output,
      'and the gate itself must not be reported as a pass',
    ).not.toMatch(/[✓√]\s*.*NOT checked against the real Neon driver/);
  }, 150_000);

  it('keeps the gate test in the harness source, not only in a comment', () => {
    // A regression deleting the named gate test would make the skip invisible
    // again while every remaining test still passed.
    const source = readFileSync(
      join(REPO_ROOT, 'test/integration/neon-transactions.test.ts'),
      'utf-8',
    );

    expect(source).toMatch(/Neon verification gate/);
    expect(source).toMatch(/it\.skip\(/);
  });
});
