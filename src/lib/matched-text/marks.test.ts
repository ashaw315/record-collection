import { describe, expect, it } from 'vitest';
import { chooseDraft, parseMarked } from './marks';

/**
 * **What `--store` writes to production is decided here (the coordinator, 15 Nov):** the ids in Adam's marked file, each
 * with the effort he named, and the draft each mark picks. Tested because the store path writes production, after an
 * hour of his review.
 */
describe('parseMarked', () => {
  it('reads each line that starts with a short id, with an effort where one follows, and nothing else', () => {
    expect(parseMarked('# notes\ne315c6a7\n  05d37b5f high\nnot an id\n22d34772-3c46 medium\n\n')).toEqual([
      { prefix: 'e315c6a7' },
      { prefix: '05d37b5f', effort: 'high' },
      { prefix: '22d34772', effort: 'medium' },
    ]);
  });
});

describe('chooseDraft', () => {
  const drafts = [
    { id: 'e315c6a7-1', effort: 'medium', text: 'At medium.' },
    { id: 'e315c6a7-1', effort: 'high', text: 'At high.' },
    { id: '22d34772-1', text: 'One draft, no effort.' },
  ];

  it('takes the effort a mark names, medium for a bare id where two were drafted, and the only draft where one was', () => {
    expect(chooseDraft(drafts, { prefix: 'e315c6a7', effort: 'high' })?.text).toBe('At high.');
    expect(chooseDraft(drafts, { prefix: 'e315c6a7' })?.text).toBe('At medium.');
    expect(chooseDraft(drafts, { prefix: '22d34772' })?.text).toBe('One draft, no effort.');
  });

  it('chooses nothing for an id no draft has, or an effort not drafted, rather than another draft', () => {
    expect(chooseDraft(drafts, { prefix: 'ffffffff' })).toBeUndefined();
    expect(chooseDraft(drafts, { prefix: 'e315c6a7', effort: 'low' })).toBeUndefined();
  });
});
