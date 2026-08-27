import { describe, expect, it } from 'vitest';
import { groupProposal, evidenceLine } from './parent-proposal';

/**
 * SPEC.md §12c (A44) — how a proposed hierarchy reads.
 *
 * **Measured before the layout was settled**: 32 unparented genres produce ~9
 * parents with 22 children, averaging 2-3 each — about 31 lines, one screen.
 * **So the screen is not a 32-row list, it is nine groups**, and that is what
 * makes it scannable rather than a grind. Doing this by hand in `/manage` today
 * means picking from a dropdown 32 times with no view of the shape, which is the
 * friction this feature exists to remove — a design that reproduced it in a new
 * form would have failed regardless of correctness.
 */

const PAIRINGS = [
  { genreId: 'g1', genre: 'Psychedelic Rock', parentId: 'p1', parent: 'Rock' },
  { genreId: 'g2', genre: 'AOR', parentId: 'p1', parent: 'Rock' },
  { genreId: 'g3', genre: 'Fusion', parentId: 'p2', parent: 'Jazz' },
];

const EVIDENCE = {
  'Psychedelic Rock': { recordCount: 3, examples: ['The Doors — The Soft Parade'] },
  AOR: { recordCount: 1, examples: ['Dire Straits — Dire Straits'] },
  Fusion: { recordCount: 3, examples: ['Miles Davis — Bitches Brew'] },
};

describe('the proposal groups by parent', () => {
  /**
   * **Nine headings, not 32 rows.** `Rock` with seven children is ONE judgement
   * — "is Rock the right bucket for these?" — rather than seven, which is why
   * grouping does the work that made hand-assignment unbearable.
   */
  it('collects children under their proposed parent', () => {
    const groups = groupProposal(PAIRINGS, [], EVIDENCE);

    expect(groups.map((g) => g.parent)).toEqual(['Rock', 'Jazz']);
    expect(groups[0]?.children.map((c) => c.genre)).toEqual(['Psychedelic Rock', 'AOR']);
  });

  /**
   * **A parent with nothing proposed under it is SHOWN, and says why** (Adam).
   * `Punk` sitting empty is the whole reason this feature exists — after the
   * tree lands it should either have children or be a genre he decides to
   * delete, **not a blank heading whose meaning he has to reconstruct.**
   *
   * Fails against a grouping that drops childless parents, and against one that
   * shows them without saying what the emptiness means.
   */
  it('shows a parent with no children proposed, and marks it as such', () => {
    const groups = groupProposal(PAIRINGS, ['Punk'], EVIDENCE);

    const punk = groups.find((g) => g.parent === 'Punk');
    expect(punk, 'a parent with no proposal must not vanish').toBeDefined();
    expect(punk?.children).toEqual([]);
    expect(punk?.noChildrenProposed).toBe(true);
  });

  /** Parents with the most children first: the biggest judgement leads. */
  it('orders parents by how much they are being asked to hold', () => {
    const groups = groupProposal(PAIRINGS, [], EVIDENCE);

    expect(groups[0]?.parent).toBe('Rock');
    expect(groups[0]?.children).toHaveLength(2);
  });
});

describe('the evidence line states, never rates', () => {
  /**
   * **Adam's rule, and the reason it is a rule.** A count is a fact he weighs;
   * a grade is the app judging its own output. `Rock` at ten records is the
   * standing proof that count and quality are different axes — ten records
   * across ten unrelated artists means "import artefact", not "well supported".
   *
   * Fails against any wording that scores, grades or expresses confidence.
   */
  it('never grades the suggestion', () => {
    const lines = [
      evidenceLine({ recordCount: 10, examples: ['Dire Straits — Dire Straits'] }),
      evidenceLine({ recordCount: 1, examples: ['Discharge — Grave New World'] }),
      evidenceLine({ recordCount: 0, examples: [] }),
    ];

    for (const line of lines) {
      expect(line).not.toMatch(/strong|weak|confiden|likely|probably|well|poor|score|high|low/i);
    }
  });

  /**
   * **The examples are load-bearing, not decoration** (Adam): *"the count tells
   * me how much evidence there is; the examples tell me whether the evidence
   * means anything."* Ten records across ten unrelated artists is the fact that
   * reveals `Rock` as a catch-all, and only the names carry it.
   */
  it('carries an example, not just a count', () => {
    expect(evidenceLine({ recordCount: 1, examples: ['Discharge — Grave New World'] })).toContain(
      'Discharge — Grave New World',
    );
  });

  /** A genre carrying nothing says so plainly — zero is a fact, not a blank. */
  it('states zero records rather than rendering empty', () => {
    const line = evidenceLine({ recordCount: 0, examples: [] });

    expect(line).toMatch(/no records/i);
    expect(line.trim()).not.toBe('');
  });

  /** Singular reads as singular; "1 records" is the app not paying attention. */
  it('reads naturally for one record', () => {
    expect(evidenceLine({ recordCount: 1, examples: ['Discharge — Grave New World'] })).toContain(
      '1 record:',
    );
  });
});
