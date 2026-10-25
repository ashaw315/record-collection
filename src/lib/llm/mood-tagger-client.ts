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

/**
 * The record is named by artist and title only. **No year** (24 Oct): on a
 * quarter of the collection the year held is the pressing's, not the
 * album's, and a mood does not depend on it.
 */
export function buildMoodPrompt(record: RecordToTag): string {
  return [
    'A record collector picks what to play by mood. Which of these moods does',
    'this record honestly suit?',
    '',
    `THE RECORD: ${record.artist} — ${record.title}`,
    '',
    'THE MOODS:',
    ...MOODS.map((mood) => `- ${mood}`),
    '',
    /*
     * The first run's definition, by its own result (24 Oct): "zone out" came
     * back on 15 of 22 records, so pressing it alone answered with most of the
     * collection.
     */
    'One mood needs a closer reading: "zone out" means a record that invites you to disappear into it,',
    'not one that is merely atmospheric or laid-back.',
    '',
    /*
     * §7.12: never a flat count, and never padding. The first run said "most
     * records suit two to four", and the model found a second mood for
     * records with one honest one (The Doors' debut came back "dancing"). So
     * no number is named, and fewer is preferred where fewer are true.
     */
    'Choose only the moods that genuinely fit the music. Prefer fewer: one',
    'honest mood is a better answer than two where the second is a reach, and',
    'four is right when four are true. Never pad the answer to reach a number.',
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
