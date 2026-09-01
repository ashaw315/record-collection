import { describe, expect, it } from 'vitest';
import { readRunResult, summarise } from '../../scripts/run-result';

/**
 * **Three exit-code concealments in ONE session, after the rule was already
 * written down.**
 *
 * Adam: *"Three exit-code concealments in one day is not bad luck, it is a
 * reporting path that does not report."*
 *
 * The instances, all real and all reported as green at the time:
 *
 * | run | exit | truth |
 * |---|---|---|
 * | `playwright test \| tail -8` | 0 | `tail`'s status, not the suite's |
 * | a run killed mid-flight | 0 | 210 of 465 tests, silently truncated |
 * | a full run with a real failure | 0 | `444 passed, 1 failed` |
 *
 * NOTES already carried the rule — *"a pipeline's exit code belongs to its LAST
 * command"* — as prose, in a table of instruments that were wrong. **A rule
 * written down is not a mechanism**, which is the whole reason this file exists:
 * the summary line is parsed and judged, so no future session has to remember.
 */
describe('a run is judged by its summary, never by its exit code', () => {
  /**
   * **THE CASE THAT COST THE MOST.** Playwright exits 0 with a failure in the
   * summary. Fails against any checker that trusts the status.
   */
  it('calls a run with failures a failure, whatever it exited with', () => {
    const out = '  1 failed\n    [chromium] › e2e/lookup-flows.spec.ts:1525:5 › the runout renders verbatim\n  20 skipped\n  444 passed (11.5m)\n';

    const result = readRunResult({ output: out, exitCode: 0 });

    expect(result.ok, 'a failure is a failure at exit 0').toBe(false);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(444);
  });

  /**
   * **The truncated run**: killed mid-flight, reported 210 of 465 and exited 0.
   * A checker cannot know the expected total on its own, so it takes one — and
   * a short run is a failure rather than a pass.
   */
  it('calls a run short of its expected total a failure', () => {
    const out = '  19 skipped\n  210 passed (14.9m)\n';

    const result = readRunResult({ output: out, exitCode: 0, expectAtLeast: 440 });

    expect(result.ok, '210 of 465 is not a pass').toBe(false);
    expect(result.reason).toMatch(/expected at least 440/);
  });

  /** The same run without an expectation cannot be judged on length, and says so. */
  it('does not invent a total it was not given', () => {
    const result = readRunResult({ output: '  210 passed (14.9m)\n', exitCode: 0 });

    expect(result.ok).toBe(true);
    expect(result.passed).toBe(210);
  });

  /**
   * **No summary at all is the worst case, not the best.** A crashed or killed
   * run produces no counts; treating "nothing matched" as "nothing failed" is
   * how a dead run reads as green.
   */
  it('refuses to pass a run whose summary it cannot find', () => {
    const result = readRunResult({ output: 'Error: connect ECONNREFUSED\n', exitCode: 0 });

    expect(result.ok, 'no summary is not a pass').toBe(false);
    expect(result.reason).toMatch(/no summary/i);
  });

  /**
   * A non-zero exit stays a failure even when the summary looks clean — the
   * check tightens the rule, it does not loosen it.
   */
  it('still fails on a non-zero exit with a clean summary', () => {
    const result = readRunResult({ output: '  445 passed (11.8m)\n', exitCode: 1 });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exit/i);
  });

  /** Vitest's shape, which differs from Playwright's and must also parse. */
  it('reads vitest summaries too', () => {
    const out = ' Test Files  219 passed (219)\n      Tests  3276 passed (3276)\n';

    const result = readRunResult({ output: out, exitCode: 0 });

    expect(result.ok).toBe(true);
    expect(result.passed).toBe(3276);
  });

  it('reads a vitest run with failures as a failure', () => {
    const out = ' Test Files  2 failed | 217 passed (219)\n      Tests  3 failed | 3273 passed (3276)\n';

    const result = readRunResult({ output: out, exitCode: 0 });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(3);
  });

  /**
   * **Flaky is not clean.** A test that passed on retry still names an
   * instability, and a checker that hides it reproduces the concealment one
   * level up.
   */
  it('reports flakes without calling them failures', () => {
    const out = '  1 flaky\n    [chromium] › e2e/lookup-flows.spec.ts:817:5 › versions collapse\n  19 skipped\n  252 passed (7.6m)\n';

    const result = readRunResult({ output: out, exitCode: 0 });

    expect(result.ok, 'a flake does not fail the run').toBe(true);
    expect(result.flaky, 'but it is reported').toBe(1);
    expect(summarise(result)).toMatch(/1 flaky/);
  });

  /** The human-facing line must carry the counts, not a verdict alone. */
  it('summarises with the numbers a reader needs', () => {
    const result = readRunResult({ output: '  1 failed\n  444 passed (11.5m)\n', exitCode: 0 });

    const line = summarise(result);

    expect(line).toMatch(/444 passed/);
    expect(line).toMatch(/1 failed/);
  });
});
