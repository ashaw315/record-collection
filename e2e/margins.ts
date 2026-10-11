import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { marginsLines, type Timing } from '../scripts/test-margins';

/**
 * **Prints the tests nearest their time limit at the end of a run.**
 *
 * See `scripts/test-margins.ts` for why. The duration is the attempt's,
 * as Playwright reports it, and the limit is the test's own after any
 * `test.setTimeout` or `test.slow`. The two are not measured over exactly
 * the same span (the limit does not cover every fixture and hook the
 * duration does), so a line is a ranking to read and not a figure to
 * assert against, and nothing fails on it.
 */
export default class Margins implements Reporter {
  private timings: Timing[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') return;
    const [, project, , ...titles] = test.titlePath();
    const file = test.location.file.slice(test.location.file.lastIndexOf('/e2e/') + 1);
    this.timings.push({ id: test.id, where: `[${project}] › ${file}:${test.location.line} › ${titles.join(' › ')}`, duration: result.duration, timeout: test.timeout });
  }

  onEnd(): void {
    process.stdout.write(`${marginsLines(this.timings).join('\n')}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
