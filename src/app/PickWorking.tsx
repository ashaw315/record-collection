/**
 * **§P.3's indicator ("Indicator any length", 23 Nov), drawn in the slot for the length of the call.** "A motion that
 * reads as work however long it runs. Nothing in it ends, slows or repeats on a cycle a reader could count, and it carries
 * no estimate of the time left." A hairline whose dashes drift at a steady pace: the pattern moves by exactly one period
 * each loop, so the loop has no seam to see and nothing to count. "Past the first few seconds, words join the motion in
 * the slot", at five seconds (Proposed, for Adam on his phone), which the control times; under reduced motion the line is
 * still and the words are drawn from the press. Both end at the reply. The wording is Proposed.
 */
export const WORKING_WORDS = 'Reading your records…';

export function PickWorking({ words }: { words: boolean }) {
  return (
    <span data-pick-working="" className="flex items-center gap-[10px]">
      <span
        data-pick-working-motion=""
        aria-hidden="true"
        className="block h-px w-[48px] shrink-0 animate-[pick-work_1.4s_linear_infinite] bg-[repeating-linear-gradient(90deg,currentColor_0_6px,transparent_6px_12px)] bg-[length:12px_1px] motion-reduce:animate-none"
      />
      {words && (
        <span data-pick-working-words="" className="text-prose">
          {WORKING_WORDS}
        </span>
      )}
    </span>
  );
}
