import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The gate on GitHub is dispatched with a commit's full id, derived in one
 * place that can only produce it.**
 *
 * `gate.yml` checks out `inputs.commit` by name, and actions/checkout reads a
 * seven-character id as a branch that does not exist: runs 41734064967 and
 * 41738856433 (3 Nov) failed at checkout in 38 and 13 seconds, by hand-typed
 * dispatches, after the full-id requirement was already in NOTES. Remembering
 * it failed, so `scripts/ci-gate.sh` is the one way to dispatch: it takes any
 * ref `git rev-parse` can resolve, hands `gh` the forty characters, and refuses
 * a commit no remote branch holds, which checkout would also fail to find.
 *
 * `gh` is a fake on PATH that records its arguments, so nothing is dispatched
 * from a test; the lines would fail against the script handing `gh` its
 * argument unresolved, or not refusing.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'ci-gate.sh');

function fakeGh(): { dir: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ci-gate-'));
  const log = join(dir, 'gh.log');
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${log}"\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  return { dir, log };
}

function dispatch(args: string[]): { status: number; output: string; calls: string[] } {
  const gh = fakeGh();
  const result = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${gh.dir}:${process.env.PATH ?? ''}` } });
  const calls = existsSync(gh.log) ? readFileSync(gh.log, 'utf8').trim().split('\n') : [];
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}`, calls };
}

/* The dangling commit below needs an author, and a runner has none: CI run 41752642598 failed here on "empty ident name". The identity is the test's own, so the test does not depend on the machine's. */
const IDENT = { GIT_AUTHOR_NAME: 'ci-gate test', GIT_AUTHOR_EMAIL: 'ci-gate@test.invalid', GIT_COMMITTER_NAME: 'ci-gate test', GIT_COMMITTER_EMAIL: 'ci-gate@test.invalid' };
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...IDENT } }).trim();

describe('scripts/ci-gate.sh dispatches the gate on a full commit id', () => {
  /* A commit every remote branch holds: the oldest on origin/main is on no other machine's edits. */
  const pushed = git('rev-list', '--max-parents=0', 'origin/main').split('\n')[0];

  it('resolves a seven-character id to the forty the workflow checks out', () => {
    const short = pushed.slice(0, 7);
    const { status, calls, output } = dispatch([short]);
    expect(status, output).toBe(0);
    expect(calls).toEqual(['workflow', 'run', 'gate.yml', '-f', `commit=${pushed}`, '-f', 'workers=1']);
    expect(pushed).toMatch(/^[0-9a-f]{40}$/);
    expect(output).toContain(pushed);
  });

  it('passes the workers input through', () => {
    const { calls } = dispatch([pushed, '2']);
    expect(calls).toEqual(['workflow', 'run', 'gate.yml', '-f', `commit=${pushed}`, '-f', 'workers=2']);
  });

  it('refuses a ref that names no commit, and dispatches nothing', () => {
    const { status, calls, output } = dispatch(['no-such-ref-3nov']);
    expect(status).not.toBe(0);
    expect(calls).toEqual([]);
    expect(output).toContain('no-such-ref-3nov');
  });

  it('refuses a commit no remote branch holds, which checkout could not find either', () => {
    /* A commit object with no ref on it: written, never on a branch, never pushed. */
    const dangling = git('commit-tree', `${pushed}^{tree}`, '-p', pushed, '-m', 'ci-gate test: unpushed');
    const { status, calls, output } = dispatch([dangling]);
    expect(status).not.toBe(0);
    expect(calls).toEqual([]);
    expect(output).toMatch(/not on any remote branch|unpushed/);
  });
});
