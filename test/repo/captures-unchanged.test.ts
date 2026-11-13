import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { rewrittenCaptures } from '../../scripts/captures-rewritten.mjs';
import { underLoad } from '../helpers/spawn-budget';

vi.setConfig({ testTimeout: underLoad(222) });

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
 * Committed files only. A new capture beside the old ones is how a step adds
 * evidence, so a file added since HEAD, untracked or intent-added, is allowed;
 * a committed file that differs from HEAD, staged or not, or has been
 * deleted, fails here by name (scripts/captures-rewritten.mjs).
 */
describe('committed captures are unchanged', () => {
  it('no tracked file under docs/captures differs from HEAD', () => {
    const changed = rewrittenCaptures(REPO_ROOT);
    expect(changed, `committed captures were rewritten or removed:\n  ${changed.join('\n  ')}`).toEqual([]);
  });
});

/**
 * **A capture added since HEAD is not a rewritten one (the coordinator, 8 Nov).** This narrows the assertion back to
 * the defect it was written for, a run overwriting committed captures, and is not a weakening: modified, deleted and
 * retyped committed captures still fail. What it stops counting is a file ADDED since HEAD, which is how a step adds
 * evidence. Since 27 Oct commit-checked.sh intent-adds every untracked path a commit names for its check, and an
 * intent-added capture showed in `git diff HEAD` as changed, so a commit naming a new capture was refused. On 4 Nov
 * that collision was written down as "captures are untracked, so they cannot ride a commit" and held twelve days as
 * if someone had chosen it. Staged in a throwaway repository, each case as the commit path leaves it.
 */
describe('rewrittenCaptures: what counts as a rewritten capture', () => {
  const staged = () => {
    const dir = mkdtempSync(join(tmpdir(), 'captures-rewritten-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' }).trim();
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(dir, 'docs', 'captures', 'step'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'captures', 'step', 'kept.png'), 'kept');
    git('add', '.');
    git('commit', '-q', '-m', 'a committed capture');
    return { dir, git, done: () => rmSync(dir, { recursive: true, force: true }) };
  };

  it('does not count a new capture intent-added for a commit check', () => {
    const { dir, git, done } = staged();
    writeFileSync(join(dir, 'docs', 'captures', 'step', 'new.png'), 'new');
    git('add', '--intent-to-add', '--', 'docs/captures/step/new.png');
    expect(git('diff', '--name-only', 'HEAD', '--', 'docs/captures'), 'the precondition: git diff HEAD lists the intent-added capture').toBe('docs/captures/step/new.png');
    expect(rewrittenCaptures(dir)).toEqual([]);
    done();
  });

  it('counts a committed capture modified, staged or not, or deleted', () => {
    const { dir, git, done } = staged();
    writeFileSync(join(dir, 'docs', 'captures', 'step', 'kept.png'), 'a later build');
    expect(rewrittenCaptures(dir)).toEqual(['docs/captures/step/kept.png']);
    git('add', '--', 'docs/captures/step/kept.png');
    expect(rewrittenCaptures(dir), 'staged').toEqual(['docs/captures/step/kept.png']);
    git('rm', '-q', '--cached', '--', 'docs/captures/step/kept.png');
    rmSync(join(dir, 'docs', 'captures', 'step', 'kept.png'));
    expect(rewrittenCaptures(dir), 'deleted').toEqual(['docs/captures/step/kept.png']);
    done();
  });
});

/**
 * **Every spec screenshot into docs/captures waits for the switch (26 Oct).**
 * The test above sees tracked files only, so a spec writing NEW captures on
 * every run passed it: `pick-answer-156` wrote eight on the gate for
 * 1ca3918, whose ledger read the tree as changed and the run as no result.
 * Read from the specs' text: a `screenshot` call whose path is under
 * docs/captures, on a line that does not test `WRITE_CAPTURES`. Capture
 * tools (`e2e/capture`, `e2e/sheet`) write by design and are not specs.
 */
describe('specs write captures only when asked', () => {
  it('no spec screenshots into docs/captures without WRITE_CAPTURES', () => {
    const dir = join(REPO_ROOT, 'e2e');
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.spec.ts'))
      .flatMap((file) =>
        readFileSync(join(dir, file), 'utf-8')
          .split('\n')
          .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
          .filter(({ line }) => /screenshot\(\{[^}]*path:\s*[`'"]docs\/captures/.test(line) && !line.includes('WRITE_CAPTURES'))
          .map(({ at }) => at),
      );
    expect(offenders, `specs writing captures on every run:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
