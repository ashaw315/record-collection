import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **The wall specs that drive real animation clocks declare a timeout that
 * fits them, and this says so if one stops.**
 *
 * The full E2E suite reported four failures that all passed serially — the
 * shape of database contention, which had been the cause once before and had
 * been mitigated by cutting workers. Measured this time rather than assumed:
 * the database held zero records at rest, and `record-navigation`'s put-back
 * test took **32.9 seconds running entirely alone** against Playwright's
 * 30-second default. It did not fit its budget on an idle machine; load only
 * decided which of several near-ceiling wall specs crossed first.
 *
 * So the fix is a budget, declared per file where the need was measured, at
 * twice the worst case. This is a PROXY assertion — it reads the declaration,
 * not the behaviour — and is named for what it checks. The behaviour is the
 * suite's own summary line, which is the only instrument that reports it.
 */
const BUDGETED = ['e2e/record-navigation.spec.ts', 'e2e/shelf.spec.ts', 'e2e/wall-first-paint.spec.ts'];

describe('the wall specs with a measured overrun declare their budget', () => {
  it.each(BUDGETED)('%s configures a 60s timeout', (path) => {
    const body = readFileSync(path, 'utf8');
    expect(body, 'declares the budget at module scope').toMatch(/test\.describe\.configure\(\{ timeout: 60_000 \}\)/);
    /* And the reason travels with it: a bare number is the next thing to be "tidied". */
    expect(body, 'names the measurement that set it').toMatch(/32\.9s/);
  });
});
