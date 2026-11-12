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

  it('says "No About yet." for an unanswerable pool, "Not answered." for any other failure, and nothing for an answer', () => {
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: true })).toBe('No About yet.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 0 })).toBe('No About yet.');
    expect(askSlotMessage({ ok: false, status: 500, code: 'INTERNAL', routeMessage: 'boom' })).toBe('Not answered.');
    expect(askSlotMessage({ ok: false, status: 400, code: 'VALIDATION', routeMessage: 'Write what you want first' })).toBe('Not answered.');
    expect(askSlotMessage({ ok: true, status: 200, unanswerable: false, answered: 5 })).toBe('');
  });
});
