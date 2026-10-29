import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRegion, intake, judgeIndex, judgeSuite, readRegion, regionHistory } from '../../scripts/apply-code-region.mjs';
import { DOCUMENT_SUITE } from '../../scripts/document-suite.mjs';

/**
 * **A Design export cannot remove what Code wrote into the handoff (8 Oct).**
 *
 * Design's exports replace `HANDOFF-wall-and-pull.md` wholesale from a
 * source that has never held Code's own lines. Step 71 was restored by
 * hand twenty-eight times, and it was the one line anybody noticed: two
 * sets of maintaining rules written at `87d0e87` and `bae5797` were
 * removed by the next drop and stood nowhere afterwards.
 *
 * So Code's lines live in `scripts/handoff-code-region.json`, which no
 * export touches, and the handoff in the tree is the export with those
 * blocks applied. The last test here is the guard: it reads the tree, and
 * a drop taken without applying the region fails the unit suite.
 */
const HANDOFF = join('docs', 'design', 'HANDOFF-wall-and-pull.md');
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const block = { id: 'step-71', before: '72. ', text: '71. **Done.** The tile’s Delete control.' };
const exported = '70. Build the disc.\n\n72. Build the nav.\n\n## Maintaining this file\n';

describe('applyRegion', () => {
  /* Fails against an apply that appends: the step would land after the build order. */
  it('puts a block the export dropped back in front of its anchor, as a paragraph of its own', () => {
    const result = applyRegion(exported, [block]);
    expect(result.text).toBe('70. Build the disc.\n\n71. **Done.** The tile’s Delete control.\n\n72. Build the nav.\n\n## Maintaining this file\n');
    expect(result).toMatchObject({ restored: ['step-71'], present: [], unanchored: [] });
  });

  /* Fails against an apply that inserts without looking: a second run would write the step twice. */
  it('leaves a handoff that already carries the block exactly as it is', () => {
    const once = applyRegion(exported, [block]).text;
    const twice = applyRegion(once, [block]);
    expect(twice.text).toBe(once);
    expect(twice).toMatchObject({ restored: [], present: ['step-71'], unanchored: [] });
  });

  /* Fails against a match on a prefix: an edited step 71 from Design would count as Code's own. */
  it('counts a block present only when its whole line stands', () => {
    const edited = exported.replace('72. ', '71. **Done.** The tile’s Delete control. And more.\n\n72. ');
    expect(applyRegion(edited, [block]).present).toEqual([]);
  });

  /* Fails against an apply that drops a block it cannot place: the loss this exists to stop, made silent again. */
  it('reports a block whose anchor is gone, and does not write it anywhere', () => {
    const result = applyRegion('70. Build the disc.\n', [block]);
    expect(result.unanchored).toEqual(['step-71']);
    expect(result.text).toBe('70. Build the disc.\n');
  });

  it('anchors on a line’s start, not on text inside one', () => {
    const result = applyRegion('70. See step 72. It follows.\n\n72. Build the nav.\n', [block]);
    expect(result.text.indexOf('71. ')).toBeGreaterThan(result.text.indexOf('70. '));
    expect(result.text.indexOf('71. ')).toBeLessThan(result.text.indexOf('\n72. '));
  });

  /*
    **A restated block replaces its old line (29 Oct).** Step 160's block was
    restated, and the intake inserted the new text beside the old, because
    "present" is the whole line and the old line is not the new one. The
    index's duplicate-number check caught it, after the handoff was written.
    A line is replaced only when it is a text the same block has had before,
    so a Design line that happens to share a number is never overwritten.
    Fails against an apply that ignores the earlier texts: both lines stand.
  */
  it('replaces, in place, a line that is an earlier text of the same block', () => {
    const old = '71. **Done.** The tile’s first control.';
    const handoff = `70. Build the disc.\n\n${old}\n\n72. Build the nav.\n`;
    const result = applyRegion(handoff, [block], new Map([['step-71', new Set([old])]]));
    expect(result.text).toBe('70. Build the disc.\n\n71. **Done.** The tile’s Delete control.\n\n72. Build the nav.\n');
    expect(result).toMatchObject({ restored: [], replaced: ['step-71'], present: [], unanchored: [] });
  });

  /* Fails against a replacement that matches any block's history: step 72's old text is not step 71's to take. */
  it('does not replace an earlier text of a different block', () => {
    const other = '72. **Done.** An older nav.';
    const handoff = `70. Build the disc.\n\n${other}\n\n72. Build the nav.\n`;
    const result = applyRegion(handoff, [block], new Map([['step-72', new Set([other])]]));
    expect(result.text).toContain(other);
    expect(result).toMatchObject({ restored: ['step-71'], replaced: [] });
  });
});

/*
  The earlier texts come from the region's committed history, so a block's
  old line is recognised by what Code actually committed, not by its number.
  Staged in a throwaway repository with the region committed twice. Fails
  against a history that reads only HEAD, which holds the new text alone.
*/
describe('regionHistory', () => {
  it('collects every text each block has had in the commits that changed the region', () => {
    const dir = mkdtempSync(join(tmpdir(), 'region-history-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(dir, 'scripts'));
    const commit = (text: string) => {
      writeFileSync(join(dir, 'scripts', 'handoff-code-region.json'), JSON.stringify([{ id: 'step-160', before: 'No step', text }]));
      git('add', '.');
      git('commit', '-q', '-m', text);
    };
    commit('160. **Done: built.** First.');
    commit('160. **Done: narrowed.** Second.');
    const history = regionHistory((...args: string[]) => git(...args));
    expect([...(history.get('step-160') ?? [])].sort()).toEqual(['160. **Done: built.** First.', '160. **Done: narrowed.** Second.']);
  });
});

describe('Code’s region of the handoff', () => {
  type Block = { id: string; before: string; text: string };
  const region = readRegion() as Block[];

  it('holds step 71, anchored in front of step 72', () => {
    const step = region.find((entry) => entry.id === 'step-71');
    expect(step?.before).toBe('72. ');
    expect(step?.text).toMatch(/^71\. /);
  });

  /*
    The backstop to replacement: a block restated twice between commits has
    an old line no committed text matches, and is inserted beside it. Every
    block being a step numbered as its id is what makes the index's
    duplicate-number check (assertion 3) see that, rather than leave two
    paragraphs of one block standing. Fails against a block that is not a
    numbered step, or whose number is not its id's.
  */
  it('is every block a step numbered as its id, so a duplicate is a duplicate number', () => {
    const off = region.filter((entry) => !new RegExp(`^${entry.id.replace(/^step-/, '')}\\. `).test(entry.text) || !/^step-\d+$/.test(entry.id));
    expect(off.map((entry) => entry.id)).toEqual([]);
  });

  /* The guard. Fails on a tree whose handoff is a raw export: run `node scripts/apply-code-region.mjs`. */
  it('stands whole in the handoff in the tree', () => {
    const result = applyRegion(readFileSync(HANDOFF, 'utf8'), region);
    expect(region.length).toBeGreaterThan(0);
    expect({ restored: result.restored, unanchored: result.unanchored }, 'blocks missing from the handoff').toEqual({ restored: [], unanchored: [] });
  });
});

/**
 * **The intake runs the document tests, and fails on them (19 Oct).**
 *
 * Design's save 6077355 reworded a sentence that nine tests in
 * `index-inputs.test.ts` staged over. Its intake ran `check-index.mjs`,
 * which passed, and not `test/repo`, which would have failed, and main sat
 * red for two days until a gate read it. The applier is a no-op on a
 * handoff that already carries Code's blocks, so it can run on every
 * intake, and it is now the one intake command: blocks, then the index,
 * then the document suite. Each is judged on three signals, never one: the
 * exit code, a count above zero, and nothing failed. Either alone has let
 * a run through (a judge reading its own "0 passed"; a path that collects
 * nothing and exits 0).
 */
describe('the intake runs the index and the document suite, and fails on either', () => {
  const INDEX_GREEN = 'PASS 12\nRESULT: 13 PASS, 0 FAIL, 0 ABSENT of 13\n';

  /* Fails against a judge of the exit code alone, and of the line alone. */
  it('passes the index only on exit 0 with every assertion passing and none absent', () => {
    expect(judgeIndex({ code: 0, output: INDEX_GREEN }).ok).toBe(true);
    expect(judgeIndex({ code: 1, output: 'FAIL 12\nRESULT: 12 PASS, 1 FAIL, 0 ABSENT of 13\n' }).ok, 'a failed assertion').toBe(false);
    expect(judgeIndex({ code: 2, output: 'RUN STOPPED: x\nRESULT: 3 PASS, 0 FAIL, 10 ABSENT of 13 -- INCOMPLETE\n' }).ok, 'a stopped run').toBe(false);
    expect(judgeIndex({ code: 0, output: '' }).ok, 'no RESULT line, exit 0').toBe(false);
    expect(judgeIndex({ code: 1, output: INDEX_GREEN }).ok, 'a clean line, a non-zero exit').toBe(false);
    expect(judgeIndex({ code: 0, output: 'RESULT: 0 PASS, 0 FAIL, 0 ABSENT of 0\n' }).ok, 'nothing checked').toBe(false);
  });

  /* Fails against a judge that trusts any one of the three signals. */
  it('passes the suite only on exit 0, a passed count above zero and nothing failed', () => {
    expect(judgeSuite({ code: 0, output: '      Tests  518 passed (518)\n' }).ok).toBe(true);
    expect(judgeSuite({ code: 1, output: '      Tests  9 failed | 509 passed (518)\n' }).ok, 'failures').toBe(false);
    expect(judgeSuite({ code: 1, output: '      Tests  518 passed (518)\n' }).ok, 'a clean count, a non-zero exit').toBe(false);
    expect(judgeSuite({ code: 0, output: '      Tests  0 passed (0)\n' }).ok, 'a zero count').toBe(false);
    expect(judgeSuite({ code: 0, output: 'include: test/**/*.test.ts\n' }).ok, 'no count, exit 0').toBe(false);
  });

  /*
    What reads Design's files decides what the intake runs, not the folder
    a test lives in: `src/app/wall/unit.test.ts` reads the wall target
    beside test/repo. Fails against a suite of test/repo alone, and against
    the next test outside it that starts reading docs/design.
  */
  it('runs every unit test file that reads docs/design', () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
    const readers = ['src', 'test'].flatMap(walk).filter((file) => {
      const code = readFileSync(join(REPO_ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      return /docs\/design|'docs', 'design'|\.dc\.html|HANDOFF-wall-and-pull|WITHDRAWALS\.md/.test(code);
    });
    expect(readers.length, 'the scan finds the readers it is for').toBeGreaterThan(5);
    const outside = readers.filter((file) => !DOCUMENT_SUITE.some((entry: string) => file === entry || file.startsWith(`${entry}/`)));
    expect(outside, 'tests that read Design’s files and that the intake does not run').toEqual([]);
  });

  /* Fails against an intake that stops at the index, which is Sunday's. */
  it('fails the intake on a failing document suite when the index passes, and prints both lines', () => {
    const run = (command: string) =>
      command === 'node' ? { code: 0, output: INDEX_GREEN } : { code: 1, output: '      Tests  9 failed | 509 passed (518)\n' };
    const result = intake(run);
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toMatch(/^index: 13 PASS, 0 FAIL, 0 ABSENT of 13 — OK$/);
    expect(result.lines[1]).toMatch(/^test\/repo src\/app\/wall\/unit\.test\.ts: 509 passed, 9 failed — NOT OK — 9 failed$/);
  });

  /*
    The command itself, on real vitest output: a mistyped suite path, and
    the same path with --passWithNoTests, which exits 0 with no count. Both
    must fail the intake. INTAKE_SUITE exists for these two runs only; the
    intake proper runs test/repo, which a test inside test/repo cannot.
  */
  const cli = (suite: string) =>
    spawnSync('node', ['scripts/apply-code-region.mjs'], { cwd: REPO_ROOT, encoding: 'utf-8', env: { ...process.env, INTAKE_SUITE: suite } });

  it('fails the intake on a suite path that collects nothing, with or without --passWithNoTests', () => {
    for (const suite of ['test/repoo', 'test/repoo --passWithNoTests']) {
      const r = cli(suite);
      expect(r.status, `${suite}: ${r.stdout}${r.stderr}`).toBe(1);
      expect(r.stdout).toMatch(/^code region: 0 restored/m);
      expect(r.stdout).toMatch(/^index: 13 PASS, 0 FAIL, 0 ABSENT of 13 — OK$/m);
      expect(r.stdout).toMatch(new RegExp(`^${suite.replace(/[-/]/g, '\\$&')}: .* — NOT OK — no summary line found`, 'm'));
      expect(r.stdout).toMatch(/^INTAKE NOT OK/m);
    }
  }, 120_000);

  it('passes the intake on a suite that runs and passes', () => {
    const r = cli('test/repo/run-result.test.ts');
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/^test\/repo\/run-result\.test\.ts: \d+ passed — OK$/m);
    expect(r.stdout).toMatch(/^INTAKE OK/m);
    expect(r.stderr, 'no module-type warning on every intake').not.toMatch(/MODULE_TYPELESS_PACKAGE_JSON/);
  }, 120_000);
});
