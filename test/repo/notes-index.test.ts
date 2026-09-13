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
