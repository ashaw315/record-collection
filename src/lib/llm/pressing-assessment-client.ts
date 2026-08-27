import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import {
  callAnthropic,
  type AnthropicRequest,
  type AnthropicResponse,
  type MessageTransport,
  type Observed,
} from './transport';

/**
 * SPEC.md §12b (A43) — does the pressing matter for this record, and which one.
 *
 * **A model's assertion about music, displayed as such and never stored as
 * truth** — §9.2's standing exactly. The app assembles the material and orders
 * the question; the user decides. Nothing here writes to `want_list`, and
 * `best_dig_notes` in particular stays the user's own field.
 *
 * **Asked about artist and title ALONE**, and the omissions are decisions:
 *
 *   - **not what Discogs lists**, because that is a different question and 14c
 *     already answers it — this is about the album's pressing history, which is
 *     what the model knows;
 *   - **not the user's own dig notes**, because sending them invites agreement.
 *     An assessment confirming "first UK press on Clay" is worth much less than
 *     one arrived at independently, and keeping them separate makes disagreement
 *     informative rather than impossible.
 */

const MODEL = 'claude-opus-5';

/**
 * Room for a few pressings with an identifier each, plus low-effort thinking.
 * Far under §9.2's 4,000 — this answers about one album, not a collection.
 */
export const PRESSING_ASSESSMENT_MAX_TOKENS = 1_500;

/** Recall about a record, not reasoning across a collection. See the snippet. */
const EFFORT = 'low' as const;

export type PressingSubject = { artist: string; title: string };

/**
 * **Four states, and they do not collapse into three.**
 *
 * `matters` names pressings worth hunting. `any-copy` says pressing makes no
 * difference here — **the answer that ENDS a hunt rather than directing one**,
 * and the one A40's ranked list could not express at all. `unknown` says the
 * model has nothing reliable, which **leaves the hunt open** and tells the user
 * they are on their own.
 *
 * The fourth state is "not assessed", which lives in the UI rather than here:
 * no result at all. Collapsing `unknown` into it would turn "no information"
 * into "nobody asked"; collapsing it into `any-copy` would turn it into "there
 * is nothing to find" — a negative the app never established, on exactly the
 * obscure records this collection is made of.
 */
export type PressingVerdict = 'matters' | 'any-copy' | 'unknown';

export type PressingAssessment =
  | ({
      ok: true;
      verdict: PressingVerdict;
      pressings: Array<{ description: string; identifier: string }>;
      /**
       * The model's own description of what the list's order means, or null.
       *
       * **STATED, never RATED.** The list reads best-first by convention, and
       * measured on two real assessments the model DOES order — differently each
       * time: original-then-chronological for one, sought-after-then-territory
       * for the other. So "unordered" would be false and "best first" would be a
       * claim the assessment cannot support — value is the user's (§8).
       *
       * **Attributed when rendered**, because this is the model describing its
       * own output rather than a property the app determined.
       */
      orderedBy: string | null;
      /** Pressings dropped for naming nothing checkable (A29d's reported count). */
      dropped: number;
    } & Observed)
  | ({ ok: false; reason: 'cut' | 'unreadable' } & Observed);

const responseSchema = z.object({
  verdict: z.enum(['matters', 'any-copy', 'unknown']),
  /**
   * What the ORDER of `pressings` means, in the model's own words.
   *
   * **Optional, because "ordered by nothing in particular" is a real answer**
   * and inventing a basis to fill the field is the fabrication this exists to
   * prevent — the same shape as `noParentFits` and the `unknown` verdict.
   */
  orderedBy: z.string().trim().min(1).optional(),
  pressings: z
    .array(z.object({ description: z.string(), identifier: z.string() }))
    .optional()
    .default([]),
});

/**
 * **What counts as checkable, as a list rather than a regex nobody can find**
 * (Adam). Each of these can be read off the object in the user's hands, which is
 * the standard 14c established: the user's eye is the matcher.
 *
 * | accepted | why |
 * |---|---|
 * | catalogue number | printed on the sleeve and the label |
 * | pressing plant | named in the deadwax or on the label |
 * | matrix / runout | stamped in the deadwax — 14c's whole subject |
 * | country | printed on the sleeve |
 *
 * **A YEAR is deliberately NOT accepted**, and the reason is 14b's: a year is an
 * OUTPUT of identification rather than an input to it. A pressing year is
 * printed on a sleeve at best and inferred at worst, and "the 1977 pressing"
 * cannot be checked against a record in a shop.
 *
 * **The intended cost is suppressing genuine but general knowledge.** "The first
 * press sounds better" is true of many records and actionable on none — a model
 * that knows an album has notable pressings but cannot name one has said nothing
 * the user did not already know from holding the record.
 */
const CHECKABLE = [
  // A catalogue number: letters and digits with a separator, e.g. BSK 3010,
  // CLAY LP 3, EKS-75005. Two or more digits, so a bare year cannot match.
  /\b[A-Z][A-Z0-9]*[\s-][A-Z0-9]*\d{2,}\b/,
  // A named plant or mastering house.
  /\b(pressed|mastered|cut|plant|press(ing)? plant)\b/i,
  // Deadwax markings.
  /\b(matrix|runout|dead ?wax|stamper|etched)\b/i,
  // A country or territory of pressing.
  /\b(UK|US|USA|German|Japanese|French|Dutch|Italian|Canadian|British|American)\b/,
];

function isCheckable(identifier: string): boolean {
  /*
   * A YEAR ALONE never qualifies, checked first so a string carrying only a year
   * cannot pass on some other pattern's leniency.
   */
  const withoutYears = identifier.replace(/\b(19|20)\d{2}\b/g, ' ');

  return CHECKABLE.some((pattern) => pattern.test(withoutYears));
}

export function buildPressingAssessmentPrompt(subject: PressingSubject): string {
  return [
    `A record collector is hunting for: ${subject.artist} — ${subject.title}.`,
    '',
    'Does the pressing matter for this record, and if so which one should they',
    'look for?',
    '',
    /*
     * The three answers, stated as equally legitimate. A44's `noParentFits`
     * established that a constraint which cannot express its own edge case
     * turns silence into a lie.
     */
    'There are three honest answers:',
    '',
    '1. "matters" — specific pressings are worth seeking out. Name them.',
    '2. "any-copy" — pressing makes no real difference for this record, and any',
    '   copy is fine. This is a USEFUL answer: it saves the collector time.',
    '3. "unknown" — you do not have reliable knowledge of this record’s',
    '   pressings. This is BETTER THAN A GUESS. Many records are obscure and',
    '   saying so is more useful than naming a pressing you are unsure of.',
    '',
    /*
     * 14c's standard, stated as a requirement rather than a preference — and
     * enforced by the parser regardless (A29c).
     */
    'If you answer "matters", each pressing must carry something the collector',
    'can CHECK AGAINST THE RECORD IN THEIR HANDS: a catalogue number, a pressing',
    'plant, a matrix or runout marking, or the country of pressing.',
    '',
    'A year is NOT enough — "the 1977 pressing" cannot be checked in a shop, and',
    'a pressing year is printed on a sleeve at best. Never identify a pressing by',
    'year alone.',
    '',
    '"It sounds better" is not an identifier. If you cannot name something',
    'checkable, answer "unknown" instead.',
    '',
    /*
     * **What the order MEANS, not a ranking.** A ranking would be a claim about
     * VALUE, and value here is the collector's (§8) — so the model is asked to
     * describe its own ordering rather than to sort by quality.
     *
     * And "no particular order" is offered explicitly, because a model asked for
     * a basis will invent one, which is the fabrication this field exists to
     * prevent.
     */
    'Say what order you have listed them in, as "orderedBy" — for example',
    '"original pressing first, then chronologically" or "most sought-after',
    'first". Describe the order you used; do NOT rank them by which sounds best,',
    'which is the collector’s judgement to make.',
    '',
    'If they are in no particular order, leave "orderedBy" out entirely rather',
    'than inventing a basis.',
    '',
    'Respond with JSON only, no prose and no markdown fences:',
    '{ "verdict": "matters" | "any-copy" | "unknown",',
    '  "orderedBy": "..." (optional),',
    '  "pressings": [{ "description": "...", "identifier": "..." }] }',
  ].join('\n');
}

export type PressingAssessmentClient = {
  assess: (subject: PressingSubject) => Promise<PressingAssessment>;
};

export function createPressingAssessmentClient(
  transport: MessageTransport,
): PressingAssessmentClient {
  return {
    async assess(subject) {
      // Through `callAnthropic`: usage and stop_reason arrive with the response.
      const { text, observed, ranOutOfRoom } = await callAnthropic(transport, {
        model: MODEL,
        max_tokens: PRESSING_ASSESSMENT_MAX_TOKENS,
        output_config: { effort: EFFORT },
        messages: [{ role: 'user', content: buildPressingAssessmentPrompt(subject) }],
      });

      if (ranOutOfRoom) return { ok: false, reason: 'cut', ...observed };
      if (text === undefined) return { ok: false, reason: 'unreadable', ...observed };

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(text));
      } catch {
        return { ok: false, reason: 'unreadable', ...observed };
      }

      const envelope = responseSchema.safeParse(parsed);
      if (!envelope.success) return { ok: false, reason: 'unreadable', ...observed };

      /*
       * **The prompt asks; this ENFORCES** (A29c). A pressing naming nothing
       * checkable is dropped whatever the prompt said — and if that empties a
       * "matters" verdict, the verdict becomes `unknown`, because a claim that
       * pressings matter without naming one is the vague answer this rule
       * exists to suppress.
       */
      const kept = envelope.data.pressings.filter((pressing) => isCheckable(pressing.identifier));
      const dropped = envelope.data.pressings.length - kept.length;

      const verdict: PressingVerdict =
        envelope.data.verdict === 'matters' && kept.length === 0
          ? 'unknown'
          : envelope.data.verdict;

      /*
       * A basis describes an ORDER, so it is meaningless without a list to
       * order — an `any-copy` or `unknown` verdict names no pressings, and
       * carrying a basis there would describe nothing.
       */
      const orderedBy =
        verdict === 'matters' && kept.length > 1 ? (envelope.data.orderedBy ?? null) : null;

      return {
        ok: true,
        verdict,
        orderedBy,
        // An `any-copy` verdict names no pressings by design, so the rule above
        // cannot demote it.
        pressings: verdict === 'matters' ? kept : [],
        dropped,
        ...observed,
      };
    },
  };
}

/** Models fence JSON despite being asked not to — §9.2 sees the same. */
function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

let shared: PressingAssessmentClient | undefined;

/**
 * The production client. `assertNoLiveCall` fires at the REQUEST SITE, so an
 * injected fake is exempt and a test reaching this path is refused by name.
 */
export function getPressingAssessmentClient(): PressingAssessmentClient {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    shared = createPressingAssessmentClient({
      create: async (request: AnthropicRequest) => {
        if (usesRealNetwork(globalThis.fetch)) {
          assertNoLiveCall('https://api.anthropic.com/v1/messages');
        }

        return sdk.messages.create({
          model: request.model,
          max_tokens: request.max_tokens,
          output_config: request.output_config,
          messages: request.messages,
        }) as unknown as Promise<AnthropicResponse>;
      },
    });
  }

  return shared;
}
