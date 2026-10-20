/**
 * **The paths a checked commit is about to make**, as `commit-checked.sh`
 * declares them to its check (`COMMIT_PATHS`, one per line). A guard that
 * refuses an edit to a file can then tell the commit's own edit from a
 * stray write, rather than refusing both: CLAUDE.md's integrity test, which
 * otherwise forced every change to the rules onto a plain `git commit`.
 */
import { normalize } from 'node:path';

/** @param {Record<string, string | undefined>} [env] */
export const declaredPaths = (env = process.env) => (env.COMMIT_PATHS ?? '').split('\n').filter((path) => path !== '');

/** `git status --porcelain -- path`'s output, read three ways: no edit, an edit the commit names, an edit nothing names. */
export function editState(porcelain, path, declared) {
  if (porcelain.trim() === '') return 'unchanged';
  return declared.some((entry) => normalize(entry) === normalize(path)) ? 'declared' : 'undeclared';
}
