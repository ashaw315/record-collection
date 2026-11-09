import { execFileSync } from 'node:child_process';

/**
 * **The committed captures a working tree has rewritten: modified, deleted or retyped since HEAD, staged or not.**
 *
 * Read by `test/repo/captures-unchanged.test.ts`, which exists because a test run overwrote eighteen committed
 * captures (4 and 5 Oct). A file ADDED since HEAD is not counted, untracked or intent-added: a new capture beside
 * the old is how a step adds evidence, and commit-checked.sh intent-adds every untracked path a commit names for
 * its check, so counting additions refused every commit that carried a new capture (27 Oct to 8 Nov).
 */
export function rewrittenCaptures(cwd) {
  return execFileSync('git', ['diff', '--name-only', '--no-renames', '--diff-filter=MDTU', 'HEAD', '--', 'docs/captures'], { cwd, encoding: 'utf-8' })
    .split('\n')
    .filter((line) => line.trim() !== '');
}
