/**
 * **A misnamed change file fails the intake on its name alone (the coordinator, 13 Nov).**
 *
 * The landed list reads a change file's name and nothing else (`landed-list.mjs`), so a file Design sends without
 * " - for Code to <verb>" applies and is never recorded, and the record later reports it as never arrived. Staged on
 * 13 Nov: a prose-only file so named passed the intake, 0 recorded. The intake runs this on the newest drop: a Markdown
 * file it adds whose name is no change file, FOR CODE note or standing document is named, and the intake fails. The
 * matcher is not widened: the fix for a misnamed file is its name.
 */
const CHANGE_FILE = / - for Code to [a-z]+(?:\.md)?$/;
const NOTE = /^FOR CODE - .+\.md$/;
const STANDING = /^(?:HANDOFF(?:-[a-z-]+)?|DESIGN-RULES|WITHDRAWALS|ASSERTIONS-spec)\.md$/;

/** The names among `added` that are Markdown and none of the kinds a drop carries. */
export function misnamed(added) {
  return added.filter((name) => name.endsWith('.md') && !CHANGE_FILE.test(name) && !NOTE.test(name) && !STANDING.test(name));
}

/** The names, under docs/design/, that the newest drop ref holds and the ref before it did not; refs order by name. */
export function newestAdded(git) {
  const refs = git('for-each-ref', '--format=%(refname)', 'refs/drops').split('\n').filter(Boolean).sort();
  if (refs.length === 0) return { ref: null, added: [] };
  const names = (ref) => new Set(git('ls-tree', '--name-only', ref, 'docs/design/').split('\n').filter(Boolean).map((p) => p.replace(/^docs\/design\//, '')));
  const newest = refs[refs.length - 1];
  const before = refs.length > 1 ? names(refs[refs.length - 2]) : new Set();
  return { ref: newest, added: [...names(newest)].filter((n) => !before.has(n)) };
}
