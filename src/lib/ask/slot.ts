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
  /* §P.2 (Design, 19 Nov, "Slot for unmet and dropped reason"): where records fit in feel and none meets what the phrase requires, the slot's own words, drawn above its stand-in, in place of 3a's "the same words for both". Proposed; measured on one line at the rail's 112 and at 320 and 1280 by pick-control-156. */
  requirementUnmet: 'None has all of it.',
  /*
    Not here yet: the slot where an ask's answers were all left out over the reason's bound (§P.2, Design, 19 Nov). The
    proposed "No answer came. Ask again." measured 157.6 wide and took two lines in the rail's 112 (one at 320's 284 and
    1280's 300), so it went back to Design by the ruling's own clause rather than being cut; the message lands with the
    rewording, and the verdict with it.
  */
  /* The run's end names none, and the ask after it starts the run again (§P.2). "That was all." read as the whole shelf seen; the wording keeps "fit" (§P.2, Proposed, unit 3a), measured on one line at the rail's 112 by pick-control-156, with "No more fit." the fallback if it took two. */
  runEnded: 'That’s all that fits.',
} as const;

export type AskVerdict = 'answer' | 'nothing-fits' | 'requirement-unmet' | 'run-exhausted';

export type AskOutcome =
  | { ok: true; status: number; unanswerable: boolean; answered?: number; verdict?: AskVerdict | null; undescribedTitle?: string }
  | { ok: false; status: number; code?: string; routeMessage?: string };

/** The slot's text for what the route answered: empty for an answer, the slot's own sentence otherwise. */
export function askSlotMessage(outcome: AskOutcome): string {
  if (!outcome.ok) return outcome.status === 503 || outcome.code === 'NOT_CONFIGURED' ? SLOT_MESSAGES.notConfigured : SLOT_MESSAGES.failed;
  if (outcome.verdict === 'run-exhausted') return SLOT_MESSAGES.runEnded;
  if (outcome.verdict === 'nothing-fits') return SLOT_MESSAGES.nothingFits;
  if (outcome.verdict === 'requirement-unmet') return SLOT_MESSAGES.requirementUnmet;
  if (outcome.unanswerable || outcome.answered === 0) return SLOT_MESSAGES.unanswerable;
  /* "Undescribed title named" (15 Nov): the title asked as a phrase, and the slot naming its record so it does not read as lost. */
  if (outcome.undescribedTitle !== undefined) return `${outcome.undescribedTitle}: not described yet.`;
  return '';
}
