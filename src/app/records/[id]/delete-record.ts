/**
 * What deleting a record costs, and why one might refuse (SPEC.md §5.2, §7.3).
 *
 * §7.3 requires the consequence to be legible BEFORE it happens; the want-list
 * dialog is the precedent and names what is lost AND what is not. A record
 * carries more than a want-list entry — images, journal entries and price
 * history all cascade (§4.2) — so "this cannot be undone" is not enough on its
 * own.
 *
 * Pure, because the wording IS the decision here. A component test would
 * confirm whatever string the component happened to hold.
 */

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function deleteConsequence(counts: {
  imageCount: number;
  journalCount: number;
}): string {
  const parts: string[] = [];

  // Only what actually exists. "0 images and 0 journal entries" is noise, and
  // this sentence is the only warning before an irreversible action — noise
  // here trains the reader to skip it.
  if (counts.imageCount > 0) parts.push(plural(counts.imageCount, 'image', 'images'));
  if (counts.journalCount > 0) {
    parts.push(plural(counts.journalCount, 'journal entry', 'journal entries'));
  }

  const cascaded = parts.length === 0 ? '' : `, along with its ${parts.join(' and ')},`;

  /**
   * Purchase details are named unconditionally: they are hand-entered, they are
   * not counted rows, and they are the loss people actually regret. This is the
   * same argument §7.3 makes for keeping acquired want-list entries.
   */
  return `This removes the record${cascaded} and the purchase price, date and store you recorded. It cannot be undone.`;
}

export function deleteFailureMessage(status: number, code: string | undefined): string {
  /**
   * §5.2 returns `409 IN_USE` when `want_list.acquired_record_id` points at the
   * record — the want list doubles as acquisition history (§7.3), so deleting
   * the record would leave an entry claiming an acquisition that no longer
   * exists.
   *
   * "Could not delete" would leave the user with no idea why and no way to act.
   * The reason is specific, so the message is.
   */
  if (status === 409 || code === 'IN_USE') {
    return 'This record fulfils a want-list entry, so deleting it would leave that entry pointing at nothing. Remove the want-list entry first, then delete the record.';
  }

  // Two clicks, or a stale tab. Not an error — the record is not there, which
  // is what was wanted.
  if (status === 404) {
    return 'That record is no longer here — it may already have been deleted.';
  }

  return 'The record could not be deleted. Nothing was changed.';
}
