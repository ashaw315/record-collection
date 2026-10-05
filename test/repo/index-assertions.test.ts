import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * **`check-index.mjs` was never in the suite, and that is how it exited 1
 * unnoticed.**
 *
 * The script is the index's only check, and for the whole of its life nothing
 * invoked it: a full unit run reported zero failures on the same tree where
 * the script reported twenty-one missing entries. Its exit code is the result,
 * per its own spec, and a result nobody reads is not one.
 *
 * Run here rather than only in CI, because the defects it catches are
 * introduced by editing the design files, which happens on this machine.
 */
describe('the design index passes its own assertions', () => {
  it('exits zero, and says which assertion failed when it does not', () => {
    let output = '';
    let code = 0;
    try {
      output = execFileSync('node', ['scripts/check-index.mjs'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? 1;
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    /*
      The offender lines are the evidence; the exit code alone would say only
      that something is wrong. Both go into the failure message so a reader
      does not have to re-run the script to learn what happened.
    */
    expect(code, `check-index.mjs failed:\n${output}`).toBe(0);
  });

  /**
   * **The counts, not the verdicts.** Each set-quantified assertion prints how
   * many things it checked, because "PASS" on an empty set is the vacuous pass
   * that hid a destroyed mark layer for five Design drops: 7 and 8a both
   * passed on a file with zero marks, 7 because there was nothing to check and
   * 8a because unmarked text reads as wholly live.
   */
  it('checks a non-empty set in every set-quantified assertion', () => {
    let output = '';
    try {
      output = execFileSync('node', ['scripts/check-index.mjs'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? '');
    }

    const count = (label: RegExp) => Number(label.exec(output)?.[1] ?? 0);
    /*
      **3 reads two orders, and both counts must be non-zero.** The tree's
      steps are what the sequence check runs over; the committed order's
      done-marked steps are what the done-absent check runs over, read from
      HEAD because an export that drops a step drops its mark with it. A
      zero in the second place means the script could not read HEAD, and a
      silent zero there would pass exactly the loss the check exists for.
    */
    expect(count(/3: (\d+) steps in the tree/), 'assertion 3 checked steps').toBeGreaterThan(0);
    expect(count(/3: \d+ steps in the tree, (\d+) marked done in HEAD/), 'assertion 3 read done marks from HEAD').toBeGreaterThan(0);
    expect(count(/6: (\d+) entries checked/), 'assertion 6 checked entries').toBeGreaterThan(0);
    expect(count(/7: (\d+) declared/), 'assertion 7 found declared sentences').toBeGreaterThan(0);
    /*
      **6 and 7 count different things, so the run says how they meet (5 Oct).**
      6 counts every entry; 7 counts declared sentences, which the entries
      with a declared prefix pair with one to one. The rest are exempt only
      as a section's own first wording (s equals by). A gap between the two
      figures read as 7 passing over unpaired entries until it was asked
      about; the line now states the sum, and this holds it.
    */
    const entries = count(/6: (\d+) entries checked/);
    const declared = count(/7: (\d+) declared/);
    const exempt = count(/7: \d+ declared withdrawal sentences against \d+ entries: \d+ paired, (\d+) exempt/);
    const paired = count(/7: \d+ declared withdrawal sentences against \d+ entries: (\d+) paired/);
    expect(paired, 'every declared sentence is paired').toBe(declared);
    expect(paired + exempt, `paired and exempt account for every entry (${paired} + ${exempt} against ${entries})`).toBe(entries);
    /*
      **In-scope, not the list total.** 8a iterates governs rows and §1-§10
      have pointer rows, so the settled file's eight entries are permanently
      beyond it; comparing against the list length showed a clean run as a
      standing shortfall of eight.
    */
    const removed = count(/8a: \d+ rows, (\d+) of \d+ in-scope/);
    const scope = count(/8a: \d+ rows, \d+ of (\d+) in-scope/);
    expect(removed, '8a removed quotes').toBeGreaterThan(0);
    expect(removed, 'and removed every quote it could reach').toBe(scope);
  });
});
