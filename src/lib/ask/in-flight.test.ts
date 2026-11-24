import { describe, expect, it } from 'vitest';
import { pressInFlight } from './in-flight';

/**
 * **§P.3, a press while an ask is in flight ("Ask in flight presses and field", 22 Nov):** "A press of ASK while an ask is
 * in flight with the same phrase is ignored; with a changed phrase, the ask in flight is let go and the new phrase asked.
 * SURPRISE ME while an ask is in flight lets the ask go and answers at once." Fails against the interim rule it replaces
 * (both ignored), one that compares the phrase untrimmed, and one that lets SURPRISE ME wait for the ask.
 */
describe('pressInFlight', () => {
  it('starts an ask, or answers SURPRISE ME, when nothing is in flight', () => {
    expect(pressInFlight(null, { kind: 'ask', phrase: 'rainy afternoon' })).toBe('ask');
    expect(pressInFlight(null, { kind: 'surprise' })).toBe('surprise');
  });

  it('ignores ASK with the same phrase in flight, trimmed as the ask is', () => {
    expect(pressInFlight({ phrase: 'rainy afternoon' }, { kind: 'ask', phrase: '  rainy afternoon ' })).toBe('ignore');
  });

  it('lets the ask go and asks again for a changed phrase, and lets it go and answers for SURPRISE ME', () => {
    expect(pressInFlight({ phrase: 'rainy afternoon' }, { kind: 'ask', phrase: 'loud and fast' })).toBe('abandon-and-ask');
    expect(pressInFlight({ phrase: 'rainy afternoon' }, { kind: 'surprise' })).toBe('abandon-and-surprise');
  });
});
