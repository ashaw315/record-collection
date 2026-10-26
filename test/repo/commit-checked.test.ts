import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_SUITE } from '../../scripts/document-suite.mjs';

/**
 * **A check whose result does not stop the commit is not a check.**
 *
 * On 9 Oct step 110 was committed and pushed with `captures-unchanged`
 * reading `1 failed` on the line above: the repo checks and the commit were
 * typed as one command, the checks' output went through `grep`, and the
 * commit ran whatever they said. That is the same shape as reading `tail`'s
 * exit status (`run-tests-cli.test.ts`), one step later: the verdict was
 * printed and nothing was made to depend on it.
 *
 * `scripts/commit-checked.sh` runs the check first, stages and commits only
 * if it passed, and stages nothing until then, because the check that
 * failed reads staged captures as changed. Staged here in a throwaway
 * repository, with the check replaced by a command that passes or fails.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'commit-checked.sh');

function repo(): { dir: string; git: (...args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'commit-checked-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'first.txt'), 'first\n');
  git('add', 'first.txt');
  git('commit', '-q', '-m', 'first');
  copyFileSync(SCRIPT, join(dir, 'commit-checked.sh'));
  return { dir, git };
}

function run(dir: string, check: string, args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync('bash', [join(dir, 'commit-checked.sh'), ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, COMMIT_CHECK: check } });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('a commit that depends on its check', () => {
  it('does not commit, and stages nothing, when the check fails', () => {
    const { dir, git } = repo();
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, 'echo "1 failed"; exit 1', ['-m', 'second', 'second.txt']);
    expect(result.status, 'the script fails').not.toBe(0);
    expect(git('rev-parse', 'HEAD'), 'no commit was made').toBe(before);
    expect(git('diff', '--cached', '--name-only'), 'and nothing was staged').toBe('');
    expect(result.output).toMatch(/not committed/i);
  });

  /*
   * **A refusal keeps its log (26 Oct).** The first run for ad6d429 refused
   * with 1 of 573 document tests failed, and the output had gone to the
   * terminal through a filter, so the test could not be named: the run whose
   * log was needed was the one nothing kept. The log is kept under the
   * repository's common git directory, which outlives the throwaway worktree
   * commits are made in and is never committed. Fails against a script that
   * only streams the check's output.
   */
  it('keeps the log of a refused check outside the working tree, and names where', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, 'echo "573 tests, 1 failed: the-one.test.ts"; exit 1', ['-m', 'second', 'second.txt']);
    expect(result.status).not.toBe(0);
    const named = /kept at (\S+)/.exec(result.output)?.[1] ?? '';
    expect(named, result.output).not.toBe('');
    expect(readFileSync(named, 'utf8')).toContain('1 failed: the-one.test.ts');
    expect(named.startsWith(join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), '')), 'under the common git directory').toBe(true);
    expect(git('status', '--porcelain', '--untracked-files=all').split('\n').sort(), 'and nothing new in the tree').toEqual(['?? commit-checked.sh', '?? second.txt']);
  });

  /* The 9 Oct shape exactly: the failing check's output goes through a filter that itself succeeds. */
  it('does not commit when the check fails behind a pipe', () => {
    const { dir, git } = repo();
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, '(echo "1 failed"; exit 1) | grep failed', ['-m', 'second', 'second.txt']);
    expect(result.status).not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('commits exactly the paths named when the check passes', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    writeFileSync(join(dir, 'third.txt'), 'third\n');
    const result = run(dir, 'echo "4 passed"', ['-m', 'second', 'second.txt']);
    expect(result.status, result.output).toBe(0);
    expect(git('log', '-1', '--format=%s')).toBe('second');
    expect(git('show', '--name-only', '--format=', 'HEAD')).toBe('second.txt');
    expect(git('status', '--porcelain'), 'the path not named is left alone').toContain('?? third.txt');
    /* Only a refusal's log is worth keeping; fails against a script that keeps every run's. */
    const logs = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'commit-checked');
    expect(existsSync(logs) ? readdirSync(logs) : [], 'a passing run keeps no log').toEqual([]);
  });

  /* The check reads the tree; something staged beforehand is a tree the check was not asked about. */
  it('refuses to start with something already staged', () => {
    const { dir, git } = repo();
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    git('add', 'second.txt');
    const result = run(dir, 'echo "4 passed"', ['-m', 'second', 'second.txt']);
    expect(result.status).not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    expect(result.output).toMatch(/already staged/i);
  });

  it('refuses with no message or no paths', () => {
    const { dir } = repo();
    expect(run(dir, 'true', ['second.txt']).status).not.toBe(0);
    expect(run(dir, 'true', ['-m', 'second']).status).not.toBe(0);
  });
});

/**
 * **One list, two consumers (20 Oct).** The intake command ran test/repo
 * and the wall's unit test, which reads the target's drawing; this script
 * ran test/repo alone. Two paths into a commit with different tolerances,
 * and the weaker one had the shorter name. Both now take their test set
 * from `scripts/document-suite.mjs`, the list code-region.test.ts holds
 * whole against every test that reads docs/design. Read here from what the
 * script actually runs: a stub `npx` records its arguments and refuses, so
 * nothing is committed. Fails against the default check that named
 * test/repo itself.
 */
describe('the default check is the document suite', () => {
  it('runs vitest on exactly the list the intake runs', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(join(process.cwd(), 'scripts', 'document-suite.mjs'), join(dir, 'scripts', 'document-suite.mjs'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const record = join(dir, 'npx-args');
    writeFileSync(join(bin, 'npx'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\nprintf '%s' "$COMMIT_PATHS" > '${record}-paths'\nexit 1\n`);
    chmodSync(join(bin, 'npx'), 0o755);
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const before = git('rev-parse', 'HEAD');
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    delete env.COMMIT_CHECK;
    let status = 0;
    try {
      execFileSync('bash', [join(dir, 'commit-checked.sh'), '-m', 'second', 'second.txt'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch (error) {
      status = (error as { status?: number }).status ?? 1;
    }
    expect(status, 'the stub refuses, so the script does not commit').not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    const args = readFileSync(record, 'utf8').trim().split('\n');
    const at = args.indexOf('run');
    expect(args.slice(at - 1, at + 1), 'a vitest run').toEqual(['vitest', 'run']);
    expect(args.slice(at + 1), 'on the document suite, whole and nothing else').toEqual(DOCUMENT_SUITE);
    /* Fails against a check told nothing of the commit it guards: CLAUDE.md's integrity test reads this to tell the commit's own edit from a stray one. */
    expect(readFileSync(`${record}-paths`, 'utf8').split('\n'), 'the check is told the paths it is guarding').toEqual(['second.txt']);
  });

  /* Fails against a default that passes an empty list on: `vitest run` with no path runs every suite and says nothing of why. */
  it('refuses, running nothing, when the list names no tests', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'document-suite.mjs'), "process.stdout.write('');\n");
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const record = join(dir, 'npx-args');
    writeFileSync(join(bin, 'npx'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\nexit 0\n`);
    chmodSync(join(bin, 'npx'), 0o755);
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const before = git('rev-parse', 'HEAD');
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    delete env.COMMIT_CHECK;
    let status = 0;
    let output = '';
    try {
      execFileSync('bash', [join(dir, 'commit-checked.sh'), '-m', 'second', 'second.txt'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status ?? 1;
      output = failure.stderr ?? '';
    }
    expect(status).not.toBe(0);
    expect(output).toMatch(/named no tests/);
    expect(git('rev-parse', 'HEAD'), 'no commit').toBe(before);
    expect(existsSync(record), 'and nothing ran').toBe(false);
  });
});
