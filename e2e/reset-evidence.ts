import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { RequestLog } from '../scripts/reset-evidence';

/**
 * **Prints, for a request that was reset, what the worker's requests had
 * been doing.** `page.request` calls are steps, so a reporter sees each one
 * with its worker and its time, in every spec and with no helper changed.
 * The line is evidence for the next occurrence of the reset on a seed
 * request; it changes no result and retries nothing.
 */
const REQUEST = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD) |apiRequestContext\./i;

export default class ResetEvidence implements Reporter {
  private readonly log = new RequestLog();

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep): void {
    if (step.category !== 'pw:api' || !REQUEST.test(step.title)) return;
    const time = step.startTime.getTime();
    if (step.error?.message?.includes('ECONNRESET') === true) process.stdout.write(`${this.log.reset(result.workerIndex, time, step.title)}\n`);
    else this.log.request(result.workerIndex, time);
  }

  printsToStdio(): boolean {
    return false;
  }
}
