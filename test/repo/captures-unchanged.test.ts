import { execFileSync } from 'node:child_process';
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
