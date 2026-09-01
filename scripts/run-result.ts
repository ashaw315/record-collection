/**
 * **Reads what a test run actually reported, rather than what it exited with.**
 *
 * Three exit-code concealments happened in one session, every one reported as
 * green at the time:
 *
 * 1. `npx playwright test | tail -8` — a pipeline's status is its LAST
 *    command's, so `tail` succeeding read as the suite succeeding.
 * 2. A run killed mid-flight — 210 of 465 tests, exit 0, no indication the rest
 *    never ran.
 * 3. A full run with a genuine failure — `444 passed, 1 failed`, exit 0.
 *
 * **The rule was already written down** in NOTES, in a table of instruments that
 * reported on something other than the thing under test. It was written down and
 * then walked into three more times, which is the argument for a mechanism: a
 * rule that must be remembered is a rule that will be forgotten at the moment it
 * matters, because that moment looks like every other moment.
 *
 * So the summary line is parsed and judged. Nothing here trusts a status code
 * except to tighten a verdict, never to loosen one.
 */

export type RunResult = {
  /** Whether the run may be reported as green. */
  ok: boolean;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  /** Why it is not ok, when it is not. */
  reason: string | null;
};

/*
  Playwright: "  444 passed (11.5m)" / "  1 failed" / "  1 flaky" / "  20 skipped"
  Vitest:     "      Tests  3276 passed (3276)" / "3 failed | 3273 passed (3276)"

  Both are matched by the same shapes because both put the count before the
  word. Vitest's "Test Files" line is deliberately NOT preferred: the "Tests"
  line is the finer-grained one, and taking the last match of each keyword lands
  on it.
*/
const countOf = (output: string, word: string): number | null => {
  const matches = [...output.matchAll(new RegExp(String.raw`(\d+)\s+${word}\b`, 'g'))];
  const last = matches.at(-1);

  return last === undefined ? null : Number(last[1]);
};

export function readRunResult({
  output,
  exitCode,
  expectAtLeast,
}: {
  output: string;
  exitCode: number;
  /**
   * The number of passing tests this run should have produced. Supply it when
   * the total is known — it is the ONLY thing that catches a truncated run,
   * which otherwise reports a clean summary for the tests it managed to reach.
   */
  expectAtLeast?: number;
}): RunResult {
  const passed = countOf(output, 'passed');
  const failed = countOf(output, 'failed') ?? 0;
  const flaky = countOf(output, 'flaky') ?? 0;
  const skipped = countOf(output, 'skipped') ?? 0;

  const base = { passed: passed ?? 0, failed, flaky, skipped };

  /*
    **No summary is the WORST case, not the best.** A crashed run, a killed run
    and a run that never started all produce no counts, and a checker that reads
    "nothing failed" from "nothing reported" is the original bug with extra
    steps.
  */
  if (passed === null) {
    return { ...base, ok: false, reason: 'no summary line found — the run did not report' };
  }

  if (failed > 0) {
    return { ...base, ok: false, reason: `${failed} failed` };
  }

  /*
    A non-zero exit with a clean summary still fails. The status is not trusted
    to say a run PASSED; it is still allowed to say one did not.
  */
  if (exitCode !== 0) {
    return { ...base, ok: false, reason: `non-zero exit (${exitCode})` };
  }

  if (expectAtLeast !== undefined && passed < expectAtLeast) {
    return {
      ...base,
      ok: false,
      reason: `expected at least ${expectAtLeast} passing, saw ${passed} — the run was cut short`,
    };
  }

  return { ...base, ok: true, reason: null };
}

/**
 * The line a human should read, carrying the counts rather than a verdict alone.
 *
 * **Flakes are named even on a passing run.** A test that passed on retry is
 * still an instability, and a summary that hides it reproduces the concealment
 * this module exists to prevent, one level up.
 */
export function summarise(result: RunResult): string {
  const parts = [`${result.passed} passed`];

  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.flaky > 0) parts.push(`${result.flaky} flaky`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);

  const verdict = result.ok ? 'OK' : `NOT OK — ${result.reason}`;

  return `${parts.join(', ')} — ${verdict}`;
}
