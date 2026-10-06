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

/**
 * **The ledger's verdict is part of the result, and the line carries it.**
 *
 * An end-to-end run's global teardown compares the test database with what
 * the run started with (`e2e/ledger.ts`) and fails on a genre left behind.
 * It does so AFTER Playwright has printed its summary, so the summary reads
 * "691 passed" over a run that left the database dirty: the one line every
 * reader uses, green over a red run. The first time the ledger failed, with
 * 179 names, the line above it said 279 passed and 1 failed for another
 * reason; had that test passed it would have said nothing was wrong.
 *
 * Three states, not two (CLAUDE.md §2): the ledger reported clean, it
 * reported a failure, or an end-to-end run ended without it reporting at
 * all, which is a teardown that did not run and is not a pass.
 */
describe('an end-to-end run is judged by its ledger as well as its counts', () => {
  const SETUP = '[global-setup] seeded the seventeen in 2100ms\n';
  const COUNTS = '  12 skipped\n  691 passed (28.9m)\n';
  const CLEAN = '[ledger] labels: 1 at the start, 65 at the end\n[ledger] genres: none left behind by a spec\n';
  const DIRTY = '[ledger] FAILED: 2 genres left behind: UK82-abc, Crust-abc\n';

  /* Fails against a judgement that reads only the counts and the status: the counts are clean, and the status is what the old checker was built not to need. */
  it('fails a run whose ledger failed, even with clean counts and a zero exit, and says the ledger is why', () => {
    const result = readRunResult({ output: SETUP + COUNTS + DIRTY, exitCode: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ledger/);
    expect(result.reason, 'and carries what the ledger said').toMatch(/2 genres left behind/);
    expect(summarise(result), 'the line a reader uses says so').toMatch(/691 passed.*NOT OK.*ledger/);
  });

  it('passes a run whose ledger reported clean, and the line says the ledger was read', () => {
    const result = readRunResult({ output: SETUP + COUNTS + CLEAN, exitCode: 0 });
    expect(result.ok).toBe(true);
    expect(summarise(result)).toMatch(/691 passed.*ledger clean.*OK/);
  });

  /* Fails against a judgement with two states: no ledger line reads as nothing wrong. */
  it('fails an end-to-end run that ended without the ledger reporting at all', () => {
    const result = readRunResult({ output: SETUP + COUNTS, exitCode: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ledger did not report/);
  });

  it('asks nothing about a ledger of a run that is not end-to-end', () => {
    const result = readRunResult({ output: '      Tests  4056 passed (4056)\n', exitCode: 0 });
    expect(result.ok).toBe(true);
    expect(summarise(result)).not.toMatch(/ledger/);
  });

  /* A failing test outranks nothing: both are said. */
  it('reports a failed test and a failed ledger together', () => {
    const result = readRunResult({ output: `${SETUP}  1 failed\n${COUNTS}${DIRTY}`, exitCode: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/1 failed/);
    expect(result.reason).toMatch(/ledger/);
  });
});

/**
 * Found on 6 Oct while staging a failure: a run in which every test failed
 * prints "1 failed" and no "passed" line at all. The verdict was right and
 * the reason was wrong: "no summary line found — the run did not report",
 * of a run that had reported its failure plainly.
 */
describe('a run in which nothing passed', () => {
  /* Fails against a judgement that takes a missing "passed" count for a missing summary before it looks at the failures. */
  it('is reported as its failures, not as a run that did not report', () => {
    const result = readRunResult({ output: '  1 failed\n    [chromium] › e2e/shelf.spec.ts:304:5 › the rail’s sort\n', exitCode: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('1 failed');
    expect(summarise(result)).toMatch(/^0 passed, 1 failed/);
  });

  it('is still a run that did not report when there are no counts of any kind', () => {
    expect(readRunResult({ output: 'Error: something crashed\n', exitCode: 1 }).reason).toMatch(/did not report/);
  });
});

/**
 * **A run over a tree that changed is not a result.**
 *
 * On 6 Oct a Design export landed in the working tree while a gate's unit
 * suite was running, and the index check read a tree that was not the one
 * the run began on. That time the verdict was a failure and informative.
 * The same thing later in a run reads as a pass about a tree nobody
 * committed: it happened again an hour on, during the Playwright half, and
 * nothing said so. So the runner fingerprints the tree at the start and at
 * the end, and the judged line carries the comparison.
 */
describe('a run is judged against the tree it began on', () => {
  const COUNTS = '      Tests  4064 passed (4064)\n';
  const start = { HEAD: 'f6fb36d', 'docs/captures/bridge-768x900.png': 'aaa' };

  it('passes a run whose tree is the same at the end, and the line says the tree was checked', () => {
    const result = readRunResult({ output: COUNTS, exitCode: 0, tree: { start, end: { ...start } } });
    expect(result.ok).toBe(true);
    expect(summarise(result)).toMatch(/4064 passed, tree unchanged — OK/);
  });

  /* Fails against a judgement that reads only what the run printed: the counts are clean and the exit is zero. */
  it('fails a run during which a file changed, with clean counts and a zero exit, and names the file', () => {
    const end = { ...start, 'docs/design/HANDOFF-wall-and-pull.md': 'bbb' };
    const result = readRunResult({ output: COUNTS, exitCode: 0, tree: { start, end } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/tree changed during the run/);
    expect(result.reason).toMatch(/docs\/design\/HANDOFF-wall-and-pull\.md/);
    expect(summarise(result)).toMatch(/4064 passed, tree CHANGED — NOT OK/);
  });

  /* Fails against a comparison of which files are dirty: the same file is dirty at both ends. */
  it('sees a file that was already modified change again', () => {
    const dirty = { ...start, 'NOTES.md': 'one' };
    const result = readRunResult({ output: COUNTS, exitCode: 0, tree: { start: dirty, end: { ...dirty, 'NOTES.md': 'two' } } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/NOTES\.md/);
  });

  it('sees a commit made during the run, and a file that went away', () => {
    expect(readRunResult({ output: COUNTS, exitCode: 0, tree: { start, end: { ...start, HEAD: '64ff1f7' } } }).reason).toMatch(/HEAD/);
    expect(readRunResult({ output: COUNTS, exitCode: 0, tree: { start, end: { HEAD: 'f6fb36d' } } }).reason).toMatch(/bridge-768x900\.png/);
  });

  it('says both when a test failed and the tree changed', () => {
    const result = readRunResult({ output: '      Tests  1 failed | 4063 passed (4064)\n', exitCode: 1, tree: { start, end: { ...start, HEAD: 'x' } } });
    expect(result.reason).toMatch(/1 failed/);
    expect(result.reason).toMatch(/tree changed/);
  });

  it('claims nothing about a tree it was not shown', () => {
    const result = readRunResult({ output: COUNTS, exitCode: 0 });
    expect(result.ok).toBe(true);
    expect(summarise(result)).not.toMatch(/tree/);
  });
});
