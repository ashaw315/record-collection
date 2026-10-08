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
  /**
   * Whether the working tree at the end of the run was the one it began on.
   * `unchecked` where the caller gave no fingerprints.
   */
  tree: 'unchanged' | 'changed' | 'unchecked';
  /** Paths that changed during the run and that this suite does not read: reported, not judged. */
  treeUnread: string[];
};

/**
 * A fingerprint of the tree: `HEAD` and its commit, and every modified or
 * untracked file with a hash of its contents (`scripts/run-tests.ts` takes
 * it from git). Comparing contents and not names is the point: a file that
 * is dirty at both ends and changed in between is a changed tree.
 */
export type TreeState = Record<string, string>;

/** The paths whose state differs between two fingerprints, in order. */
export function changedPaths(start: TreeState, end: TreeState): string[] {
  return [...new Set([...Object.keys(start), ...Object.keys(end)])].filter((path) => start[path] !== end[path]).sort();
}

/*
  The ledger prints AFTER Playwright's summary, from the global teardown, so
  the summary's counts cannot carry it. Its own lines are read here: a
  `FAILED` line, or the line that says no spec left a genre behind. An
  end-to-end run, as the runner says it launched one, that ends with
  neither ledger line did not run its teardown, and that is not a pass.
*/
const LEDGER_FAILED = /^\[ledger\] FAILED: (.*)$/m;
const LEDGER_CLEAN = /^\[ledger\] genres: none left behind by a spec$/m;
/**
 * Which suite a run is. `end-to-end` is this project's Playwright suite on
 * its default config: it has the global setup that records the ledger's
 * start and the teardown that judges it. `unit` is vitest. `other` is
 * anything else, the sheets included, and is judged on its counts and the
 * whole tree with no ledger expected.
 */
export type Suite = 'end-to-end' | 'unit' | 'other';

/**
 * The suite a command runs, from the command itself. The runner calls this
 * on what it is about to launch, so the judgement is told the suite and
 * does not look for it in the output. It used to: a line the global setup
 * prints marked an end-to-end run, and rewording that line would have
 * turned every Playwright run into one from which no ledger was expected.
 *
 * Its premises (that `npm test` is vitest; that the default Playwright
 * config is the one with the setup and teardown) are tested against
 * `package.json` and the configs in `test/repo/run-result.test.ts`.
 */
export function suiteOf(command: readonly string[]): Suite {
  const words = command.join(' ');
  if (/\bplaywright\s+test\b/.test(words)) return /--config[= ]/.test(words) ? 'other' : 'end-to-end';
  if (/\bvitest\b/.test(words) || /^npm\s+(?:run\s+)?test\b/.test(words)) return 'unit';
  return 'other';
}
/** What no end-to-end file reads: the design folder. One folder, named exactly; nothing else is exempt. */
const UNREAD_BY_END_TO_END = /^docs\/design\//;

const ledgerOf = (output: string, suite: Suite): { state: RunResult['ledger']; said: string | null } => {
  const failed = LEDGER_FAILED.exec(output);
  if (failed !== null) return { state: 'failed', said: failed[1].length > 160 ? `${failed[1].slice(0, 160)}…` : failed[1] };
  if (LEDGER_CLEAN.test(output)) return { state: 'clean', said: null };
  return { state: suite === 'end-to-end' ? 'absent' : 'none', said: null };
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
  tree,
  suite = 'other',
}: {
  output: string;
  exitCode: number;
  /**
   * The number of passing tests this run should have produced. Supply it when
   * the total is known — it is the ONLY thing that catches a truncated run,
   * which otherwise reports a clean summary for the tests it managed to reach.
   */
  expectAtLeast?: number;
  /**
   * The tree's fingerprint when the run began and when it ended. A run over
   * a tree that changed is not a result about either tree: on 6 Oct a design
   * export landed mid-gate, twice, and the second time nothing said so.
   */
  tree?: { start: TreeState; end: TreeState };
  /** Which suite this was, as the runner launched it (`suiteOf`). Not read from the output. */
  suite?: Suite;
}): RunResult {
  const passed = countOf(output, 'passed');
  const failed = countOf(output, 'failed') ?? 0;
  const flaky = countOf(output, 'flaky') ?? 0;
  const skipped = countOf(output, 'skipped') ?? 0;

  const ledger = ledgerOf(output, suite);
  /*
    **Judged against what this suite reads.** The fingerprint is of the
    whole tree; the judgement is of the part the suite depends on. The unit
    suite's index check reads the design targets, the withdrawals list and
    the handoff, so for a unit run every path counts. An end-to-end run
    reads nothing under `docs/design/` (held by a test that fails if any
    end-to-end file names that folder), so for it a change there is
    reported and is not a changed tree. Design's exports land in the working
    tree whenever they are saved; three gates in a row met one mid-run.
  */
  const everyMove = tree === undefined ? [] : changedPaths(tree.start, tree.end);
  const unreadHere = (path: string) => suite === 'end-to-end' && UNREAD_BY_END_TO_END.test(path);
  const moved = everyMove.filter((path) => !unreadHere(path));
  const treeUnread = everyMove.filter(unreadHere);
  const treeState: RunResult['tree'] = tree === undefined ? 'unchecked' : moved.length === 0 ? 'unchanged' : 'changed';
  const treeFault =
    moved.length === 0 ? null : `the tree changed during the run (${moved.slice(0, 4).join(', ')}${moved.length > 4 ? `, and ${moved.length - 4} more` : ''}) — not a result`;
  const base = { passed: passed ?? 0, failed, flaky, skipped, ledger: ledger.state, tree: treeState, treeUnread };
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
    return { ...base, ok: false, reason: [`${failed} failed`, ledgerFault, treeFault].filter((part) => part !== null).join(', and ') };
  }

  /*
    Before the status, because the status is what this file exists not to
    need: a ledger failure is named as one, whatever the run exited with.
  */
  if (ledgerFault !== null || treeFault !== null) {
    return { ...base, ok: false, reason: [ledgerFault, treeFault].filter((part) => part !== null).join(', and ') };
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
  if (result.tree === 'unchanged') parts.push(result.treeUnread.length === 0 ? 'tree unchanged' : `tree unchanged where this suite reads it (${result.treeUnread.length} design ${result.treeUnread.length === 1 ? 'file' : 'files'} changed, unread by this suite)`);
  if (result.tree === 'changed') parts.push('tree CHANGED');

  const verdict = result.ok ? 'OK' : `NOT OK — ${result.reason}`;

  return `${parts.join(', ')} — ${verdict}`;
}
