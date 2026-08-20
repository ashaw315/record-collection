import Anthropic from '@anthropic-ai/sdk';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import type { MessageCreate } from './client';

/**
 * SPEC.md §10b's snippet generator.
 *
 * **What is ENFORCED and what is merely INSTRUCTED, stated up front**, because
 * A29d is the precedent for getting this wrong: that amendment claimed the genre
 * validation enforced a rule it could not enforce, and three files repeated the
 * claim until R5 measured it.
 *
 * §10b requires the snippet to "never contradict entered data… it does not state
 * a pressing, a year, or a price; those are on the record."
 *
 * | mechanism | kind | catches |
 * |---|---|---|
 * | the record's own facts are NOT SENT | **enforced** | a contradiction of any fact withheld — the model cannot contradict a year it was never told |
 * | the prompt forbids years, pressings and prices | instructed | nothing on its own |
 * | the prompt asks for omission over guessing | instructed | nothing on its own |
 * | the output is labelled as generated (unit 3) | enforced | nothing, but it stops the text reading as established fact |
 *
 * **No parser can check this output.** A snippet asserting "released in 1982" for
 * a 1981 pressing is valid prose, and the app has no way to check a claim about
 * music against the world. That is CLAUDE.md §8's worst shape — confidently
 * misleading — so the mitigation is structural: WITHHOLD the facts that could be
 * contradicted, and label what comes back. Nothing in this module should be read
 * as verifying the text.
 */

/** Same capability argument as §9.2's — see `client.ts`. */
const MODEL = 'claude-opus-5';

/**
 * **R5's finding 4, decided for both callers.**
 *
 * The two features share a client and needed different ceilings, and the shared
 * `MAX_TOKENS = 4000` fitted neither well. Measured rather than guessed:
 *
 * - §9.2's live run produced 34 suggestions in **2994 output tokens**, stopping
 *   on `end_turn`. 4000 is where a full gap analysis fits.
 * - §10b bounds the snippet in WORDS — "two or three sentences" — which is
 *   roughly 200–400 characters, about **100 tokens**. The shared ceiling was
 *   ~40x that.
 *
 * A ceiling 40x larger than any correct response is not a safety net: a runaway
 * answer would look exactly like a normal one and cost forty times as much. 400
 * leaves comfortable room for three sentences and makes an essay impossible.
 *
 * **The ceiling is a backstop, not the instruction.** A response truncated here
 * is a half-sentence, which is worse than a short one — so the prompt asks for
 * the length as well, and this only bounds the damage.
 */
export const SNIPPET_MAX_TOKENS = 400;

/**
 * What the model is told about the record — **artist and title, nothing else.**
 *
 * This type is the enforcement mechanism for §10b's "never contradicts entered
 * data". Every field it omits is a fact the model cannot get wrong, so the
 * omissions are load-bearing: `release_year`, `condition_*`, `purchase_price`,
 * the pressing's year and country, the label, and the matrix all stay behind.
 *
 * **Sending a year "so the model can avoid contradicting it" is the trap.** It
 * hands over the exact value most likely to be repeated back as an assertion,
 * and converts a fact the app knows into a claim the model makes.
 */
export type SnippetSubject = {
  artist: string;
  title: string;
};

export type SnippetResult =
  | { ok: true; snippet: string }
  | { ok: false; reason: 'unreadable' };

/**
 * The prompt.
 *
 * Asks for §10b's two-or-three sentences, forbids the three fact classes §10b
 * names, and asks for less rather than a guess (A29c's trade, one feature over:
 * it reduces hallucination and does not prevent it, and its presence here must
 * not be read anywhere as a verification).
 */
export function buildSnippetPrompt(subject: SnippetSubject): string {
  return [
    'Write a short note about a record in a collector’s collection.',
    '',
    `ARTIST: ${subject.artist}`,
    `TITLE: ${subject.title}`,
    '',
    'Two or three sentences: what the record is, roughly when it landed, and why',
    'it matters. Write it for someone who owns it and wants context, not a review.',
    '',
    /*
     * §10b's rule. INSTRUCTED, not enforced — the real protection is that none
     * of these values are in the payload above.
     */
    'Do not state a pressing, a catalogue number, a specific release year or any',
    'price. The collector has those on the record already and yours would compete',
    'with them. Speak about the music and its context, not about this copy.',
    '',
    'If you are unsure the record exists, or unsure of a detail, say less rather',
    'than guessing. A shorter honest note is better than a confident wrong one.',
    '',
    'Reply with the note only — no preamble, no quotation marks, no markdown.',
  ].join('\n');
}

export type SnippetClient = {
  write: (subject: SnippetSubject) => Promise<SnippetResult>;
};

/**
 * Injectable, exactly like §9.2's client and for the same reason: the guard
 * fires at the REQUEST SITE, so an injected fake exercises the real response
 * boundary without a socket.
 */
export function createSnippetClient(transport: { create: MessageCreate }): SnippetClient {
  return {
    async write(subject) {
      const response = await transport.create({
        model: MODEL,
        max_tokens: SNIPPET_MAX_TOKENS,
        messages: [{ role: 'user', content: buildSnippetPrompt(subject) }],
      });

      const text = response.content.find((block) => block.type === 'text')?.text;

      /*
       * **Empty is UNREADABLE here, not an empty snippet**, and the difference
       * matters more than it does for §9.2. An empty string stored on the record
       * would be indistinguishable from a snippet the user DELETED, which §4.2
       * treats as a deliberate act the app must not undo. So a response with
       * nothing in it fails rather than writing.
       */
      const trimmed = unwrap(text ?? '');
      if (trimmed === '') return { ok: false, reason: 'unreadable' };

      return { ok: true, snippet: trimmed };
    },
  };
}

/**
 * Strips the wrapping models add around prose.
 *
 * The text is rendered straight into a panel and stored forever, so a pair of
 * quotation marks becomes part of the record. Narrow on purpose: it removes
 * matched surrounding quotes and whitespace, and does not attempt to detect a
 * preamble — cutting at a colon would truncate a legitimate sentence.
 */
function unwrap(raw: string): string {
  const trimmed = raw.trim();

  const quoted = /^"([\s\S]*)"$/.exec(trimmed) ?? /^“([\s\S]*)”$/.exec(trimmed);
  return (quoted?.[1] ?? trimmed).trim();
}

let shared: SnippetClient | undefined;

/**
 * The production client.
 *
 * `assertNoLiveCall` fires at the request site and only for the real `fetch`, so
 * a test reaching this path is refused by name while an injected fake is not.
 */
export function getSnippetClient(): SnippetClient {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    shared = createSnippetClient({
      create: async (request) => {
        if (usesRealNetwork(globalThis.fetch)) {
          assertNoLiveCall('https://api.anthropic.com/v1/messages');
        }

        return sdk.messages.create({
          model: request.model,
          max_tokens: request.max_tokens,
          messages: request.messages,
        }) as unknown as Promise<{ content: Array<{ type: string; text?: string }> }>;
      },
    });
  }

  return shared;
}
