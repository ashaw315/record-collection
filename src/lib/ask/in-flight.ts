/**
 * **§P.3, a press while an ask is in flight ("Ask in flight presses and field", 22 Nov).** "A press of ASK while an ask is
 * in flight with the same phrase is ignored; with a changed phrase, the ask in flight is let go and the new phrase asked.
 * SURPRISE ME while an ask is in flight lets the ask go and answers at once." An ask let go is never drawn when it
 * returns, which ends the race the interim rule (both ignored) was avoiding. Pure, so the rule is a unit's.
 */
export type InFlight = { phrase: string } | null;
export type Press = { kind: 'ask'; phrase: string } | { kind: 'surprise' };
export type PressOutcome = 'ask' | 'surprise' | 'ignore' | 'abandon-and-ask' | 'abandon-and-surprise';

export function pressInFlight(running: InFlight, press: Press): PressOutcome {
  if (running === null) return press.kind;
  if (press.kind === 'surprise') return 'abandon-and-surprise';
  return press.phrase.trim() === running.phrase.trim() ? 'ignore' : 'abandon-and-ask';
}
