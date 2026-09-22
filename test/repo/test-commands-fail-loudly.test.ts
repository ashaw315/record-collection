import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A test command must fail LOUDLY — non-zero — when tests fail.**
 *
 * Fifth instance of the same concealment in this project, and the first four
 * are recorded in `run-result.ts`: a pipeline reporting `tail`'s status; a run
 * killed mid-flight reporting 210 of 465; a genuine `444 passed, 1 failed`.
 * The most recent was a full E2E run reporting `3 failed` and `exited with
 * code 0`.
 *
 * **That last one was diagnosed before it was fixed, and the diagnosis
 * matters**: Playwright's own exit code is CORRECT. Staged with a deliberately
 * failing spec, `npx playwright test` exits 1. What produced the zero was
 * `| tail -22` — a pipeline's status is its LAST command's, so `tail`
 * succeeding read as the suite succeeding. The instrument was never broken;
 * the invocation was, and it is the invocation everyone reaches for when a
 * 500-spec run prints more than a screen.
 *
 * So the fix is `set -o pipefail` inside the scripts themselves, and this
 * pins it by BEHAVIOUR rather than by reading the string: it creates a
 * failing suite in a scratch directory, runs the real command through a pipe,
 * and asserts the status. A test that grepped package.json for "pipefail"
 * would pass on a script where the flag sat in the wrong half of a `&&`.
 */

/** Long enough for a tiny vitest run, short enough to fail fast if it hangs. */
const TIMEOUT = 120_000;

function runThroughPipe(command: string, cwd: string): number {
  try {
    /*
      `bash -c` with `pipefail` in the CALLER: this is the shape a person
      actually uses on a 500-spec run, and the one that concealed the last
      five. The flag is the caller's to set, so the test sets it and then
      asserts that the command underneath reports honestly through it.
    */
    execFileSync('bash', ['-c', `set -o pipefail; ${command} | tail -3`], {
      cwd,
      encoding: 'utf8',
      timeout: TIMEOUT,
      stdio: 'pipe',
    });
    return 0;
  } catch (error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : -1;
  }
}

describe('a failing test run cannot exit 0, even through a pipe', () => {
  it('vitest: a failing suite survives `| tail` as a non-zero status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exitcode-'));
    try {
      writeFileSync(
        join(dir, 'fails.test.ts'),
        `import { expect, it } from 'vitest';\nit('fails on purpose', () => { expect(1).toBe(2); });\n`,
      );

      /*
        A scratch config of its own, so the scratch run does NOT inherit this
        repo's setup and drag the database into a test about exit codes.
        `--config=false` was tried first and is not valid for this version: it
        made vitest error out, so the failing case passed for the wrong reason
        and the passing case failed. An instrument that errors looks exactly
        like the failure it is meant to detect, which is this file's subject.
      */
      writeFileSync(join(dir, 'vitest.config.ts'), `export default { test: { environment: 'node' } };\n`);

      const repo = join(import.meta.dirname, '..', '..');
      const status = runThroughPipe(`"${join(repo, 'node_modules', '.bin', 'vitest')}" run 2>&1`, dir);

      expect(status, 'a failing vitest run reports non-zero through a pipe').not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /*
    The positive half, so the check is not satisfied by a command that fails
    at everything: a PASSING suite must still exit 0 through the same pipe.
    Without this, `exit 1` hard-coded anywhere would satisfy the test above.
  */
  it('and a passing suite still exits 0 through the same pipe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exitcode-ok-'));
    try {
      writeFileSync(
        join(dir, 'passes.test.ts'),
        `import { expect, it } from 'vitest';\nit('passes', () => { expect(1).toBe(1); });\n`,
      );

      writeFileSync(join(dir, 'vitest.config.ts'), `export default { test: { environment: 'node' } };\n`);

      const repo = join(import.meta.dirname, '..', '..');
      const status = runThroughPipe(`"${join(repo, 'node_modules', '.bin', 'vitest')}" run 2>&1`, dir);

      expect(status, 'a passing run is still a pass through a pipe').toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
