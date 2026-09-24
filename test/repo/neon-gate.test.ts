import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * **The gate's purpose survives; its mechanism is gone.**
 *
 * This guarded a SKIP. The transaction harness needed a remote Neon branch, so
 * it skipped without one, and a silent skip is indistinguishable from a passing
 * check in a summary — the reporting bug that hid a three-day outage when
 * `.env.local` was stranded on 2026-08-25 and the suite skipped green until the
 * consequence surfaced as a mysterious "environmental hazard".
 *
 * There is no skip any more. The driver runs against local Postgres through
 * Neon's own WebSocket proxy, so the harness always has a target and the nine
 * transaction tests always run. **The risk the old gate managed — an
 * unverified driver reported as verified — is now handled by the thing being
 * verified rather than by announcing that it was not.**
 *
 * So these assert what must remain true: the tests genuinely run, they use the
 * real driver, and a broken environment fails LOUDLY rather than quietly
 * reporting nothing. The last is the part that carries the old lesson.
 */
describe('the Neon verification gate cannot go quiet', () => {
  /**
   * **Absent, broken and working are three states, and the dangerous one is
   * broken.** CLAUDE.md §2: "Where a resource can be configured and still not
   * work, probe it, and fail loudly rather than skipping — an unreachable
   * dependency is a broken environment, not an absent one."
   *
   * Staged for real rather than read: the proxy is stopped, the harness is run,
   * and the run must FAIL. A guard is not verified by reading it.
   */
  it('fails loudly when the driver cannot reach the database', () => {
    const stop = () => execFileSync('docker', ['stop', 'record-collection-wsproxy'], { stdio: 'ignore' });
    const start = () => execFileSync('docker', ['start', 'record-collection-wsproxy'], { stdio: 'ignore' });

    let output = '';
    let failed = false;
    stop();
    try {
      execFileSync(
        'npx',
        ['vitest', 'run', 'test/integration/neon-transactions.test.ts'],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 150_000 },
      );
    } catch (error) {
      failed = true;
      const e = error as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    } finally {
      start();
      /* The proxy needs a moment before the next test can dial it. */
      execFileSync('sleep', ['3']);
    }

    expect(failed, 'an unreachable database must fail the run, never skip it').toBe(true);
    expect(output, 'and the message must name the proxy and how to start it').toMatch(
      /WebSocket proxy|docker compose up/,
    );
  }, 200_000);

  /**
   * **The nine tests RUN — the claim the old skip could only announce.**
   *
   * Asserted on the summary, not on the exit status: a run that crashes before
   * reporting exits non-zero with nothing verified, and "no summary line at all
   * is a FAILURE, not a pass".
   */
  it('runs the transaction tests rather than skipping them', () => {
    const output = execFileSync(
      'npx',
      ['vitest', 'run', 'test/integration/neon-transactions.test.ts'],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 150_000 },
    );

    const summary = /Tests\s+(\d+) passed/.exec(output);
    expect(summary, 'the run must report a summary line').not.toBeNull();
    expect(
      Number(summary?.[1] ?? 0),
      'the transaction tests must actually execute',
    ).toBeGreaterThanOrEqual(9);
  }, 200_000);

  /**
   * **The harness must use the REAL driver, not local `pg`.**
   *
   * This is the assertion the whole file exists for, and it is the one most
   * easily satisfied by a proxy: the point of CLAUDE.md §2 is that
   * `neon-serverless` and `node-postgres` differ exactly where correctness is
   * hardest to test, so a harness that quietly fell back to `pg` would verify
   * nothing while passing.
   */
  it('exercises the production driver, not the local pg one', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'test/integration/neon-transactions.test.ts'),
      'utf-8',
    );

    expect(source, 'drizzle over the serverless driver').toMatch(
      /from 'drizzle-orm\/neon-serverless'/,
    );
    expect(source, "and Neon's own Pool").toMatch(/from '@neondatabase\/serverless'/);
    expect(source, 'never the node-postgres driver').not.toMatch(
      /from 'drizzle-orm\/node-postgres'/,
    );
  });
});
