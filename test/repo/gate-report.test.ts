import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The gate's exit status is its verdict.**
 *
 * On 20 Oct the gate on f4c265e read OK on every half and exited 1. The
 * report ended on the grep that lists failed tests, and under `pipefail` a
 * grep that finds nothing fails, so a clean gate exited 1 and a gate with a
 * failure, which has lines for it to find, exited 0. Nothing noticed because
 * nothing read it.
 *
 * `scripts/gate-report.sh` is run here on logs, not through a gate: the gate
 * that judges a change to this script runs the changed script, so this test
 * is the check that does not depend on the thing it checks. The lines are
 * cut from real gate logs (f4c265e, and 414e121's flaky run).
 *
 * 0 is a gate that passed; 1 a half that did not, a log with no verdict,
 * or logs from more than one run; 2 a run that passed but was not a gate
 * (`GATE_ONLY`); 3 a pass with retries, which `run-result.ts` will not
 * call OK and will not call a failure either.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'gate-report.sh');

const UNIT_OK = '4416 passed, 5 skipped, tree unchanged — OK';
const UNIT_RED = '4363 passed, 1 failed, 5 skipped, tree unchanged — NOT OK — 1 failed';
const CHROMIUM_OK = ['  ✓  508 [chromium] › e2e/record-band-41.spec.ts:59:5 › §41: from 960 to 1439 the record band packs its cells (2.1s)', '[projects] chromium 931', '[margins] 56% left: 13.3s of 30s — [chromium] › e2e/wall-route.spec.ts:146 › clicking a run', '[margins] 57% left: 12.9s of 30s — [chromium] › e2e/wall-route.spec.ts:150 › the second', '  930 passed (1.2h)', '', '930 passed, 1 skipped, ledger clean, tree unchanged — OK'];
const CHROMIUM_RED = ['  ✘  211 [chromium] › e2e/manage.spec.ts:571:5 › a lineup walk reports what it is doing, not just that it is busy (30.1s)', '[projects] chromium 931', '  1 failed', '  929 passed (1.2h)', '', '929 passed, 1 failed, 1 skipped, ledger clean, tree unchanged — NOT OK — 1 failed'];
const MOBILE_RED = ['  ✘  222 [mobile] › e2e/record-detail.spec.ts:831:7 › a record’s page under a fine pointer › under a mouse every control on a record’s page is its drawn size, at 320 (35.6s)', '[projects] mobile 392', '  1 failed', '  387 passed (27.4m)', '', '387 passed, 1 failed, 4 skipped, ledger clean, tree unchanged — NOT OK — 1 failed'];
const MOBILE_OK = ['  ✓  322 [mobile] › e2e/table-row-box-105.spec.ts:55:9 › at 1440, with the row not a containing block (1.9s)', '[projects] mobile 392', '  388 passed (27.1m)', '', '388 passed, 4 skipped, ledger clean, tree unchanged — OK'];
const MOBILE_FLAKY = ['  ✘  159 [mobile] › e2e/manage.spec.ts:571:5 › a lineup walk reports what it is doing, not just that it is busy (30.1s)', '[projects] mobile 392', '  4 flaky', '  384 passed (29.0m)', '', '384 passed, 4 flaky, 4 skipped, ledger clean, tree unchanged — GREEN WITH FLAKES (4 flaky), not OK'];

type Logs = { unit: string | null; chromium: string[] | null; mobile: string[] | null };

/** Writes the three logs as gate.sh names them, `<commit>-unit.log` and `<commit>-e2e-<project>-w1.log`, into one directory. */
function logs(commit: string, content: Logs, dir = mkdtempSync(join(tmpdir(), 'gate-report-'))): { unit: string; chromium: string; mobile: string } {
  const paths = { unit: join(dir, `${commit}-unit.log`), chromium: join(dir, `${commit}-e2e-chromium-w1.log`), mobile: join(dir, `${commit}-e2e-mobile-w1.log`) };
  if (content.unit !== null) writeFileSync(paths.unit, `> vitest run\n\n${content.unit}\n`);
  if (content.chromium !== null) writeFileSync(paths.chromium, `${content.chromium.join('\n')}\n`);
  if (content.mobile !== null) writeFileSync(paths.mobile, `${content.mobile.join('\n')}\n`);
  return paths;
}

function report(commit: string, paths: { unit: string; chromium: string; mobile: string }, env: Record<string, string> = {}): { status: number; output: string } {
  const args = [SCRIPT, commit, paths.unit, `chromium=${paths.chromium}`, `mobile=${paths.mobile}`];
  const environment = { ...process.env, ...env };
  if (!('GATE_ONLY' in env)) delete environment.GATE_ONLY;
  try {
    return { status: 0, output: execFileSync('bash', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: environment }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe("the gate's exit status is its verdict", () => {
  /* The case that was broken. A test of the failing case alone passed all along. */
  it('exits 0 when every half reads OK and no test failed even once', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: MOBILE_OK }));
    expect(result.output).not.toContain('✘');
    expect(result.output).toContain(`unit:       ${UNIT_OK}`);
    expect(result.output).toContain('playwright: mobile: 388 passed, 4 skipped, ledger clean, tree unchanged — OK');
    expect(result.status, result.output).toBe(0);
  });

  /*
    The mirror of the 20 Oct defect. The old report's status was its LAST grep's, mobile's ✘ lines: a failure in
    mobile has one to find, so a red gate exited 0. A failure in chromium alone exited 1, by coincidence.
  */
  it('exits 1 when the last Playwright half reads NOT OK, and names the test that failed', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: MOBILE_RED }));
    expect(result.output).toContain('✘  222 [mobile] › e2e/record-detail.spec.ts:831:7');
    expect(result.status, result.output).toBe(1);
  });

  it('exits 1 when an earlier Playwright half reads NOT OK and the last is clean', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_RED, mobile: MOBILE_OK }));
    expect(result.output).toContain('✘  211 [chromium] › e2e/manage.spec.ts:571:5');
    expect(result.status, result.output).toBe(1);
  });

  it('exits 1 when the unit half reads NOT OK, whatever the Playwright halves found', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_RED, chromium: CHROMIUM_OK, mobile: MOBILE_FLAKY }));
    expect(result.status, result.output).toBe(1);
  });

  it('exits 3 when every half passed but one needed retries, and names the tests retried', () => {
    const result = report('414e121', logs('414e121', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: MOBILE_FLAKY }));
    expect(result.output).toContain('✘  159 [mobile] › e2e/manage.spec.ts:571:5');
    expect(result.status, result.output).toBe(3);
  });

  /* Absent is not passed: a half that wrote nothing, or never ran, has no verdict to read. */
  it('exits 1 when a half wrote no log', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: null }));
    expect(result.output).toMatch(/playwright: mobile: .*no log/i);
    expect(result.status, result.output).toBe(1);
  });

  it('exits 1 when a half wrote an empty log', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: [], mobile: MOBILE_FLAKY }));
    expect(result.status, result.output).toBe(1);
  });

  it('exits 2 when the run passed but ran only some specs, and says it was not a gate', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: MOBILE_OK }), { GATE_ONLY: 'e2e/login.spec.ts' });
    expect(result.output).toContain('NOT A GATE: Playwright ran only e2e/login.spec.ts');
    expect(result.status, result.output).toBe(2);
  });

  it('exits 1, not 2, when a run that was not a gate also failed', () => {
    const result = report('f4c265e', logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: MOBILE_RED }), { GATE_ONLY: 'e2e/record-detail.spec.ts' });
    expect(result.status, result.output).toBe(1);
  });
});

/**
 * **A report assembled from two runs is a verdict on a run that never
 * happened.** 414e121's flaky run was copied aside into
 * `record-collection-gate-logs/414e121-flaky-run/`, so logs from another run
 * sit beside the live ones. A log names its commit only by its file name, as
 * gate.sh writes it; the copy kept those names, so the same commit from two
 * runs is told apart by the directory, and a mixture is refused, not averaged.
 */
describe('a report from one run only', () => {
  it('exits 1 when a log is named for another commit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-report-'));
    const live = logs('f4c265e', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: null }, dir);
    const other = logs('414e121', { unit: null, chromium: null, mobile: MOBILE_FLAKY }, dir);
    const result = report('f4c265e', { ...live, mobile: other.mobile });
    expect(result.output).toMatch(/414e121-e2e-mobile-w1\.log.*not f4c265e/);
    expect(result.status, result.output).toBe(1);
  });

  it('exits 1 when a log of the same commit is from another directory, as the copied flaky run is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-report-'));
    const aside = join(dir, '414e121-flaky-run');
    mkdirSync(aside);
    const live = logs('414e121', { unit: UNIT_OK, chromium: CHROMIUM_OK, mobile: null }, dir);
    const copied = logs('414e121', { unit: null, chromium: null, mobile: MOBILE_OK }, aside);
    const result = report('414e121', { ...live, mobile: copied.mobile });
    expect(result.output).toMatch(/more than one run/i);
    expect(result.status, result.output).toBe(1);
  });
});
