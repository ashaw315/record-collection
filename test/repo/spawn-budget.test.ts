import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { underLoad } from '../helpers/spawn-budget';
import { DOCUMENT_SUITE } from '../../scripts/document-suite.mjs';

/**
 * **A test that spawns a process is budgeted for a loaded machine (the coordinator, 13 Nov).** On 13 Nov the
 * document suite failed 13 tests at load 14.5, every one a script-spawning test timing out at vitest's default
 * 5s, and a second run at load 35 printed no summary: budgets set at rest, on a working laptop someone else is
 * also using. The run's time scales with the load and the default does not, so each file that spawns declares a
 * budget of ten times its slowest test measured at rest, through `underLoad`.
 */
describe('underLoad', () => {
  it('is ten times the figure measured at rest, rounded up to a second', () => {
    expect(underLoad(2_921)).toBe(30_000);
    expect(underLoad(1_000)).toBe(10_000);
  });

  it('never budgets below vitest\'s own default', () => {
    expect(underLoad(20)).toBe(5_000);
  });
});

/* The document suite's files, read from the same list the intake and commit-checked run. */
const suiteFiles = DOCUMENT_SUITE.flatMap((p: string) => (p.endsWith('.ts') ? [p] : readdirSync(p).filter((f) => f.endsWith('.test.ts')).map((f) => `${p}/${f}`)));

describe('every document-suite file that spawns a process', () => {
  it('declares its budget with underLoad (a source check: it reads the call, not the timing)', () => {
    const spawning = suiteFiles.filter((f: string) => /^import .* from 'node:child_process';$/m.test(readFileSync(f, 'utf8')));
    expect(spawning.length, 'the suite has spawning files to check').toBeGreaterThan(25);
    const undeclared = spawning.filter((f: string) => !/^vi\.setConfig\(\{ testTimeout: underLoad\([\d_]+\) \}\);/m.test(readFileSync(f, 'utf8')));
    expect(undeclared).toEqual([]);
  });
});
