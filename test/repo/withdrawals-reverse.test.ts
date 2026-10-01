import { describe, expect, it } from 'vitest';
import { unenteredWithdrawals, withdrawalSentencesIn } from '../../scripts/withdrawals.mjs';

/**
 * **The index ran one direction and was assumed to run both.** Assertion 6
 * checks that every entry's quote is present in the section its id names;
 * assertion 7 finds declared sentences, but only those starting a `<strong>`
 * run or following a sentence end inside one. A withdrawal sentence written
 * into a target in any other position -- unbolded, or after other words in
 * a run -- passed silently with no entry filed, which is how §28 and §33
 * each carried one narrowing the Price history solo with no entry. Same
 * shape as §34 living in Plane and not Figure.
 *
 * The reverse check scans the targets' plain text for the phrasings the
 * file uses, wherever they sit, and names each sentence that no entry's
 * quote matches. A phrasing inside quotation marks is an example of the
 * form, not a declaration, and is not counted.
 */
describe('withdrawalSentencesIn: every sentence carrying a withdrawal phrasing, wherever it sits', () => {
  it('finds a declared sentence that is not at a bold run’s start, with its full extent', () => {
    const plain = 'The rule stands. The strip beside it is counted. Superseded in part by §37 on the air’s side only: at 960 the air sits left of the sleeve. The rest follows.';
    expect(withdrawalSentencesIn(plain)).toEqual(['Superseded in part by §37 on the air’s side only: at 960 the air sits left of the sleeve.']);
  });

  it('finds every phrasing the file uses', () => {
    const plain = 'Withdrawn by §3: a. Withdrawn in part by §4: b. Withdrawn in whole by §5: c. Withdrawn within §6: d. Superseded by §7: e. Superseded in part by §8: f.';
    expect(withdrawalSentencesIn(plain)).toHaveLength(6);
  });

  it('does not count a phrasing quoted as an example of the form', () => {
    const plain = 'The prefix contract checks only the opening words, so one read “Withdrawn within §33: stated plainly, so the fallback is not read as a rule,” and retired nothing.';
    expect(withdrawalSentencesIn(plain)).toEqual([]);
  });

  it('starts the sentence after a sentence end, not at the phrasing, so the words before the prefix are part of what must be entered', () => {
    const plain = 'First. The cover square carries marks, withdrawn by §48: the strip is not empty. Last.';
    expect(withdrawalSentencesIn(plain)).toEqual([]);
    const declared = 'First. Withdrawn by §48: the strip is not empty. Last.';
    expect(withdrawalSentencesIn(declared)).toEqual(['Withdrawn by §48: the strip is not empty.']);
  });
});

describe('unenteredWithdrawals: the sentences no entry’s quote matches', () => {
  const entries = [
    { id: '37/air-side', s: '37', by: '37', what: 'x', quote: 'Superseded in part by §37 on the air’s side only: at 960 the air sits left of the sleeve.' },
    { id: '48/strip', s: '48', by: '48', what: 'y', quote: 'Withdrawn by §48: the strip is not empty.' },
  ];
  it('passes a sentence an entry quotes exactly, and names one no entry quotes', () => {
    const found = ['Superseded in part by §37 on the air’s side only: at 960 the air sits left of the sleeve.', 'Superseded by §33 on its frame sizes: every frame size it prints is withdrawn.'];
    expect(unenteredWithdrawals(found, entries)).toEqual(['Superseded by §33 on its frame sizes: every frame size it prints is withdrawn.']);
  });
  it('matches on collapsed whitespace, since the targets wrap their lines', () => {
    expect(unenteredWithdrawals(['Withdrawn by §48:  the strip is\nnot empty.'], entries)).toEqual([]);
  });
});
