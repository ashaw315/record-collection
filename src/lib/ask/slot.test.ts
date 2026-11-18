import { describe, expect, it } from 'vitest';
import { askSlotMessage, SLOT_MESSAGES } from './slot';

/**
 * **§P.6's slot after an ask (step 180, "Ask field reconciled", 12 Nov).** "Where asking cannot reach its provider,
 * ASK stays live and the slot says so in its own words, not the route’s": the not-configured answer reads "Asking isn't
 * set up yet." (Proposed), whatever sentence the route sent. A pool with no ABOUT reads "No About yet."; any other
 * failure "Not answered."; an answer clears the slot. Each case fails against a slot that shows the route's sentence,
 * or reads a 503 as an answer.
 */
describe('askSlotMessage', () => {
  it('says the slot’s own words when asking is not set up, never the route’s', () => {
    const message = askSlotMessage({ ok: false, status: 503, code: 'NOT_CONFIGURED', routeMessage: 'The ask is not configured on this deployment' });
    /* Reworded by Design ("Markers split and slot reworded", 12 Nov; step 181): the first wording took two lines at the rail's width. */
    expect(message).toBe('Not set up yet.');
    expect(message).toBe(SLOT_MESSAGES.notConfigured);
  });

  /* "Matched by role and count line" (14 Nov) withdrew the slot's no-ABOUT state (`P.6/slot-about`): with no text to be matched by among what the filters leave, the slot says none has been described yet. Proposed. */
  it('says "None described." for a pool with no text to be matched by, "Not answered." for any other failure, and nothing for an answer', () => {
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: true })).toBe('None described.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 0 })).toBe('None described.');
    expect(askSlotMessage({ ok: false, status: 500, code: 'INTERNAL', routeMessage: 'boom' })).toBe('Not answered.');
    expect(askSlotMessage({ ok: false, status: 400, code: 'VALIDATION', routeMessage: 'Write what you want first' })).toBe('Not answered.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 5 })).toBe('');
  });

  /*
    The model pick's words (§P.2, "Consolation and count reason" and "Undescribed title named", 14 and 15 Nov), Proposed
    under §P.2's "the model pick's words" provisional: nothing fits is a message, and an answer when a consolation is
    drawn beside it; the run's end names none; a title whose record has no matched text is named, and asked as a phrase.
  */
  it('says that nothing fits, that the run has ended, and names a title not described yet', () => {
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 0, verdict: 'nothing-fits' })).toBe('Nothing fits.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 1, verdict: 'nothing-fits' }), 'with a consolation beside it').toBe('Nothing fits.');
    /* §P.2 (step 3, unit 3a): "whatever it says keeps 'fit' or its sense, because 'That was all.' reads as the whole shelf seen". Proposed there, measured on one line at the rail's 112 by pick-control-156. */
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 0, verdict: 'run-exhausted' })).toBe('That’s all that fits.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 3, verdict: 'answer', undescribedTitle: 'Diamond Jubilee' })).toBe('Diamond Jubilee: not described yet.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 3, verdict: 'answer' })).toBe('');
  });
});
