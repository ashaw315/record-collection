import { execFileSync, spawnSync } from 'node:child_process';
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

  /*
    A new migration failed the fresh-clone test three times (NOTES 4137, 5433,
    5951, 27 Oct): that test copies `git ls-files`, so an untracked file named
    in the journal is invisible to it, while staging the file's content trips
    the refusal above. The path is intent-added for the check's duration: in
    the index, so `ls-files` lists it; no content staged, so `git diff
    --cached --quiet` stays quiet. Undone on a refusal, so the tree is as it was.
  */
  it('intent-adds an untracked named path for the check, so a check that reads git ls-files sees it, then commits it', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'new.txt'), 'new\n');
    const result = run(dir, 'test -n "$(git ls-files -- new.txt)" && echo "1 passed"', ['-m', 'new', 'new.txt']);
    expect(result.status, result.output).toBe(0);
    expect(git('show', '--stat', '--format=', 'HEAD')).toContain('new.txt');
  });

  it('lets the check see the intent-added path and undoes it when the check fails, leaving the path untracked', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'new.txt'), 'new\n');
    const before = git('rev-parse', 'HEAD');
    const result = run(dir, 'git ls-files -- new.txt > seen.txt; false', ['-m', 'new', 'new.txt']);
    expect(result.status).not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    expect(readFileSync(join(dir, 'seen.txt'), 'utf8').trim(), 'the check saw the path in the index').toBe('new.txt');
    expect(git('ls-files', '--', 'new.txt'), 'and after the refusal it is not in the index').toBe('');
    expect(git('status', '--porcelain', '--', 'new.txt')).toBe('?? new.txt');
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
    /* Lint and typecheck pass here (a stub `npm` that exits 0), so the chain reaches the suite; the test below is where they refuse. */
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'npm'), 0o755);
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

  /*
    **Lint's own exit status gates the commit, before any suite runs (the coordinator, 6 Nov).** A chain printed
    "lint exit 1, 2 errors" and committed and pushed anyway, because nothing in it read lint's status; the fix
    recorded first was a NOTES rule, which is a note and not a watch. Here `npm run lint` refuses (a stub `npm`
    exiting 1 on `run lint`), and the script commits nothing and never reaches the suite: the stub `npx` records
    nothing. Fails against the default check that ran the suite alone, and against one that runs lint but reads
    its output rather than its status.
  */
  it('refuses on lint’s own exit status, running no suite, and commits nothing', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(join(process.cwd(), 'scripts', 'document-suite.mjs'), join(dir, 'scripts', 'document-suite.mjs'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const npmRecord = join(dir, 'npm-args');
    const npxRecord = join(dir, 'npx-args');
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' "$@" >> '${npmRecord}'\ncase "$*" in *lint*) exit 1 ;; esac\nexit 0\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    writeFileSync(join(bin, 'npx'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${npxRecord}'\nexit 0\n`);
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
    expect(status, 'lint refused, so the script does not commit').not.toBe(0);
    expect(git('rev-parse', 'HEAD'), 'no commit was made').toBe(before);
    expect(readFileSync(npmRecord, 'utf8'), 'lint was run').toMatch(/run\nlint/);
    expect(existsSync(npxRecord), 'and the suite was never reached').toBe(false);
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

/**
 * **The export follows the commit (the coordinator, 29 Oct).** Design rules
 * against the handoff Code exports, and an export taken at the intake is
 * taken before the commit it describes, so a relay named a commit that did
 * not yet exist or carried a tree that was not one. A commit that touches
 * `docs/design/` or the code region writes the export after the commit is
 * made. A failed export does not undo the commit, and says so on a line of
 * its own and a status of its own. Staged with the export replaced by a
 * command that records it ran (`COMMIT_EXPORT`), so nothing reaches
 * ~/Downloads. Each fails against a script that never exports.
 */
describe('the export follows a commit that touches the shared documents', () => {
  const runExport = (dir: string, exportCommand: string, args: string[]) => {
    try {
      const output = execFileSync('bash', [join(dir, 'commit-checked.sh'), ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, COMMIT_CHECK: 'echo "1 passed"', COMMIT_EXPORT: exportCommand } });
      return { status: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  };
  /* The export records the commit it saw, so the test can tell an export after the commit from one before it. */
  const recorder = (dir: string) => `git -C '${dir}' rev-parse HEAD > '${join(dir, 'exported-at')}'`;

  for (const path of ['docs/design/HANDOFF-wall-and-pull.md', 'scripts/handoff-code-region.json']) {
    it(`exports after a commit that touches ${path}, at the commit just made`, () => {
      const { dir, git } = repo();
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), 'changed\n');
      const result = runExport(dir, recorder(dir), ['-m', 'docs', path]);
      expect(result.status, result.output).toBe(0);
      expect(readFileSync(join(dir, 'exported-at'), 'utf8').trim(), 'the export ran after the commit').toBe(git('rev-parse', 'HEAD'));
    });
  }

  /*
    Found staging the guard below: `grep -q` leaves at its first match, and
    under the script's pipefail a list of changed paths longer than the
    pipe's buffer ends the writer on SIGPIPE, failing the condition. Such a
    commit skipped its export silently. Fails against the piped test.
  */
  it('exports after a commit whose changed paths overrun a pipe, the shared document listed first', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'design', 'a.md'), 'a\n');
    const many = join(dir, 'z');
    mkdirSync(many);
    for (let i = 0; i < 1500; i += 1) writeFileSync(join(many, `a-long-enough-file-name-to-fill-the-pipe-${String(i).padStart(4, '0')}.txt`), `${i}\n`);
    const result = runExport(dir, recorder(dir), ['-m', 'many', 'docs/design/a.md', 'z']);
    expect(result.status, result.output).toBe(0);
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').length, 'more than a pipe holds').toBeGreaterThan(65_536);
    expect(existsSync(join(dir, 'exported-at')), 'the export ran').toBe(true);
  }, 60_000);

  it('does not export after a commit that touches neither', () => {
    const { dir } = repo();
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'other.md'), 'other\n');
    const result = runExport(dir, recorder(dir), ['-m', 'other', 'docs/other.md']);
    expect(result.status, result.output).toBe(0);
    expect(existsSync(join(dir, 'exported-at'))).toBe(false);
  });

  it('keeps the commit when the export fails, and says so with a status of its own', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'design', 'x.md'), 'x\n');
    const before = git('rev-parse', 'HEAD');
    const result = runExport(dir, 'echo "export-handoff: NOT exported." >&2; exit 1', ['-m', 'docs', 'docs/design/x.md']);
    expect(git('rev-parse', 'HEAD'), 'the commit stands').not.toBe(before);
    expect(result.status, 'neither a pass nor the refusal status').toBe(3);
    expect(result.output).toMatch(/COMMITTED, but the export was NOT written/);
  });
});

/*
  **A refusal stands until it is read (the coordinator, 4 Nov).** A chain of
  commits piped each refusal through `tail`, so a refused commit was followed
  by a successful one that carried the first's NOTES entry, out of order. The
  script now leaves a marker on refusal, and the next commit refuses on the
  marker alone, naming the log, until `--read` clears it; a passing commit
  clears it too, since nothing passes without the check. Each fails against a
  script that forgets a refusal the moment it prints it.
*/
describe('a refusal stands until it is read', () => {
  it('refuses the next commit after a refused one, naming the unread log, until --read', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    const refused = run(dir, 'echo "1 failed"; exit 1', ['-m', 'first', 'a.txt']);
    expect(refused.status).not.toBe(0);
    const before = git('rev-parse', 'HEAD');
    const next = run(dir, 'echo "1 passed"', ['-m', 'second', 'a.txt']);
    expect(next.status, next.output).toBe(5);
    expect(next.output).toMatch(/NOT COMMITTED: the refusal at .* is unread/);
    expect(git('rev-parse', 'HEAD'), 'nothing was committed over an unread refusal').toBe(before);
    const read = run(dir, 'echo "1 passed"', ['--read']);
    expect(read.status, read.output).toBe(0);
    expect(read.output).toMatch(/1 failed/);
    const after = run(dir, 'echo "1 passed"', ['-m', 'second', 'a.txt']);
    expect(after.status, after.output).toBe(0);
  });

  it('a passing commit leaves no marker, so the one after it is not refused', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    expect(run(dir, 'echo "1 passed"', ['-m', 'first', 'a.txt']).status).toBe(0);
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    expect(run(dir, 'echo "1 passed"', ['-m', 'second', 'b.txt']).status).toBe(0);
  });
});

/*
  **A commit carries what it names (the coordinator, 4 Nov).** The check reads
  the working tree and the commit carries the named paths, so twice in one
  day CI failed a commit whose check had passed: a governed list naming spec
  files still untracked, and a migration journal naming a migration still
  untracked. After staging, every path-like token in a staged text file that
  names a file the tree holds untracked, and the journal's tags as
  `drizzle/<tag>.sql`, refuses the commit. Each fails against a script that
  commits the list without the files.
*/
describe('a commit carries the files it names', () => {
  it('refuses a staged file that names an untracked file the tree holds, and says which', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'list.ts'), "export const GOVERNED = ['e2e/arrow-167.spec.ts'];\n");
    mkdirSync(join(dir, 'e2e'));
    writeFileSync(join(dir, 'e2e', 'arrow-167.spec.ts'), 'spec\n');
    const before = git('rev-parse', 'HEAD');
    const result = run(dir, 'echo "1 passed"', ['-m', 'list', 'list.ts']);
    expect(result.status, result.output).toBe(6);
    expect(result.output).toMatch(/names e2e\/arrow-167\.spec\.ts, which the tree holds untracked/);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    expect(git('diff', '--cached', '--name-only'), 'nothing left staged').toBe('');
  });

  /*
    Q49 (7 Nov): a token beginning with `-` reached `basename` as an option, printed "illegal option" and was
    skipped, since `find -name ""` matches nothing: a bypass of the guard above, seen in ship output three times
    unread. Fails against the script without `--` before the path.
  */
  it('refuses a staged file naming an untracked file whose name begins with a dash, and prints no option error', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'list.ts'), "export const GOVERNED = ['-draft.ts'];\n");
    writeFileSync(join(dir, '-draft.ts'), 'draft\n');
    const before = git('rev-parse', 'HEAD');
    /* Both streams whatever the status: `run` keeps stderr only on a failure, and the option error is on stderr of a run that committed, so through `run` this assertion could not fail. */
    const r = spawnSync('bash', [join(dir, 'commit-checked.sh'), '-m', 'list', 'list.ts'], { cwd: dir, encoding: 'utf8', env: { ...process.env, COMMIT_CHECK: 'echo "1 passed"' } });
    const result = { status: r.status ?? 1, output: `${r.stdout}${r.stderr}` };
    expect(result.output).not.toMatch(/illegal option|usage: basename/);
    expect(result.status, result.output).toBe(6);
    expect(result.output).toMatch(/names -draft\.ts, which the tree holds untracked/);
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('refuses a journal whose tag names a migration file still untracked', () => {
    const { dir } = repo();
    mkdirSync(join(dir, 'drizzle', 'meta'), { recursive: true });
    writeFileSync(join(dir, 'drizzle', 'meta', '_journal.json'), '{"entries":[{"idx":0,"tag":"0000_first","breakpoints":true}]}\n');
    writeFileSync(join(dir, 'drizzle', '0000_first.sql'), 'CREATE TABLE t (id int);\n');
    const result = run(dir, 'echo "1 passed"', ['-m', 'journal', 'drizzle/meta/_journal.json']);
    expect(result.status, result.output).toBe(6);
    expect(result.output).toMatch(/drizzle\/0000_first\.sql/);
  });

  it('commits when the named file is ignored: held by the tree on purpose, not left out by omission', () => {
    const { dir } = repo();
    writeFileSync(join(dir, '.gitignore'), 'ignored/\n');
    mkdirSync(join(dir, 'ignored'));
    writeFileSync(join(dir, 'ignored', 'x.ts'), 'x\n');
    writeFileSync(join(dir, 'notes.md'), 'see ignored/x.ts\n');
    const result = run(dir, 'echo "1 passed"', ['-m', 'notes', 'notes.md', '.gitignore']);
    expect(result.status, result.output).toBe(0);
  });

  it('does not read a name that matches a tracked file only by case as an untracked one', () => {
    /* On a case-insensitive filesystem `-f FIRST.txt` is true of first.txt, which git tracks under its own case; found when a test fixture named notes.md and the repo's NOTES.md answered. */
    const { dir } = repo();
    writeFileSync(join(dir, 'notes.md'), 'see FIRST.txt\n');
    const result = run(dir, 'echo "1 passed"', ['-m', 'case', 'notes.md']);
    expect(result.status, result.output).toBe(0);
  });

  it('commits when every named file is tracked or named alongside', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'list.ts'), "export const GOVERNED = ['e2e/arrow-167.spec.ts', 'first.txt'];\n");
    mkdirSync(join(dir, 'e2e'));
    writeFileSync(join(dir, 'e2e', 'arrow-167.spec.ts'), 'spec\n');
    const result = run(dir, 'echo "1 passed"', ['-m', 'list and spec', 'list.ts', 'e2e/arrow-167.spec.ts']);
    expect(result.status, result.output).toBe(0);
  });
});

/*
  **A step's captures follow the commit that names them (the coordinator, 4 Nov).**
  Captures are untracked, so they cannot ride a commit, and three times a step's
  look was held because Adam had to find PNGs by hand. After the commit, the
  folders the message names as `docs/captures/<name>` are exported from the
  working tree by `scripts/export-captures.mjs`, under the same ~/Downloads
  naming as the documents. Staged with the export replaced by a recorder
  (`COMMIT_EXPORT_CAPTURES`), which writes the commit it saw and the names it
  was given. Each fails against a script that exports no captures.
*/
describe('the captures a commit message names are exported after the commit', () => {
  const runCaptures = (dir: string, exportCommand: string, args: string[]) => {
    try {
      const output = execFileSync('bash', [join(dir, 'commit-checked.sh'), ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, COMMIT_CHECK: 'echo "1 passed"', COMMIT_EXPORT: 'true', COMMIT_EXPORT_CAPTURES: exportCommand } });
      return { status: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  };
  /* A script that records the commit it ran at and the folder names it was handed, one line each; a file, so the names reach it as arguments and not through a quoted string. */
  const recorder = (dir: string) => {
    const script = join(dir, 'recorder.sh');
    writeFileSync(script, `#!/bin/bash\n{ git -C '${dir}' rev-parse HEAD; printf '%s\\n' "$@"; } > '${join(dir, 'captures-exported')}'\n`);
    return `bash '${script}'`;
  };

  it('exports every folder the message names, once each, after the commit', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    const result = runCaptures(dir, recorder(dir), ['-m', 'Step 166. Captures in docs/captures/years-166 and docs/captures/arrow-167; docs/captures/years-166 again.', 'a.txt']);
    expect(result.status, result.output).toBe(0);
    const lines = readFileSync(join(dir, 'captures-exported'), 'utf8').trim().split('\n');
    expect(lines[0], 'the export ran after the commit').toBe(git('rev-parse', 'HEAD'));
    expect(lines.slice(1)).toEqual(['years-166', 'arrow-167']);
  });

  it('exports nothing after a commit whose message names no captures folder', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    const result = runCaptures(dir, recorder(dir), ['-m', 'NOTES: a read of a run', 'a.txt']);
    expect(result.status, result.output).toBe(0);
    expect(existsSync(join(dir, 'captures-exported'))).toBe(false);
  });

  it('keeps the commit when the captures export fails, and says so with the export status', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    const before = git('rev-parse', 'HEAD');
    const result = runCaptures(dir, 'echo "export-captures: NOT exported." >&2; exit 1', ['-m', 'Captures in docs/captures/x', 'a.txt']);
    expect(git('rev-parse', 'HEAD'), 'the commit stands').not.toBe(before);
    expect(result.status).toBe(3);
    expect(result.output).toMatch(/COMMITTED, but the captures were NOT exported/);
  });
});

/*
  The fourth shape (the coordinator, 6 Nov): a check that passed, then `git add` refusing an ignored path, which
  left the other named paths staged and the next commit refusing on the index. Two guards: an unaddable path,
  ignored or absent, is refused before the check runs, naming it; and any failure after the check resets the
  index to HEAD, so nothing stays staged behind a refusal.
*/
describe('a path the commit could not carry is refused before the check, and a failure after the check leaves nothing staged', () => {
  it('refuses an ignored named path before the check, running nothing, and names it', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, '.gitignore'), 'secret.txt\n');
    git('add', '.gitignore');
    git('commit', '-q', '-m', 'ignore');
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'secret.txt'), 'x\n');
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, 'touch ran.marker; echo "1 passed"', ['-m', 'both', 'second.txt', 'secret.txt']);
    expect(result.status, 'refused').not.toBe(0);
    expect(result.output).toMatch(/secret\.txt.*ignored|ignored.*secret\.txt/);
    expect(existsSync(join(dir, 'ran.marker')), 'the check never ran').toBe(false);
    expect(git('diff', '--cached', '--name-only'), 'nothing staged').toBe('');
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('refuses an absent named path before the check, running nothing, and names it', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, 'touch ran.marker; echo "1 passed"', ['-m', 'both', 'second.txt', 'missing.txt']);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/missing\.txt/);
    expect(existsSync(join(dir, 'ran.marker'))).toBe(false);
    expect(git('diff', '--cached', '--name-only')).toBe('');
  });

  it('resets the index when the commit itself fails after a passing check, so the next commit does not refuse on it', () => {
    const { dir, git } = repo();
    const before = git('rev-parse', 'HEAD');
    /* A pre-commit hook that refuses stands in for whatever fails between the check and the commit. */
    mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(dir, '.git', 'hooks', 'pre-commit'), 0o755);
    writeFileSync(join(dir, 'second.txt'), 'second\n');
    const result = run(dir, 'echo "1 passed"', ['-m', 'second', 'second.txt']);
    expect(result.status).not.toBe(0);
    expect(git('rev-parse', 'HEAD'), 'no commit').toBe(before);
    expect(git('diff', '--cached', '--name-only'), 'and nothing left staged').toBe('');
    expect(result.output).toMatch(/NOT COMMITTED.*(unstaged|reset|nothing (is|was) left staged)/i);
  });
});
