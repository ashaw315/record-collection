#!/usr/bin/env node
/**
 * **docs/design as captured when a Design drop lands, before anything runs against it.**
 *
 *     node scripts/drop-ref.mjs    # on arrival, before the index; exits 1 on the committed state
 *
 * Keeps docs/design as it stands on disk at capture, ignored files included, as a commit
 * under refs/drops/<date>-NN whose parent is the drop before it. It goes in
 * through a throwaway index, so HEAD, the real index and the working tree
 * are untouched, and the ref is on no branch, so neither the commit path nor
 * a push of the branch carries it.
 *
 * Then it says what differs from the last drop, file by file and sentence by
 * sentence. A drop sits uncommitted while the index runs, and on 25 Oct a
 * corrected drop was relayed with nothing saying a new generation had
 * arrived, so a failing assertion read as an unexplained edit. It also gives
 * Design a copy of its own send to compare a claim against.
 *
 * Read one back with `git show refs/drops/<name>:docs/design/<file>`, and
 * compare two with `git diff <a> <b>`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { diffProse } from './export-diff.mjs';

const DIR = 'docs/design';
const PREFIX = 'refs/drops/';

/** The next name for `date`: numbered within the day, so two drops in one day keep two refs. */
export function nextRefName(existing, date) {
  const taken = existing
    .map((name) => new RegExp(`^${PREFIX}${date}-(\\d+)$`).exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number);
  const next = taken.length === 0 ? 1 : Math.max(...taken) + 1;
  return `${PREFIX}${date}-${String(next).padStart(2, '0')}`;
}

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/*
  A ref is named by when it was captured, never by what arrived (the coordinator, 25 Oct). It is the whole
  directory, so one captured after a single file was copied in holds every other file as it stood before:
  "the 12:53 drop" would be wrong about 49 of its 50 files, and "captured at 13:21" is not.
*/
const capturedAt = (ref) => git(['log', '-1', '--format=%cd', '--date=format-local:%H:%M:%S on %Y-%m-%d', ref]);

/** The tree of docs/design as on disk, written through an index of its own. */
function treeOfDisk() {
  const scratch = mkdtempSync(join(tmpdir(), 'drop-ref-'));
  try {
    const env = { GIT_INDEX_FILE: join(scratch, 'index') };
    git(['add', '--force', '--', DIR], env);
    return git(['write-tree'], env);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Each file under docs/design in a tree or commit, path to blob. */
function blobs(ref) {
  const entries = git(['ls-tree', '-r', '-z', ref, '--', DIR]).split('\0').filter(Boolean);
  return new Map(entries.map((entry) => { const [meta, path] = entry.split('\t'); return [path, meta.split(' ')[2]]; }));
}

/*
  The committed state is not a drop (26 Oct). Run to find out whether a drop had arrived, this once captured
  the tree after an intake, whose differences from the last drop were Code's own restored lines. That state is
  the one that matches HEAD: every tracked file as committed, and every file HEAD does not hold as the last drop
  had it. "Nothing uncommitted" is not the test, because a drop that brings a file not yet allowlisted is
  ignored and invisible to git status, as the Mood Pick target was when it arrived.
*/
function isCommittedState(tree, previous) {
  const [disk, head, last] = [blobs(tree), blobs('HEAD'), blobs(previous)];
  for (const [path, blob] of head) if (disk.get(path) !== blob) return false;
  for (const [path, blob] of disk) if (!head.has(path) && last.get(path) !== blob) return false;
  return true;
}

const isBinary = (ref, path) => git(['diff', '--numstat', `${ref.from}`, `${ref.to}`, '--', path]).startsWith('-\t-\t');

/** What differs between two drops, as lines to print. */
function report(from, to) {
  const lines = [];
  const changes = git(['diff', '--name-status', '--no-renames', from, to]).split('\n').filter(Boolean);
  for (const change of changes) {
    const [status, path] = change.split('\t');
    if (status === 'A') { lines.push(`  added    ${path}`); continue; }
    if (status === 'D') { lines.push(`  gone     ${path}`); continue; }
    lines.push(`  changed  ${path}`);
    if (isBinary({ from, to }, path)) { lines.push('    (binary)'); continue; }
    const d = diffProse(git(['show', `${from}:${path}`]), git(['show', `${to}:${path}`]));
    if (d.removed.length + d.reworded.length + d.added.length === 0) { lines.push('    markup only: no sentence differs'); continue; }
    for (const r of d.reworded) lines.push(`    reworded`, `      was: ${r.was}`, `      now: ${r.now}`);
    for (const s of d.removed) lines.push(`    removed: ${s}`);
    for (const s of d.added) lines.push(`    added: ${s}`);
  }
  return lines;
}

function main() {
  const existing = git(['for-each-ref', '--format=%(refname)', PREFIX]).split('\n').filter(Boolean).sort();
  const previous = existing.at(-1);
  const tree = treeOfDisk();
  if (previous !== undefined && git(['rev-parse', `${previous}^{tree}`]) === tree) {
    process.stdout.write(`The same as ${previous}: nothing new has arrived, and no ref was recorded.\n`);
    return 0;
  }
  if (previous !== undefined && isCommittedState(tree, previous)) {
    process.stderr.write(`${DIR} matches HEAD, and nothing HEAD does not hold differs from ${previous}: this is the committed state after an intake, not a drop, and no ref was recorded.\n`);
    return 1;
  }
  const now = new Date();
  const name = nextRefName(existing, localDate(now));
  const parent = previous === undefined ? [] : ['-p', previous];
  const commit = git(['commit-tree', tree, ...parent, '-m', `${DIR} as captured at ${localDate(now)} ${localTime(now)}: the whole directory as it stood, not only what a drop changed`]);
  const captured = `Captured ${DIR} at ${localTime(now)} on ${localDate(now)} as ${name}.`;
  /* The empty old value refuses a name already taken rather than moving it. */
  git(['update-ref', name, commit, '']);
  if (previous === undefined) {
    process.stdout.write(`${captured} The first drop ref: nothing earlier to compare it with.\n`);
    return 0;
  }
  const lines = report(previous, name);
  process.stdout.write(`${captured} It differs from ${previous}, captured at ${capturedAt(previous)}, in ${lines.filter((l) => /^ {2}\S/.test(l)).length} file(s):\n${lines.join('\n')}\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
