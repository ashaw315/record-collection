/**
 * SPEC.md §9.2 (A39) — what a persisted gap analysis says about itself.
 *
 * **Two facts, and the second is the one that matters.** "Asked 20 minutes ago"
 * is about the REQUEST. What the reader needs is whether the answer still
 * applies, and those diverge in the dangerous direction: twenty minutes with
 * nothing added is a current answer that reads as stale, while two minutes with
 * five records added is a stale answer that reads as fresh. A gap analysis is a
 * claim about what is MISSING, so adding a record is exactly the event that
 * invalidates it — and so is want-listing one, which A47 corrected: both remove
 * something from the set of gaps, and counting only the first left this line
 * asserting nothing had changed when the answer had gone stale.
 *
 * **It STATES, it does not advise.** Whether five more records is worth one of
 * ten hourly requests is the user's judgement. Copy that nudges toward re-asking
 * is the app spending the user's quota on its own opinion — and a test pins it,
 * because that nudge is the natural thing to write.
 */
export function askedLine(input: { askedAt: Date; gapsClosedSince: number }): string {
  const when = `Asked ${elapsed(input.askedAt)}`;

  /*
   * **Silent when nothing has changed**, which is load-bearing rather than
   * tidy: a caveat shown when the answer is current is noise, and noise trains
   * the reader to skip the line in the case where it matters (the same rule as
   * §12 step 14c's variant limit).
   */
  if (input.gapsClosedSince === 0) return `${when}.`;

  /*
   * **A47: "records or wanted records", because that is what was counted.**
   *
   * This read "before you added N records" while the number counted records
   * alone — and the omission was the defect: a want-listed record left a
   * suggestion on screen beside a line asserting nothing had changed. The count
   * now includes want-list additions, so the copy must say so. **A number's NAME
   * must match what it measures**; a line claiming a record count while counting
   * something else is the proxy-assertion failure in UI copy.
   *
   * **One count, not two figures.** Both events invalidate the answer for the
   * same reason — each removes something from the set of gaps — and A39 was
   * right that a sentence carrying two numbers is read less than either.
   */
  const noun = input.gapsClosedSince === 1 ? 'record or wanted record' : 'records or wanted records';
  return `${when}, before you added ${input.gapsClosedSince} ${noun}.`;
}

/**
 * Coarse by design. A gap analysis is minutes-to-hours old and the reader is
 * deciding whether it still describes their shelf — "3 hours ago" answers that
 * and "2 hours 47 minutes ago" does not answer it better.
 */
function elapsed(askedAt: Date): string {
  const minutes = Math.floor((Date.now() - askedAt.getTime()) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}
