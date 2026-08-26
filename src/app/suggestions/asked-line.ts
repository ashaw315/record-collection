/**
 * SPEC.md §9.2 (A39) — what a persisted gap analysis says about itself.
 *
 * **Two facts, and the second is the one that matters.** "Asked 20 minutes ago"
 * is about the REQUEST. What the reader needs is whether the answer still
 * applies, and those diverge in the dangerous direction: twenty minutes with
 * nothing added is a current answer that reads as stale, while two minutes with
 * five records added is a stale answer that reads as fresh. A gap analysis is a
 * claim about what is MISSING, so adding records is exactly the event that
 * invalidates it.
 *
 * **It STATES, it does not advise.** Whether five more records is worth one of
 * ten hourly requests is the user's judgement. Copy that nudges toward re-asking
 * is the app spending the user's quota on its own opinion — and a test pins it,
 * because that nudge is the natural thing to write.
 */
export function askedLine(input: { askedAt: Date; recordsAddedSince: number }): string {
  const when = `Asked ${elapsed(input.askedAt)}`;

  /*
   * **Silent when nothing has changed**, which is load-bearing rather than
   * tidy: a caveat shown when the answer is current is noise, and noise trains
   * the reader to skip the line in the case where it matters (the same rule as
   * §12 step 14c's variant limit).
   */
  if (input.recordsAddedSince === 0) return `${when}.`;

  const records = input.recordsAddedSince === 1 ? '1 record' : `${input.recordsAddedSince} records`;
  return `${when}, before you added ${records}.`;
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
