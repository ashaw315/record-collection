/**
 * **§P.6's slot after an ask (step 180, "Ask field reconciled", 12 Nov).** The messages are the slot's own words,
 * written to fit it (one line at the rail's width): "Where asking cannot reach its provider, ASK stays live and the
 * slot says so in its own words, not the route’s", so the route's sentence never reaches the slot, whatever it says.
 * Every wording here is Proposed, under §P.6's Provisionals lines.
 */
export const SLOT_MESSAGES = {
  only: 'The only one.',
  unanswerable: 'No About yet.',
  notConfigured: "Asking isn't set up yet.",
  failed: 'Not answered.',
} as const;

export type AskOutcome =
  | { ok: true; status: number; unanswerable: boolean; answered?: number }
  | { ok: false; status: number; code?: string; routeMessage?: string };

/** The slot's text for what the route answered: empty for an answer, the slot's own sentence otherwise. */
export function askSlotMessage(outcome: AskOutcome): string {
  if (!outcome.ok) return outcome.status === 503 || outcome.code === 'NOT_CONFIGURED' ? SLOT_MESSAGES.notConfigured : SLOT_MESSAGES.failed;
  if (outcome.unanswerable || outcome.answered === 0) return SLOT_MESSAGES.unanswerable;
  return '';
}
