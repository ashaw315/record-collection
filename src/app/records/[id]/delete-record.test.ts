import { describe, expect, it } from 'vitest';
import { deleteConsequence, deleteFailureMessage } from './delete-record';

/**
 * What a delete costs, said before it happens (SPEC.md §7.3's precedent, §5.2).
 *
 * §7.3 requires the consequence to be legible BEFORE it happens, and the
 * want-list dialog is the shape: it names what is lost AND what is not. A
 * record carries more than the want-list entry does — images, journal entries
 * and price history all cascade — so "this cannot be undone" is not enough.
 *
 * Pure, because the wording is the decision. A component test would confirm
 * whatever string the component held.
 */

describe('deleteConsequence', () => {
  it('names the images when there are some', () => {
    const said = deleteConsequence({ imageCount: 3, journalCount: 0 });

    expect(said).toMatch(/3 images/);
  });

  it('names the journal entries when there are some', () => {
    const said = deleteConsequence({ imageCount: 0, journalCount: 2 });

    expect(said).toMatch(/2 journal entries/);
  });

  it('names both, because both cascade', () => {
    const said = deleteConsequence({ imageCount: 4, journalCount: 1 });

    expect(said).toMatch(/4 images/);
    expect(said).toMatch(/1 journal entry/);
  });

  it('singularises, so a record with one photo does not read as a bug', () => {
    const said = deleteConsequence({ imageCount: 1, journalCount: 1 });

    expect(said).toMatch(/1 image\b/);
    expect(said).not.toMatch(/1 images/);
    expect(said).toMatch(/1 journal entry\b/);
    expect(said).not.toMatch(/1 journal entries/);
  });

  it('does not claim things that do not exist', () => {
    /**
     * The discriminating case. A message listing "0 images and 0 journal
     * entries" is noise that trains the reader to skip the sentence — and this
     * sentence is the only warning before an irreversible action.
     */
    const said = deleteConsequence({ imageCount: 0, journalCount: 0 });

    expect(said).not.toMatch(/0 /);
    expect(said).not.toMatch(/image/);
    expect(said).not.toMatch(/journal/);
  });

  it('always says the purchase details go, which is the loss people regret', () => {
    // Price, date and store are hand-entered and unrecoverable. They are not
    // counted rows, so nothing else in the sentence mentions them.
    for (const counts of [
      { imageCount: 0, journalCount: 0 },
      { imageCount: 2, journalCount: 2 },
    ]) {
      expect(deleteConsequence(counts)).toMatch(/purchase/i);
    }
  });

  it('says it cannot be undone', () => {
    expect(deleteConsequence({ imageCount: 0, journalCount: 0 })).toMatch(/cannot be undone/i);
  });
});

describe('deleteFailureMessage', () => {
  it('explains a 409 as a want-list link, not as a generic failure', () => {
    /**
     * The endpoint returns `409 IN_USE` when `want_list.acquired_record_id`
     * points at the record (§7.3: the want list doubles as acquisition
     * history). "Could not delete" leaves the user with no idea why, and no way
     * to act — the reason is specific and the fix is specific.
     */
    const said = deleteFailureMessage(409, 'IN_USE');

    // Either spelling: the property is that it names the want list, not how
    // the sentence happens to hyphenate it.
    expect(said).toMatch(/want[- ]list/i);
    expect(said, 'and what to do about it').toMatch(/acquisition|remove|want-list entry/i);
  });

  it('does not blame the want list for an unrelated failure', () => {
    // A 500 is our problem, and saying "it fulfils a want-list entry" would
    // send the user hunting for something that is not there.
    const said = deleteFailureMessage(500, undefined);

    expect(said).not.toMatch(/want[- ]list/i);
  });

  it('reports a 404 as already gone rather than as an error', () => {
    // Two clicks, or a stale tab. The record is not there, which is what the
    // user wanted.
    expect(deleteFailureMessage(404, 'NOT_FOUND')).toMatch(/no longer|already/i);
  });
});
