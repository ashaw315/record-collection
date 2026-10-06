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
  /**
   * The end-to-end ledger's verdict (`e2e/ledger.ts`): what the run left in
   * the test database. `none` for a run that is not end-to-end and has no
   * ledger to report; `absent` for an end-to-end run that ended without one.
   */
  ledger: 'clean' | 'failed' | 'absent' | 'none';
};

/*
  The ledger prints AFTER Playwright's summary, from the global teardown, so
  the summary's counts cannot carry it. Its own lines are read here: a
  `FAILED` line, or the line that says no spec left a genre behind. An
  end-to-end run is known by the global setup's line, which every such run
  prints first; one that ends with neither ledger line did not run its
  teardown, and that is not a pass.
*/
const LEDGER_FAILED = /^\[ledger\] FAILED: (.*)$/m;
const LEDGER_CLEAN = /^\[ledger\] genres: none left behind by a spec$/m;
const END_TO_END = /^\[global-setup\] /m;

const ledgerOf = (output: string): { state: RunResult['ledger']; said: string | null } => {
  const failed = LEDGER_FAILED.exec(output);
  if (failed !== null) return { state: 'failed', said: failed[1].length > 160 ? `${failed[1].slice(0, 160)}…` : failed[1] };
  if (LEDGER_CLEAN.test(output)) return { state: 'clean', said: null };
  return { state: END_TO_END.test(output) ? 'absent' : 'none', said: null };
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

  const ledger = ledgerOf(output);
  const base = { passed: passed ?? 0, failed, flaky, skipped, ledger: ledger.state };
  const ledgerFault =
    ledger.state === 'failed' ? `the ledger failed: ${ledger.said}` : ledger.state === 'absent' ? 'the ledger did not report — the run ended without its teardown' : null;

  /*
    **No summary is the WORST case, not the best.** A crashed run, a killed run
    and a run that never started all produce no counts, and a checker that reads
    "nothing failed" from "nothing reported" is the original bug with extra
    steps.
  */
  if (passed === null && failed === 0) {
    return { ...base, ok: false, reason: 'no summary line found — the run did not report' };
  }

  if (failed > 0) {
    return { ...base, ok: false, reason: ledgerFault === null ? `${failed} failed` : `${failed} failed, and ${ledgerFault}` };
  }

  /*
    Before the status, because the status is what this file exists not to
    need: a ledger failure is named as one, whatever the run exited with.
  */
  if (ledgerFault !== null) {
    return { ...base, ok: false, reason: ledgerFault };
  }

  /*
    A non-zero exit with a clean summary still fails. The status is not trusted
    to say a run PASSED; it is still allowed to say one did not.
  */
  if (exitCode !== 0) {
    return { ...base, ok: false, reason: `non-zero exit (${exitCode})` };
  }

  if (expectAtLeast !== undefined && base.passed < expectAtLeast) {
    return {
      ...base,
      ok: false,
      reason: `expected at least ${expectAtLeast} passing, saw ${base.passed} — the run was cut short`,
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
  if (result.ledger === 'clean') parts.push('ledger clean');
  if (result.ledger === 'failed') parts.push('ledger FAILED');
  if (result.ledger === 'absent') parts.push('ledger ABSENT');

  const verdict = result.ok ? 'OK' : `NOT OK — ${result.reason}`;

  return `${parts.join(', ')} — ${verdict}`;
}
