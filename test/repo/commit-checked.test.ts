import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
