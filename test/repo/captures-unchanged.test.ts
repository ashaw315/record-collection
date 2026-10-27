import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * **A committed capture is evidence for a decision, and nothing rewrites it.**
 *
 * The record detail closed at 7983d4d on 119 captures from Adam's pass. Two
 * specs, `no-cover-54` and `images-row-56`, screenshotted into fixed paths
 * under `docs/captures/` on every run, so a gate rewrote eighteen of the
 * close's files with pictures of a later build -- found once on 4 Oct and
 * again on 5 Oct, each time by reading `git status`, not by any check. The
 * writers now write only with `WRITE_CAPTURES=1`; this is what catches the
 * next writer, which will not know about the flag.
 *
 * Tracked files only. A new capture beside the old ones is how a step adds
 * evidence, so untracked files are allowed; a tracked file that differs
 * from HEAD, staged or not, or has been deleted, fails here by name.
 */
describe('committed captures are unchanged', () => {
  it('no tracked file under docs/captures differs from HEAD', () => {
    const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'docs/captures'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    })
      .split('\n')
      .filter((line) => line.trim() !== '');
    expect(changed, `committed captures were rewritten or removed:\n  ${changed.join('\n  ')}`).toEqual([]);
  });
});

/**
 * **Every spec screenshot into docs/captures waits for the switch (26 Oct).**
 * The test above sees tracked files only, so a spec writing NEW captures on
 * every run passed it: `pick-answer-156` wrote eight on the gate for
 * 1ca3918, whose ledger read the tree as changed and the run as no result.
 * Read from the specs' text: a `screenshot` call whose path is under
 * docs/captures, on a line that does not test `WRITE_CAPTURES`. Capture
 * tools (`e2e/capture`, `e2e/sheet`) write by design and are not specs.
 */
describe('specs write captures only when asked', () => {
  it('no spec screenshots into docs/captures without WRITE_CAPTURES', () => {
    const dir = join(REPO_ROOT, 'e2e');
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.spec.ts'))
      .flatMap((file) =>
        readFileSync(join(dir, file), 'utf-8')
          .split('\n')
          .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
          .filter(({ line }) => /screenshot\(\{[^}]*path:\s*[`'"]docs\/captures/.test(line) && !line.includes('WRITE_CAPTURES'))
          .map(({ at }) => at),
      );
    expect(offenders, `specs writing captures on every run:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
