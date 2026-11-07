import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import SweepTwice, { evaluateWriteSites, hitsOf, kindOf, reportOf, type Step } from '../../scripts/sweep-twice.mjs';

/**
 * **The instrument that bounds Q45's list (the coordinator, 6 Nov): every
 * site that reads the same measurement twice with an action between.**
 *
 * The family member is "a test that measures a shared quantity across an
 * action": wall-route:213 read the wall's width, widened the window, read it
 * again; lineup-146 read a box three times around a walk; the wait's
 * equality read the view at the write and at the test's read. Seven sites
 * were listed by inspection; a reporter over Playwright's own steps lists
 * them mechanically, with no transformed copy of the suite: every API step
 * has a title and a source location, so per test the sequence of (location,
 * kind) is known, and a hit is a read location that recurs with an action
 * step between its occurrences. What a reporter cannot tell is whether the
 * quantity read is shared (the collection's) or the test's own, so each hit
 * is a site to read, and the first output is the hit count with a sample.
 *
 * Fails against: a classifier that calls an expect or a wait a read, or a
 * GET an action; a hit finder that counts two reads with nothing between,
 * or two different sites around one action; a reporter that writes a test's
 * hits before its steps have ended, or writes nothing.
 */
const at = (title: string, line: number, file = 'e2e/a.spec.ts'): Step => ({ title, file, line });

/*
  Playwright 1.62 titles its API steps in words ("Evaluate locator", "Click getByRole", "Navigate to "/login"",
  "POST "/api/artists""), not as calls; the first run of this instrument classified 26 of 26 steps as other and
  found no hit in lineup-146, which has three. Both vocabularies are read, and a run's own `kinds` line says
  which it saw.
*/
describe('kindOf: what a Playwright API step is to the sweep', () => {
  it('calls the DOM readers reads, in the call form and in words', () => {
    for (const t of ['page.evaluate', 'locator.evaluate', 'locator.evaluateAll', 'locator.boundingBox', 'locator.textContent', 'locator.getAttribute("data-x")', 'locator.count', 'page.screenshot', 'Evaluate', 'Evaluate locator', 'Evaluate getByTestId', 'Bounding box locator', 'Text content getByRole', 'Get attribute locator', 'Count locator', 'Screenshot', 'Query count locator']) expect(kindOf(t), t).toBe('read');
  });
  it('calls the things that change the page or the collection actions, in both forms', () => {
    for (const t of ['locator.click', 'locator.click(getByTestId("x"))', 'page.goto("/")', 'page.setViewportSize', 'locator.press("Enter")', 'locator.fill("abc")', 'page.reload', 'page.goBack', 'locator.hover', 'mouse.wheel', 'keyboard.press("Escape")', 'apiRequestContext.post("/api/records")', 'apiRequestContext.delete("/api/records/1")', 'Click getByRole', 'Navigate to "/manage?artists=all"', 'Type "abc" getByLabel', 'Press "Enter" locator', 'Fill "abc" locator', 'Set viewport size', 'Reload', 'Go back', 'Hover locator', 'Mouse wheel', 'Keyboard press "Escape"', 'POST "/api/artists"', 'DELETE "/api/records/1"', 'Clear locator']) expect(kindOf(t), t).toBe('action');
  });
  it('calls an assertion, a wait, a GET and the context’s own steps neither', () => {
    for (const t of ['expect.toBeVisible', 'expect.toHaveCount', 'page.waitForTimeout', 'page.waitForFunction', 'locator.waitFor', 'apiRequestContext.get("/api/records")', 'page.request.get', 'Wait for selector locator', 'Wait for timeout', 'Wait for function', 'GET "/api/records"', 'Create context', 'Create page', 'Close context', 'Expect "toBeVisible"']) expect(kindOf(t), t).toBeNull();
  });
});

describe('hitsOf: a read location that recurs with an action between', () => {
  it('finds the lineup shape: read, act, read at the same site, naming the actions between', () => {
    const hits = hitsOf([at('page.evaluate', 10), at('locator.click(getByTestId("wall-zoom-out"))', 11), at('page.evaluate', 10)]);
    expect(hits).toEqual([{ site: 'e2e/a.spec.ts:10', title: 'page.evaluate', reads: 2, actions: ['locator.click'] }]);
  });
  it('counts two reads with nothing between as no hit, and two different sites around one action as no hit', () => {
    expect(hitsOf([at('page.evaluate', 10), at('page.evaluate', 10)])).toEqual([]);
    expect(hitsOf([at('page.evaluate', 10), at('locator.click', 11), at('page.evaluate', 12)])).toEqual([]);
  });
  it('lists each kind of action once, in order of first appearance, across three reads of one site', () => {
    const hits = hitsOf([at('page.evaluate', 10), at('locator.click', 11), at('page.evaluate', 10), at('page.goto("/")', 12), at('locator.click', 13), at('page.evaluate', 10)]);
    expect(hits).toEqual([{ site: 'e2e/a.spec.ts:10', title: 'page.evaluate', reads: 3, actions: ['locator.click', 'page.goto'] }]);
  });
  /* The whole-suite run of 6 Nov listed "Navigate to "/records/c8bc…"" as its own kind of action, once per URL: the name kept its argument, since a word boundary after a closing quote at the end of a title never matches. */
  it('names an action by its words without its argument, so one kind is counted once', () => {
    const hits = hitsOf([at('Evaluate locator', 10), at('Navigate to "/records/c8bc3a1d"', 11), at('Navigate to "/?view=table"', 12), at('Click getByRole', 13), at('Evaluate locator', 10)]);
    expect(hits[0]?.actions).toEqual(['Navigate to', 'Click']);
  });
  it('ignores assertions and waits between two reads: they are not actions', () => {
    expect(hitsOf([at('locator.boundingBox', 10), at('expect.toBeVisible', 11), at('page.waitForTimeout', 12), at('locator.boundingBox', 10)])).toEqual([]);
  });
});

describe('the reporter writes one line per test with its hits, when the test ends', () => {
  it('collects steps in order and writes the hits as JSONL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-twice-'));
    const log = join(dir, 'twice.jsonl');
    const reporter = new SweepTwice({ log });
    const test = { id: 't-1', titlePath: () => ['', 'chromium', 'e2e/a.spec.ts', 'reads the wall twice'], location: { file: 'e2e/a.spec.ts', line: 5, column: 1 } };
    const result = { status: 'passed', retry: 0 };
    const step = (title: string, line: number) => ({ category: 'pw:api', title, location: { file: `${process.cwd()}/e2e/a.spec.ts`, line, column: 3 } });
    reporter.onStepBegin(test, result, step('page.evaluate', 10));
    reporter.onStepBegin(test, result, { category: 'test.step', title: 'a named step', location: undefined });
    reporter.onStepBegin(test, result, step('locator.click', 11));
    reporter.onStepBegin(test, result, step('page.evaluate', 10));
    expect(readFileSync(log, 'utf8'), 'nothing is written until the test ends').toBe('');
    reporter.onTestEnd(test, result);
    const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ test: 'e2e/a.spec.ts:5 reads the wall twice', project: 'chromium', status: 'passed', retry: 0, steps: [{ title: 'page.evaluate', file: 'e2e/a.spec.ts', line: 10 }, { title: 'locator.click', file: 'e2e/a.spec.ts', line: 11 }, { title: 'page.evaluate', file: 'e2e/a.spec.ts', line: 10 }], kinds: { read: 2, action: 1, other: 0 }, titles: { 'page.evaluate': 2, 'locator.click': 1 }, hits: [{ site: 'e2e/a.spec.ts:10', title: 'page.evaluate', reads: 2, actions: ['locator.click'] }] }]);
    rmSync(dir, { recursive: true, force: true });
  });
});

/*
  The blind spot, bounded and closed (the coordinator, 6 Nov): a page.evaluate that scrolls the region is an action
  the reporter read as a read, and wall-settle's own test, the founding case of the family, showed no hit. Counted
  over the suite: 72 of 837 evaluate calls perform a write by their body's tokens, which is many, so the reporter
  reads each evaluate call site's body before the run and takes an Evaluate step at a write site as an action.
*/
describe('an evaluate that writes is an action: the call sites read from the source', () => {
  const fixture = () => {
    const dir = mkdtempSync(join(tmpdir(), 'twice-src-'));
    mkdirSync(join(dir, 'e2e'));
    writeFileSync(join(dir, 'e2e', 'x.spec.ts'), [
      "import { test } from '@playwright/test';",
      "test('t', async ({ page }) => {",
      "  const before = await page.evaluate(() => document.querySelector('[data-region]')!.scrollTop);",
      "  await page.evaluate(() => { const el = document.querySelector('[data-region]') as HTMLElement; el.scrollTop += 240; });",
      "  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });",
      "  const after = await page.evaluate(() => ({ top: document.querySelector('[data-region]')!.scrollTop, same: before === 1 }));",
      '});',
    ].join('\n'));
    return dir;
  };
  it('names the sites whose body mutates: a scroll, a probe reset; not the reads around them', () => {
    const dir = fixture();
    expect([...evaluateWriteSites(dir)].sort()).toEqual(['e2e/x.spec.ts:4', 'e2e/x.spec.ts:5']);
    rmSync(dir, { recursive: true, force: true });
  });
  it('takes an Evaluate step at a write site as the action between two reads, naming it as a write', () => {
    const writes = new Set(['e2e/x.spec.ts:4']);
    const hits = hitsOf([at('Evaluate', 3, 'e2e/x.spec.ts'), at('Evaluate', 4, 'e2e/x.spec.ts'), at('Evaluate', 3, 'e2e/x.spec.ts')], writes);
    expect(hits).toEqual([{ site: 'e2e/x.spec.ts:3', title: 'Evaluate', reads: 2, actions: ['Evaluate (a write)'] }]);
    expect(hitsOf([at('Evaluate', 3, 'e2e/x.spec.ts'), at('Evaluate', 4, 'e2e/x.spec.ts'), at('Evaluate', 3, 'e2e/x.spec.ts')]), 'without the sites, the old blind spot').toEqual([]);
  });
});

/*
  A sweep prints its classification distribution beside its hits, always, and a run where one bucket holds
  everything is a broken reader and not a clean result (the coordinator, 6 Nov): the first run of this instrument
  classified 26 of 26 steps as other, which would have been a confident zero hits, and the only reason it was not
  is that the run happened to print its kinds line. The absent-versus-broken member, made a line every sweep prints.
*/
describe('reportOf: the distribution is always printed, and one bucket holding everything is a broken reader', () => {
  const row = (kinds: { read: number; action: number; other: number }, hits: unknown[] = []) => ({ test: 'e2e/a.spec.ts:1 t', project: 'chromium', status: 'passed', retry: 0, steps: [], kinds, titles: {}, hits });
  it('prints steps by kind with the hits', () => {
    const r = reportOf([row({ read: 4, action: 2, other: 1 }, [{ site: 'e2e/a.spec.ts:10', title: 'Evaluate', reads: 2, actions: ['Click'] }])]);
    expect(r.broken).toBe(false);
    expect(r.lines.join('\n')).toMatch(/^steps by kind: \{"read":4,"action":2,"other":1\}/m);
    expect(r.lines[0]).toMatch(/^hits: 1 site/);
  });
  it('calls a run where every step is other a broken reader, not zero hits', () => {
    const r = reportOf([row({ read: 0, action: 0, other: 26 }), row({ read: 0, action: 0, other: 19 })]);
    expect(r.broken).toBe(true);
    expect(r.lines[0]).toMatch(/^BROKEN READER: 45 of 45 steps read as other/);
  });
  it('calls a run with no actions at all a broken reader too, since a suite acts', () => {
    expect(reportOf([row({ read: 30, action: 0, other: 2 })]).broken).toBe(true);
  });
});
