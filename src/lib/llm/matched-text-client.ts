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
 * where the fame bias sits. The marks and the unknowns live in the review file, not the schema. The ABOUT may be used,
 * but it is model-written, so anything resting on it is inferred (16 Nov): told it was no source, the model used it
 * anyway and marked it supported, which inverted the one signal Adam reads by.
 *
 * Description writing stays on Anthropic's key, locally (the coordinator, 14 Nov), as the ABOUT drafts are made.
 */
const MODEL = 'claude-opus-5';
export const MATCHED_TEXT_MAX_TOKENS = 16_000;
/* Medium, not the snippet's low: drafting runs once per record, offline, where a concrete and correct description matters more than the seconds, unlike the pick on the phone. */
const MATCHED_TEXT_EFFORT: Effort = 'medium';

export type MatchedTextSubject = { artist: string; title: string; year: number | null; about: string | null };
export type Sentence = { text: string; basis: 'supported' | 'inferred' };
export type MatchedTextResult =
  | ({ ok: true; text: string | null; sentences: Sentence[]; unknown: string[]; dropped: string[] } & Observed)
  | ({ ok: false; reason: 'cut' | 'unreadable' } & Observed);

const Reply = z.object({
  sentences: z.array(z.object({ text: z.string(), basis: z.enum(['supported', 'inferred']) })),
  unknown: z.array(z.string()),
});

/*
  The shape of a sentence about the material rather than the record (17 Nov): it names the material, negates, and uses
  a telling verb ("that is not something this material tells you"). Run over the 55's 440 sentences it matched that one
  sentence and no other; "no sung lyric credited" and "all credited" name the credits without a negation and a verb.
*/
const describesTheMaterial = (text: string) =>
  /\b(material|tracklist|credits|information|listing)\b/i.test(text) && /\b(not|cannot)\b|n[’']t\b/i.test(text) &&
  /\b(tell|tells|say|says|give|gives|show|shows|specify|specifies|indicate|indicates|supply|supplies|reveal|reveals|state|states|record|records|list|lists)\b/i.test(text);

export function buildMatchedTextPrompt(subject: MatchedTextSubject, facts: ReleaseFacts | null): string {
  const tracks = facts === null || facts.tracks.length === 0 ? 'none supplied' : facts.tracks.map((t) => `${t.position} ${t.title}`).join('\n');
  const releaseCredits = (facts?.credits ?? []).map((c) => `${c.name}: ${c.role}`);
  /* Each track's credits under its position, where a release's performers usually are (15 Nov). */
  const trackCredits = (facts?.trackCredits ?? []).map((c) => `${c.position}: ${c.name}, ${c.role}`);
  const credits = releaseCredits.length + trackCredits.length === 0
    ? 'none supplied'
    : [...releaseCredits, ...(trackCredits.length === 0 ? [] : ['On each track, by position:', ...trackCredits])].join('\n');
  return [
    `Describe how this record sounds, so that someone asking for music to play can be matched to it: ${subject.artist}, "${subject.title}"${subject.year === null ? '' : ` (${subject.year})`}.`,
    '',
    'Write concretely: the instruments, the pace, the density, the dynamics, and how the record changes across a side and between sides. Where the sides differ, say how; a record that changes across its sides is two answers. Give the variation and the exceptions, never an average: "mostly quiet, with two abrasive tracks", "side one instrumental and loose, side two slower and wearier". Not a pile of mood adjectives: say what is playing and how, and use a feeling-word only where the sound you have described carries it.',
    '',
    'Where you do not know something, leave it out. Never guess, and never fill a gap with plausible language. List what you could not describe under "unknown".',
    '',
    'Never write a number the material below does not give: no durations, tempos, track counts or ensemble sizes from your own knowledge. Describe them in words instead where you can: "mid-tempo", "sparse", "a large orchestra", "builds slowly over a long side".',
    '',
    'Write six to eight sentences, chosen by what someone asking for music could reach: how it sounds and the occasion it suits, how it changes across a side and between sides, and whether it wants attention or sits in the background. Include personnel, format and sequence detail only where it bears on how the record sounds; the rest belongs elsewhere. A mastering, lacquer, design or label credit is never worth a sentence.',
    '',
    'Write each point as a whole sentence that carries its own qualification, so it can be quoted alone without saying more than it means. Mark a sentence "supported" only where the tracklist, the credits or the format below supports everything it says, and "inferred" where any of it rests on your own knowledge of the record or on the ABOUT.',
    '',
    `The record's ABOUT. You may use it, but it was written by a model from this material and its own knowledge, so anything resting on the ABOUT is marked "inferred", never "supported".\n${subject.about ?? 'none'}`,
    '',
    'Never write a sentence about what the material does not say or does not tell you: that goes under "unknown" and nowhere else. A sentence never asserts what you list under "unknown". Call the sides side one, side two, side three and side four, never side A or side B.',
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
      const all = parsed.sentences.map((s) => ({ text: s.text.trim(), basis: s.basis })).filter((s) => s.text !== '');
      /* A sentence about the material's silence is not a claim about the record (17 Nov); it is dropped, and reported. */
      const sentences = all.filter((s) => !describesTheMaterial(s.text));
      const dropped = all.filter((s) => describesTheMaterial(s.text)).map((s) => s.text);
      /* No sentence is blank, NULL in the store (§4.6), never an empty text. */
      return { ok: true, text: sentences.length === 0 ? null : sentences.map((s) => s.text).join(' '), sentences, unknown: parsed.unknown, dropped, ...observed };
    },
  };
}

/**
 * The production transport, exported so the drafting script's measure mode can wrap it and read each response's shape
 * (15 Nov): what it sends is what drafting sends. A test reaching the real network is refused by name at the request site.
 */
export function matchedTextTransport(options: { fetch?: typeof fetch } = {}): { create: MessageCreate } {
  /* An injected fetch is the test's seam onto the real request body; production runs on the global one, which the guard watches. */
  const used = options.fetch ?? globalThis.fetch;
  const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: used });
  return {
    create: async (request: AnthropicRequest) => {
      if (usesRealNetwork(used)) assertNoLiveCall('https://api.anthropic.com/v1/messages');
      /* output_config sent (15 Nov): dropped here, every call ran at the model's default effort, high on claude-opus-5, whatever was asked. */
      return sdk.messages.create({ model: request.model, max_tokens: request.max_tokens, output_config: request.output_config, messages: request.messages } as never) as unknown as Promise<{ content: Array<{ type: string; text?: string }> }>;
    },
  };
}

let shared: MatchedTextClient | undefined;

/** The production client. */
export function getMatchedTextClient(): MatchedTextClient {
  if (shared === undefined) shared = createMatchedTextClient(matchedTextTransport());
  return shared;
}
