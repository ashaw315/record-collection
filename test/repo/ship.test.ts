import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **One script owns the unit's last commit, its push, its gate's dispatch and
 * the run id's read, each gated on the previous step's own status (the
 * coordinator, 6 Nov).**
 *
 * Four incidents, each with a local fix, and each next chain typed by hand
 * and free to omit the guard: two refusals piped through `tail` (4 Nov);
 * lint errors printed and pushed (6 Nov, morning); push and dispatch not
 * gated on the commit's status, a duplicate gate on fda52ef cancelled by
 * hand (6 Nov, afternoon); a check that passed and a stage that failed,
 * leaving other paths staged and the next commit refusing on the index
 * (6 Nov, evening). The family member is ci-gate.sh's: a guard present,
 * correct and not on the path, where the path is assembled fresh each time.
 * So the sequence is not assembled: `scripts/ship.sh` runs commit-checked,
 * push, ci-gate and the run-id read, and a step runs only on the status of
 * the one before.
 *
 * Staged in a throwaway repository with a bare remote and stub scripts
 * beside ship.sh that record their arguments and exit as the test says, so
 * nothing here commits to this repository, pushes anywhere or dispatches.
 *
 * Fails against: a script that pushes or dispatches after a refused commit;
 * one that dispatches after a failed push; one that dispatches a ref other
 * than the pushed head or without the worker count; one that prints the
 * first run in the list rather than the one whose head is the pushed id.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'ship.sh');

function stage(options: { commit: number; push?: 'ok' | 'fail'; gate?: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'ship-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'first.txt'), 'first\n');
  git('add', 'first.txt');
  git('commit', '-q', '-m', 'first');
  const remote = mkdtempSync(join(tmpdir(), 'ship-remote-'));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  git('remote', 'add', 'origin', remote);
  git('push', '-q', 'origin', 'main');
  /* A push that fails: the remote moved away after the first push, so ship.sh's own push is the one that fails. */
  if (options.push === 'fail') git('remote', 'set-url', 'origin', join(remote, 'missing'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(SCRIPT, join(dir, 'scripts', 'ship.sh'));
  const calls = join(dir, 'calls.log');
  /* The stub commit makes a real commit when told to pass, so the push has something to push and the dispatch a head to name. */
  writeFileSync(join(dir, 'scripts', 'commit-checked.sh'), `#!/usr/bin/env bash\nprintf 'commit-checked %s\\n' "$*" >> '${calls}'\nif [ ${options.commit} -ne 0 ]; then echo 'NOT COMMITTED: the check failed.' >&2; exit ${options.commit}; fi\nshift 2; git add -- "$@"; git commit -q -m 'unit'\n`);
  writeFileSync(join(dir, 'scripts', 'ci-gate.sh'), `#!/usr/bin/env bash\nprintf 'ci-gate %s\\n' "$*" >> '${calls}'\nexit ${options.gate ?? 0}\n`);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  /* gh lists two runs, the newest on another head: the script prints the one whose head is the pushed id. */
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\nprintf 'gh %s\\n' "$*" >> '${calls}'\nhead="$(git rev-parse HEAD)"\necho '[{"databaseId":111,"headSha":"0000000000000000000000000000000000000000","status":"queued"},{"databaseId":222,"headSha":"'"$head"'","status":"queued"}]'\n`);
  for (const f of ['scripts/ship.sh', 'scripts/commit-checked.sh', 'scripts/ci-gate.sh', 'bin/gh']) chmodSync(join(dir, f), 0o755);
  const run = (args: string[]) => {
    const r = spawnSync('bash', [join(dir, 'scripts', 'ship.sh'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } });
    return { status: r.status ?? -1, output: `${r.stdout}${r.stderr}`, calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [] };
  };
  const remoteHead = () => execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding: 'utf8' }).trim();
  return { dir, git, run, remoteHead };
}

describe('ship.sh: commit, push, dispatch, read, each on the previous status', () => {
  it('a refused commit pushes nothing and dispatches nothing, and exits with the refusal’s status', () => {
    const s = stage({ commit: 5 });
    const before = s.remoteHead();
    writeFileSync(join(s.dir, 'second.txt'), 'second\n');
    const r = s.run(['-m', 'unit', 'second.txt']);
    expect(r.status, 'the refusal’s own status').toBe(5);
    expect(r.calls.some((c) => c.startsWith('ci-gate'))).toBe(false);
    expect(r.calls.some((c) => c.startsWith('gh'))).toBe(false);
    expect(s.remoteHead(), 'nothing pushed').toBe(before);
    expect(r.output).toMatch(/NOT COMMITTED/);
  });

  it('a failed push dispatches nothing', () => {
    const s = stage({ commit: 0, push: 'fail' });
    writeFileSync(join(s.dir, 'second.txt'), 'second\n');
    const r = s.run(['-m', 'unit', 'second.txt']);
    expect(r.status).not.toBe(0);
    expect(r.calls.some((c) => c.startsWith('commit-checked'))).toBe(true);
    expect(r.calls.some((c) => c.startsWith('ci-gate'))).toBe(false);
    expect(r.output).toMatch(/push/i);
  });

  it('a green commit is pushed, and the pushed head is dispatched with the worker count', () => {
    const s = stage({ commit: 0 });
    writeFileSync(join(s.dir, 'second.txt'), 'second\n');
    const r = s.run(['-m', 'unit', '--workers', '4', 'second.txt']);
    expect(r.status).toBe(0);
    const head = s.git('rev-parse', 'HEAD');
    expect(s.remoteHead(), 'the remote holds the new head').toBe(head);
    expect(r.calls.filter((c) => c.startsWith('commit-checked'))).toEqual(['commit-checked -m unit second.txt']);
    expect(r.calls.filter((c) => c.startsWith('ci-gate'))).toEqual([`ci-gate ${head} 4`]);
  });

  it('prints the run whose head is the pushed id, not the first in the list, as its last line', () => {
    const s = stage({ commit: 0 });
    writeFileSync(join(s.dir, 'second.txt'), 'second\n');
    const r = s.run(['-m', 'unit', 'second.txt']);
    expect(r.status).toBe(0);
    const last = r.output.trim().split('\n').pop() ?? '';
    expect(last).toMatch(/^ship: gate run 222 on [0-9a-f]{40} \(queued\)$/);
    /* The run id as a token, never a substring: on gate 42862377882 the staged sha was …fdb711151…, and '111' matched inside it (10 Nov). */
    expect(last).not.toMatch(/gate run 111\b/);
  });

  /*
    Called with nothing to commit, ship.sh died on `args[@]` under set -u (bash 3.2) instead of saying how it is used,
    and the chain that called it read exit 0 through tail (10 Nov). A unit already committed is pushed and gated by
    ci-gate.sh; this script is for the unit's last commit, and it says so.
  */
  it('called with no message and no path, prints its usage, commits nothing and exits non-zero', () => {
    const s = stage({ commit: 0 });
    const r = s.run([]);
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/usage: .*ship\.sh -m/);
    expect(r.output).not.toMatch(/unbound variable/);
    expect(r.calls.some((c) => c.startsWith('commit-checked'))).toBe(false);
  });

  it('a dispatch that fails is the script’s status, after the push stood', () => {
    const s = stage({ commit: 0, gate: 4 });
    writeFileSync(join(s.dir, 'second.txt'), 'second\n');
    const r = s.run(['-m', 'unit', 'second.txt']);
    expect(r.status).toBe(4);
    expect(s.remoteHead()).toBe(s.git('rev-parse', 'HEAD'));
    expect(r.calls.some((c) => c.startsWith('gh'))).toBe(false);
  });
});
