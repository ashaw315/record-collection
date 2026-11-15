import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import type { ReleaseFacts } from './about-grounding';
import type { MessageCreate } from './client';
import { callAnthropic, type AnthropicRequest, type Effort, type Observed } from './transport';

/**
 * **The matched text, drafted (SPEC §4.6; step 3, unit 4; the coordinator, 13 and 14 Nov).** The text the ask's model
 * pick reads for a record: what is playing, how fast, how dense, how loud, and how it changes across a side and between
 * sides, since Adam plays sides and a record that turns over is two answers. Concrete, never a pile of mood words: the
 * ABOUTs ranked by the phrases' own vocabulary, and feeling-words would only move that overlap around. What is not known
 * is left out, never filled with plausible language, which is how the ABOUTs became unusable for matching.
 *
 * Whole sentences, because the pick's claim check takes a whole stored sentence (14 Nov), each marked as resting on the
 * supplied Discogs material or inferred from the model's own knowledge, so Adam reads the inferred hardest: that is
 * where the fame bias sits. The marks and the unknowns live in the review file, not the schema. The ABOUT is given as
 * context only, so a mood in it is never restated as sound.
 *
 * Description writing stays on Anthropic's key, locally (the coordinator, 14 Nov), as the ABOUT drafts are made.
 */
const MODEL = 'claude-opus-5';
export const MATCHED_TEXT_MAX_TOKENS = 1_500;
/* Medium, not the snippet's low: drafting runs once per record, offline, where a concrete and correct description matters more than the seconds, unlike the pick on the phone. */
const MATCHED_TEXT_EFFORT: Effort = 'medium';

export type MatchedTextSubject = { artist: string; title: string; year: number | null; about: string | null };
export type Sentence = { text: string; basis: 'supported' | 'inferred' };
export type MatchedTextResult =
  | ({ ok: true; text: string | null; sentences: Sentence[]; unknown: string[] } & Observed)
  | ({ ok: false; reason: 'cut' | 'unreadable' } & Observed);

const Reply = z.object({
  sentences: z.array(z.object({ text: z.string(), basis: z.enum(['supported', 'inferred']) })),
  unknown: z.array(z.string()),
});

export function buildMatchedTextPrompt(subject: MatchedTextSubject, facts: ReleaseFacts | null): string {
  const tracks = facts === null || facts.tracks.length === 0 ? 'none supplied' : facts.tracks.map((t) => `${t.position} ${t.title}`).join('\n');
  const credits = facts === null || facts.credits.length === 0 ? 'none supplied' : facts.credits.map((c) => `${c.name}: ${c.role}`).join('\n');
  return [
    `Describe how this record sounds, so that someone asking for music to play can be matched to it: ${subject.artist}, "${subject.title}"${subject.year === null ? '' : ` (${subject.year})`}.`,
    '',
    'Write concretely: the instruments, the pace, the density, the dynamics, and how the record changes across a side and between sides. Where the sides differ, say how; a record that changes across its sides is two answers. Give the variation and the exceptions, never an average: "mostly quiet, with two abrasive tracks", "side one instrumental and loose, side two slower and wearier". Not a pile of mood adjectives: say what is playing and how, and use a feeling-word only where the sound you have described carries it.',
    '',
    'Where you do not know something, leave it out. Never guess, and never fill a gap with plausible language. List what you could not describe under "unknown".',
    '',
    'Write each point as a whole sentence that carries its own qualification, so it can be quoted alone without saying more than it means. Mark each sentence "supported" where the material below supports it, and "inferred" where it rests on your own knowledge of the record.',
    '',
    `The record's ABOUT, for context only. It is not a source of musical claims: do not restate its moods or its history as sound.\n${subject.about ?? 'none'}`,
    '',
    `Its tracklist, by position (a letter is a side):\n${tracks}`,
    '',
    `Its credits:\n${credits}`,
    '',
    `Its format: ${facts?.format ?? 'not supplied'}.`,
    '',
    'Answer with JSON only, in this shape: {"sentences": [{"text": "…", "basis": "supported" or "inferred"}], "unknown": ["…"]}',
  ].join('\n');
}

export type MatchedTextClient = { write: (subject: MatchedTextSubject, facts: ReleaseFacts | null, options?: { effort?: Effort }) => Promise<MatchedTextResult> };

/** Injectable over the transport, as the snippet's client is, so a stubbed reply runs the real parse with no socket. */
export function createMatchedTextClient(transport: { create: MessageCreate }): MatchedTextClient {
  return {
    async write(subject, facts, options = {}) {
      const { text, observed, ranOutOfRoom: cut } = await callAnthropic(transport, {
        model: MODEL,
        max_tokens: MATCHED_TEXT_MAX_TOKENS,
        output_config: { effort: options.effort ?? MATCHED_TEXT_EFFORT },
        messages: [{ role: 'user', content: buildMatchedTextPrompt(subject, facts) }],
      });
      /* Part of a description is worse than none: it would be stored as finished text. */
      if (cut) return { ok: false, reason: 'cut', ...observed };
      let parsed: z.infer<typeof Reply>;
      try {
        const raw = (text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
        parsed = Reply.parse(JSON.parse(raw));
      } catch {
        return { ok: false, reason: 'unreadable', ...observed };
      }
      const sentences = parsed.sentences.map((s) => ({ text: s.text.trim(), basis: s.basis })).filter((s) => s.text !== '');
      /* No sentence is blank, NULL in the store (§4.6), never an empty text. */
      return { ok: true, text: sentences.length === 0 ? null : sentences.map((s) => s.text).join(' '), sentences, unknown: parsed.unknown, ...observed };
    },
  };
}

let shared: MatchedTextClient | undefined;

/** The production client; a test reaching the real network is refused by name at the request site. */
export function getMatchedTextClient(): MatchedTextClient {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    shared = createMatchedTextClient({
      create: async (request: AnthropicRequest) => {
        if (usesRealNetwork(globalThis.fetch)) assertNoLiveCall('https://api.anthropic.com/v1/messages');
        return sdk.messages.create({ model: request.model, max_tokens: request.max_tokens, messages: request.messages }) as unknown as Promise<{ content: Array<{ type: string; text?: string }> }>;
      },
    });
  }
  return shared;
}
