import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRules, renderIndex, SHAPES } from '../../scripts/notes-index';

/**
 * The apparatus index is generated, and this is what stops it going stale.
 *
 * **A hand-written index of a 29,000-line file is stale within a week and then
 * actively misleading** — worse than none, because a reader trusts it. So the
 * index is derived from the entries' own declarations and this test fails when
 * the committed block does not match what the generator produces.
 *
 * The index exists because NOTES' apparatus rules are each titled as their own
 * CONCLUSION, which makes them findable only by someone who already knows them
 * — backwards for a document whose value is recognising a shape before paying
 * for it again. A classifier written against the titles could not find them,
 * which is the test of findability failing.
 */

const NOTES = readFileSync('NOTES.md', 'utf8');

describe('the apparatus index is generated, not maintained', () => {
  /**
   * **The load-bearing assertion.** Editing NOTES without regenerating leaves a
   * table that describes a document that no longer exists.
   */
  it('matches what the generator produces from the entries', () => {
    const start = NOTES.indexOf('<!-- APPARATUS-INDEX:START');
    const end = NOTES.indexOf('<!-- APPARATUS-INDEX:END -->');

    expect(start, 'the index block is present').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const committed = NOTES.slice(start, end + '<!-- APPARATUS-INDEX:END -->'.length);
    const generated = renderIndex(readRules(NOTES));

    expect(
      committed,
      'run `npx tsx scripts/notes-index.ts` and paste the result',
    ).toBe(generated);
  });

  /**
   * **The rule cannot pass for want of a subject** — an index of nothing
   * satisfies every assertion about its contents, which is the shape the index
   * itself catalogues.
   */
  it('indexes rules rather than being empty', () => {
    const rules = readRules(NOTES);

    expect(rules.length, 'there are declared rules to index').toBeGreaterThan(5);
  });

  it('keys every entry by a circumstance rather than by the rule’s name', () => {
    for (const rule of readRules(NOTES)) {
      /*
        The circumstance has to be a situation a reader can recognise, so it
        must not simply restate the title — which is the failure the index
        exists to fix.
      */
      expect(rule.circumstance.length, `${rule.title}`).toBeGreaterThan(20);
      expect(
        rule.circumstance.toLowerCase(),
        `${rule.title}: the circumstance restates the title`,
      ).not.toBe(rule.title.toLowerCase());
    }
  });

  it('gives every rule a shape the index knows', () => {
    for (const rule of readRules(NOTES)) {
      expect(SHAPES, `${rule.title}`).toContain(rule.shape);
    }
  });

  /**
   * **The rules keep their evidence.** Compressing each to a line is the likely
   * failure mode of any tidy-up, and a rule without the instance that produced
   * it is a rule the next reader argues with. The index POINTS at entries; it
   * does not replace them.
   */
  it('points at entries that still carry their evidence', () => {
    for (const rule of readRules(NOTES)) {
      expect(
        rule.lines,
        `${rule.title} is ${rule.lines} lines — a rule compressed to its conclusion`,
      ).toBeGreaterThan(12);
    }
  });
});

/**
 * **A documented flag that no code implements is the same shape as a test that
 * cannot fail.** The index the generator prints ends with "Regenerate with
 * `npx tsx scripts/notes-index.ts --write`", and for as long as that line has
 * existed the CLI has printed to stdout and ignored its arguments; the block
 * was spliced by hand (29 Sep). These run the CLI as a process, on a copy,
 * because the claim is about the command and not about a function.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STALE = [
  '# Notes',
  '',
  '<!-- APPARATUS-INDEX:START -->',
  'stale',
  '<!-- APPARATUS-INDEX:END -->',
  '',
  '## A RULE WITH A HOME',
  '',
  '**Shape:** check-cannot-fail',
  '**You are here if:** a test passes and you cannot say which input it would reject',
  '',
  'Body.',
  '',
].join('\n');

const run = (...args: string[]) => spawnSync('npx', ['tsx', 'scripts/notes-index.ts', ...args], { encoding: 'utf8' });

describe('the CLI’s --write flag', () => {
  it('without --write prints the index and leaves the file alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-index-'));
    const path = join(dir, 'NOTES.md');
    writeFileSync(path, STALE);
    const result = run(path);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout, 'the index of the file NAMED, not of NOTES.md').toContain('A RULE WITH A HOME');
    expect(readFileSync(path, 'utf8'), 'unchanged').toBe(STALE);
  });

  it('with --write splices the generated block between the markers of the file it names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-index-'));
    const path = join(dir, 'NOTES.md');
    writeFileSync(path, STALE);
    const result = run('--write', path);
    expect(result.status, result.stderr).toBe(0);
    const after = readFileSync(path, 'utf8');
    const start = after.indexOf('<!-- APPARATUS-INDEX:START');
    const end = after.indexOf('<!-- APPARATUS-INDEX:END -->') + '<!-- APPARATUS-INDEX:END -->'.length;
    expect(after.slice(start, end), 'the block is the generator’s').toBe(renderIndex(readRules(after)));
    expect(after, 'nothing outside the block changed').toContain('## A RULE WITH A HOME');
    expect(after).not.toContain('\nstale\n');
    expect(result.stdout).toMatch(/1 rules? indexed/);
  });
});
