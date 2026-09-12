import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * **The fourth wrapper in one session to report success about nothing.**
 *
 * `scripts/run-result.ts` is a LIBRARY. Invoked as a command —
 * `npx tsx scripts/run-result.ts npm test` — it evaluates a module of exports,
 * runs no tests, prints nothing and exits 0. That is precisely the concealment
 * the module exists to prevent, reachable by misusing the instrument itself,
 * and it is the only one of the four reachable by ACCIDENT rather than by a
 * race or a pipe:
 *
 * | wrapper | reported | truth |
 * |---|---|---|
 * | `nohup … \| tail -18` | clean | buffered; kill left a 0-byte log |
 * | kill -9 + relaunch | exit 0 | port race, zero tests ran |
 * | task notification | exit 0 | log's own last line read `exit=1` |
 * | `run-result.ts` as a CLI | exit 0 | a library evaluated, nothing run |
 *
 * So the CLI is the mechanism, and these tests are about the SHELL rather than
 * the judgement — `run-result.test.ts` already covers the judgement. What must
 * hold here is that no invocation of this script can produce silence and a
 * zero.
 */

const run = (args: string[]): { stdout: string; status: number } => {
  try {
    const stdout = execFileSync('npx', ['tsx', 'scripts/run-tests.ts', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
      status: failure.status ?? 1,
    };
  }
};

describe('the CLI cannot report success about nothing', () => {
  /**
   * **The defect, staged.** With no command to run there is nothing to judge,
   * and the old failure was to treat that as a pass. Exiting non-zero with a
   * message is the fix; exiting 0 in silence is the bug.
   */
  it('refuses to exit 0 when given no command', () => {
    const { stdout, status } = run([]);

    expect(status, 'no command must not read as a passing run').not.toBe(0);
    expect(stdout).toMatch(/usage/i);
  });

  it('fails loudly when the command does not exist', () => {
    const { stdout, status } = run(['definitely-not-a-real-binary-xyz']);

    expect(status).not.toBe(0);
    /* A command that never ran produced no summary, which is NOT OK. */
    expect(stdout).toMatch(/NOT OK/);
  });

  /**
   * A command that runs but reports no counts is the crashed-run case, and it
   * is the one a naive wrapper calls green: nothing failed, because nothing
   * reported.
   */
  it('calls a command that reports no summary NOT OK, even when it exits 0', () => {
    const { stdout, status } = run(['node', '-e', 'process.exit(0)']);

    expect(status, 'silence is not a pass').not.toBe(0);
    expect(stdout).toMatch(/no summary line found/);
  });

  it('reports the counts and exits 0 when a run genuinely passes', () => {
    const { stdout, status } = run([
      'node',
      '-e',
      'console.log("  Tests  12 passed (12)")',
    ]);

    expect(status).toBe(0);
    expect(stdout).toMatch(/12 passed/);
    expect(stdout).toMatch(/OK/);
  });

  /**
   * **The case that cost the most, end to end.** Playwright exits 0 with a
   * failure in its summary; the CLI must exit non-zero anyway, or it is just
   * another wrapper passing a status through.
   */
  it('exits non-zero on a failing summary that exited 0', () => {
    const { stdout, status } = run([
      'node',
      '-e',
      'console.log("  1 failed\\n  448 passed (14.6m)"); process.exit(0)',
    ]);

    expect(status, 'a failure in the summary must fail the wrapper').not.toBe(0);
    expect(stdout).toMatch(/1 failed/);
    expect(stdout).toMatch(/NOT OK/);
  });

  /** Flakes are named on a passing run rather than hidden by it. */
  it('names a flake while still exiting 0', () => {
    const { stdout, status } = run([
      'node',
      '-e',
      'console.log("  1 flaky\\n  448 passed (14.6m)")',
    ]);

    expect(status).toBe(0);
    expect(stdout).toMatch(/1 flaky/);
  });

  /**
   * The child's own output must reach the terminal. A wrapper that swallows it
   * and prints only a verdict makes a failure unreadable, which is how the
   * buffered-pipe instance became a 0-byte log.
   */
  it('passes the run output through rather than swallowing it', () => {
    const { stdout } = run([
      'node',
      '-e',
      'console.log("a line the suite printed\\n  Tests  3 passed (3)")',
    ]);

    expect(stdout).toMatch(/a line the suite printed/);
  });
});
