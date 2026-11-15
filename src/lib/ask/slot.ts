/**
 * **§P.6's slot after an ask (step 180, "Ask field reconciled", 12 Nov).** The messages are the slot's own words,
 * written to fit it (one line at the rail's width): "Where asking cannot reach its provider, ASK stays live and the
 * slot says so in its own words, not the route’s", so the route's sentence never reaches the slot, whatever it says.
 * Every wording here is Proposed, under §P.6's Provisionals lines.
 */
export const SLOT_MESSAGES = {
  only: 'The only one.',
  /* "Matched by role and count line" (14 Nov) withdrew the slot's no-ABOUT state (`P.6/slot-about`): none among what the filters leave has text to be matched by. */
  unanswerable: 'None described.',
  /* Reworded by Design (12 Nov; step 181): the first wording, "Asking isn't set up yet.", took two lines at the rail's width. */
  notConfigured: 'Not set up yet.',
  failed: 'Not answered.',
  /* The model pick's words (§P.2, 14 Nov), under its provisional: nothing fits is a message, a consolation beside it or not. */
  nothingFits: 'Nothing fits.',
  /* The run's end names none, and the ask after it starts the run again (§P.2). */
  runEnded: 'That was all.',
} as const;

export type AskOutcome =
  | { ok: true; status: number; unanswerable: boolean; answered?: number; verdict?: 'answer' | 'nothing-fits' | 'requirement-unmet' | 'run-exhausted' | null; undescribedTitle?: string }
  | { ok: false; status: number; code?: string; routeMessage?: string };

/** The slot's text for what the route answered: empty for an answer, the slot's own sentence otherwise. */
export function askSlotMessage(outcome: AskOutcome): string {
  if (!outcome.ok) return outcome.status === 503 || outcome.code === 'NOT_CONFIGURED' ? SLOT_MESSAGES.notConfigured : SLOT_MESSAGES.failed;
  if (outcome.verdict === 'run-exhausted') return SLOT_MESSAGES.runEnded;
  if (outcome.verdict === 'nothing-fits') return SLOT_MESSAGES.nothingFits;
  if (outcome.unanswerable || outcome.answered === 0) return SLOT_MESSAGES.unanswerable;
  /* "Undescribed title named" (15 Nov): the title asked as a phrase, and the slot naming its record so it does not read as lost. */
  if (outcome.undescribedTitle !== undefined) return `${outcome.undescribedTitle}: not described yet.`;
  return '';
}
