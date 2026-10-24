import Anthropic from '@anthropic-ai/sdk';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import { MOODS } from '@/lib/moods/moods';
import type { RecordToTag, Tagger, TaggerReply } from '@/lib/moods/tagging';
import { callAnthropic, type AnthropicRequest, type AnthropicResponse, type MessageTransport } from './transport';

/**
 * SPEC.md §7.12 (A76): the mood tagger, one record per call.
 *
 * **It owns the call and nothing else.** Whether a reply is one to four moods
 * from the list is `tagging.ts`'s judgement, made once for the script and the
 * route; this hands back the parsed reply, or why there is none.
 *
 * **No refusal fallback is asked for, deliberately.** A fallback model's
 * answer would be stored under `tagged_by_model` as this one's, and that
 * column exists to say why a record's tags changed. Fallbacks are opt-in on
 * the API (a request without them stops on a refusal), the SDK applies them
 * only through middleware this client does not register, and the request
 * below names its fields one by one, so none can reach it.
 */
export const MOOD_TAGGER_MODEL = 'claude-opus-5-5';

/**
 * Thinking plus a one-line JSON reply. A cut reply is refused, so the ceiling
 * leaves generous room rather than being tuned to the answer's size.
 */
export const MOOD_TAGGER_MAX_TOKENS = 2_000;

/**
 * **Medium**, which is also this model's default, stated because the type
 * requires it. The task is recall about a record, not reasoning across a
 * collection; breadth of music knowledge comes from the model (§7.12).
 */
const EFFORT = 'medium' as const;

export function buildMoodPrompt(record: RecordToTag): string {
  const year = record.year === null ? '' : ` (${record.year})`;

  return [
    'A record collector picks what to play by mood. Which of these moods does',
    'this record honestly suit?',
    '',
    `THE RECORD: ${record.artist} — ${record.title}${year}`,
    '',
    'THE MOODS:',
    ...MOODS.map((mood) => `- ${mood}`),
    '',
    /*
     * §7.12: never a flat count. A run where every record gets the same
     * number is refused, because a collection tagged two-each can never match
     * three moods; so the prompt asks for honesty and names no target.
     */
    'Choose every mood that genuinely fits the music, and no others. Most',
    'records suit two to four; if only one fits, give only one. Never pad the',
    'answer to reach a number.',
    '',
    'Use only the moods listed above, spelled as they are written there.',
    '',
    'Respond with JSON only, no prose and no markdown fences:',
    '{ "moods": ["..."] }',
  ].join('\n');
}

export function createMoodTagger(transport: MessageTransport): Tagger {
  return {
    model: MOOD_TAGGER_MODEL,
    async tag(record): Promise<TaggerReply> {
      let call;
      try {
        call = await callAnthropic(transport, {
          model: MOOD_TAGGER_MODEL,
          max_tokens: MOOD_TAGGER_MAX_TOKENS,
          output_config: { effort: EFFORT },
          messages: [{ role: 'user', content: buildMoodPrompt(record) }],
        });
      } catch (error) {
        /*
         * Only the API's own errors are a record that went unanswered; by
         * status or class, never message, which can carry request detail.
         * Anything else is a fault here and stops the run, the no-live-call
         * guard included.
         */
        if (error instanceof Anthropic.APIError) {
          return { ok: false, reason: `call failed: ${error.status ?? error.constructor.name}` };
        }
        throw error;
      }

      if (call.ranOutOfRoom) return { ok: false, reason: 'cut' };
      if (call.observed.stopReason === 'refusal') return { ok: false, reason: 'refused' };
      if (call.text === undefined) return { ok: false, reason: 'unreadable' };

      try {
        return { ok: true, payload: JSON.parse(stripFences(call.text)) };
      } catch {
        return { ok: false, reason: 'unreadable' };
      }
    },
  };
}

/** Models wrap JSON in fences despite being asked not to — §9.2 sees the same. */
function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

let shared: Tagger | undefined;

/**
 * The production tagger. `assertNoLiveCall` fires at the REQUEST SITE and
 * only for the real `fetch`, so a test reaching this path is refused by name
 * while an injected fake is not, as in every client here.
 */
export function getMoodTagger(): Tagger {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    shared = createMoodTagger({
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
