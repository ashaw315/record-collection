import Anthropic from '@anthropic-ai/sdk';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import type { CollectionSummary } from './collection-summary';
import { parseSuggestions, type ParseResult } from './parse-suggestions';

/**
 * SPEC.md §9.2's Anthropic client, and the prompt that is the feature.
 *
 * **The model is `claude-opus-5`, and the reason is capability rather than
 * inheritance.** Recorded here so a future cost pass sees the argument instead
 * of an unexplained string:
 *
 * This feature lives or dies on the quality of MUSICAL REASONING. §9.2 and
 * CLAUDE.md §8 both make the same demand — UK first-wave punk, UK82, US
 * hardcore, horror punk and psychobilly are different scenes with different
 * sounds, and a suggestion that flattens them into "punk" is worse than no
 * suggestion, because it is confidently misleading about the thing this app
 * exists to get right. That is a capability purchase, not a convenience one.
 *
 * And the volume makes cost close to irrelevant: §9.2 caps this at ten requests
 * an hour for one person, with a short prompt and a short response. A cheaper
 * model would save pennies a day and risk the only quality that matters here.
 *
 * If a future cost pass revisits this, the question to ask is not "is Opus
 * expensive" but "does a cheaper model keep UK82 and US hardcore apart" —
 * measurable against real suggestions, and the only evidence that should move
 * this line.
 */
const MODEL = 'claude-opus-5';

/**
 * `high` rather than the default, for the same reason as the model.
 *
 * `output_config.effort` replaced the older `budget_tokens`, which current
 * models reject outright. Gap analysis is a reasoning task over an unfamiliar
 * collection, and this is the axis that buys reasoning depth.
 */
const EFFORT = 'high' as const;

/** Short by construction: §9.2 wants a handful of suggestions, not an essay. */
const MAX_TOKENS = 4_000;

/**
 * Whether §9.2 and §10b can run at all.
 *
 * The key is optional at boot (`env/schema.ts`) so a missing one degrades one
 * feature rather than stopping the server. The cost of that choice is that the
 * absence must be caught HERE, at the point of use — otherwise it surfaces as
 * "Internal server error" for what is a deployment problem, sending the reader
 * to application logs for something the app could have named.
 */
export function isAnthropicConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? '').trim() !== '';
}

/**
 * The prompt. **This is the feature**, in the sense that everything else here
 * is transport — §12's own note says as much about this step.
 *
 * Two deliberate choices worth naming:
 *
 * **The genre vocabulary is the user's own, and the constraint on `genre` is
 * what makes the response checkable rather than merely plausible.** A model
 * that flattens UK82 into "punk" produces a name the hierarchy does not
 * contain, so §9.2's genre-accuracy requirement becomes mechanically
 * detectable instead of a hope about prompt-following (A29d).
 *
 * **The scenes are not hard-coded.** CLAUDE.md §8 names five as EXAMPLES of a
 * distinction that matters; a prompt that listed them would flatten a
 * collection organised around dub or post-punk just as badly, in the other
 * direction. The hierarchy the user actually built is the vocabulary.
 */
export function buildPrompt(summary: CollectionSummary): string {
  const owned = summary.artists
    .map((a) => `- ${a.name} (${a.recordCount} records${a.genres.length > 0 ? `; ${a.genres.join(', ')}` : ''})`)
    .join('\n');

  const labels = summary.labels.map((l) => `- ${l.name} (${l.recordCount})`).join('\n');

  const wanted =
    summary.wantList.length === 0
      ? '(nothing on the want list)'
      : summary.wantList.map((w) => `- ${w.artist} — ${w.title} (priority ${w.priority})`).join('\n');

  return [
    'You are helping a collector find gaps in a vinyl collection.',
    '',
    'GENRES THEY ORGANISE BY:',
    summary.genreVocabulary.join(', '),
    '',
    'ARTISTS THEY ALREADY OWN:',
    owned,
    '',
    'LABELS IN THE COLLECTION:',
    labels,
    '',
    'ALREADY ON THEIR WANT LIST:',
    wanted,
    '',
    'Genre precision is the point of this task. The genres above distinguish',
    'scenes that are commonly flattened together — treat those distinctions as',
    'real and reason within them. Do not flatten a specific scene into a parent',
    'term: a recommendation whose reasoning collapses two of their genres into',
    'one is worse than no recommendation.',
    '',
    'Name records that are conspicuous absences given what they own — a',
    'foundational record of a scene they collect deeply, or a key release by a',
    'band adjacent to several they own. Do not recommend anything they already',
    'own or that is already on their want list; both lists are above.',
    '',
    'Prefer records you are confident exist, with the artist and title as',
    'actually released. If you are unsure a record exists, leave it out.',
    '',
    'Respond with JSON only, no prose and no markdown fences:',
    '{ "suggestions": [{ "artist": "...", "title": "...", "reason": "...", "genre": "..." }] }',
    '',
    'Each reason is one sentence and must name the specific scene or connection.',
    'Each genre must be one of the genre names listed above, exactly.',
  ].join('\n');
}

/** The one method this app needs, so a fake is three lines in a test. */
export type MessageCreate = (request: {
  model: string;
  max_tokens: number;
  output_config?: { effort: typeof EFFORT };
  messages: Array<{ role: 'user'; content: string }>;
}) => Promise<{ content: Array<{ type: string; text?: string }> }>;

export type GapAnalysisClient = {
  analyse: (summary: CollectionSummary) => Promise<ParseResult>;
};

/**
 * Injectable, like the Discogs and MusicBrainz clients before it: the fake is
 * exempt from the no-live-call guard because the guard fires at the REQUEST
 * SITE rather than at construction, which is what lets these tests exercise the
 * real parse path without a socket.
 */
export function createGapAnalysisClient(transport: { create: MessageCreate }): GapAnalysisClient {
  return {
    async analyse(summary) {
      const response = await transport.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: EFFORT },
        messages: [{ role: 'user', content: buildPrompt(summary) }],
      });

      const text = response.content.find((block) => block.type === 'text')?.text;

      /*
       * No text block is UNREADABLE, not empty — the same distinction the
       * parser draws, one layer up. A response carrying only a refusal or only
       * thinking has told us nothing about the collection's gaps, and reporting
       * that as "no gaps found" would be a confident lie.
       */
      if (text === undefined) return { ok: false, reason: 'unreadable' };

      return parseSuggestions(text, summary.genreVocabulary);
    },
  };
}

let shared: GapAnalysisClient | undefined;

/**
 * The production client.
 *
 * `assertNoLiveCall` fires here rather than at construction, and only when the
 * transport is the real `fetch` — so a test that reaches this path is refused
 * loudly and by name, while an injected fake is not.
 */
export function getGapAnalysisClient(): GapAnalysisClient {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    shared = createGapAnalysisClient({
      create: async (request) => {
        if (usesRealNetwork(globalThis.fetch)) {
          assertNoLiveCall('https://api.anthropic.com/v1/messages');
        }

        return sdk.messages.create({
          model: request.model,
          max_tokens: request.max_tokens,
          output_config: request.output_config,
          messages: request.messages,
        }) as unknown as Promise<{ content: Array<{ type: string; text?: string }> }>;
      },
    });
  }

  return shared;
}
