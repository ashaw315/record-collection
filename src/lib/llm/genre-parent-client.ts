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
 * SPEC.md §12c (A44) — proposing parents for a flat genre vocabulary.
 *
 * **Suggest, never assign.** CLAUDE.md §8 protects this vocabulary specifically:
 * UK first-wave punk, UK82, US hardcore, horror punk and psychobilly are
 * different scenes, and a model silently assigning parents would make the result
 * the model's taxonomy wearing the user's names. The app proposes; the user
 * confirms or rejects; nothing is written that was not confirmed.
 *
 * **Why this exists at all:** §4.1 specifies `parent_genre_id` and the live
 * collection has 34 genres with 2 parents. Assigning them is a manual edit per
 * genre, and 32 of 34 were never done — the friction IS the justification.
 */

/** The model, and the ceiling — see A37 for why a count lives in the prompt. */
const MODEL = 'claude-opus-5';

/**
 * A whole tree for ~34 genres is a short JSON document; 2,000 leaves room for
 * low-effort thinking and a pairing per genre, well under §9.2's 4,000.
 *
 * **A truncated tree is REFUSED, and the reasoning is its own rather than
 * inherited from the snippet** (Adam, 2026-08-27).
 *
 * The snippet refuses a cut response because a half-sentence is visibly wrong
 * prose sitting in a field the user may take ownership of. **This is a different
 * argument and a stronger one: a partial taxonomy is invisibly incomplete.**
 *
 * A user shown eleven pairings from a tree that was cut at eleven would accept
 * the good ones without knowing the list was truncated — and every genre that
 * never got proposed would look like a genre the model had nothing to say about.
 * **That is absent-versus-unknown, and unlike every other instance of it in this
 * app, the mistake does not sit on a screen: it is baked into the vocabulary
 * §8 protects, by the user's own confirmed clicks.**
 *
 * Same conclusion as the snippet, different argument, and the difference is why
 * this is written down rather than left as inherited behaviour.
 */
export const GENRE_PARENT_MAX_TOKENS = 2_000;

/**
 * **Low**, like the snippet and unlike §9.2's gap analysis. Grouping named
 * genres under named parents is recall about music, not reasoning across a
 * collection — and `max_tokens` bounds thinking PLUS output, which is what cut
 * two snippets at ~80 tokens under a 400 ceiling.
 */
const EFFORT = 'low' as const;

export type GenreInput = { name: string; recordCount: number; examples: string[] };

export type GenreParentResult =
  | ({
      ok: true;
      pairings: Array<{ genre: string; parent: string }>;
      /** Genres the model says nothing existing can parent — a RESULT, not silence. */
      noParentFits: string[];
      /** Pairings discarded for naming a genre the user does not have (A29d's shape). */
      dropped: number;
    } & Observed)
  | ({ ok: false; reason: 'cut' | 'unreadable' } & Observed);

const responseSchema = z.object({
  pairings: z
    .array(z.object({ genre: z.string(), parent: z.string() }))
    .optional()
    .default([]),
  noParentFits: z.array(z.string()).optional().default([]),
});

/**
 * The prompt, and every constraint in it is a decision recorded in §12c.
 *
 * **Genres carrying no records are INCLUDED**, deliberately: `Punk` and
 * `US Hardcore` carry zero and exist because the user created them as intended
 * parents. They are the parents the tree needs, and dropping them for lack of
 * evidence would remove the answer.
 */
export function buildGenreParentPrompt(genres: GenreInput[]): string {
  const listed = genres
    .map((genre) => {
      const examples = genre.examples.length > 0 ? ` — e.g. ${genre.examples.join('; ')}` : '';
      return `- ${genre.name} (${genre.recordCount} records)${examples}`;
    })
    .join('\n');

  return [
    'A record collector organises their collection with these genres. Some are',
    'broad and some name a specific scene. Propose which genres belong UNDER',
    'which other genres, as a hierarchy.',
    '',
    'THE COLLECTOR’S GENRES:',
    listed,
    '',
    /*
     * §8, stated to the model in the terms the project uses. The scenes are not
     * interchangeable and flattening them is the failure this app most wants to
     * avoid — so the instruction names the distinction rather than asking
     * vaguely for care.
     */
    'These are music scenes, not loose labels: UK first-wave punk, UK82, US',
    'hardcore, horror punk and psychobilly are different scenes with different',
    'sounds. Nest the specific under the general where that is genuinely true',
    'of the music — never merely because two names share a word.',
    '',
    /*
     * The vocabulary constraint. `parent` MUST be one of the names above, and
     * the parser enforces it regardless (A29c: an instruction is not a
     * verification).
     */
    'Use ONLY the genres listed above, as both child and parent. Do not invent',
    'a genre, and do not create a parent that is not already in the list — the',
    'vocabulary is the collector’s, not yours.',
    '',
    /*
     * **The edge case the constraint would otherwise turn into a lie** (Adam).
     * Told to use existing names only, a model facing a genre nothing parents
     * must either propose something wrong or stay silent — and silence is
     * indistinguishable from having no opinion.
     */
    'If a genre needs a parent and no existing genre fits, say so by listing it',
    'in "noParentFits" rather than forcing a poor match. That is a useful',
    'answer, not a failure.',
    '',
    'A genre with no records is not a mistake — it may be a parent the collector',
    'created and never nested anything under. Those are often exactly the',
    'parents to use.',
    '',
    'Leave a genre out of both lists if it is already general enough to sit at',
    'the top level.',
    '',
    'Respond with JSON only, no prose and no markdown fences:',
    '{ "pairings": [{ "genre": "...", "parent": "..." }], "noParentFits": ["..."] }',
  ].join('\n');
}

export type GenreParentClient = {
  propose: (genres: GenreInput[]) => Promise<GenreParentResult>;
};

export function createGenreParentClient(transport: MessageTransport): GenreParentClient {
  return {
    async propose(genres) {
      /*
       * **Through `callAnthropic`, and this client is the proof of it.** A37's
       * bound and A38's diagnostics were fixed at the gap-analysis call site
       * during incidents, and the snippet — the second caller — shipped without
       * them for months. Nothing below calls `observeUsage`: usage and
       * `stop_reason` arrive because the transport returns them.
       */
      const { text, observed, ranOutOfRoom } = await callAnthropic(transport, {
        model: MODEL,
        max_tokens: GENRE_PARENT_MAX_TOKENS,
        output_config: { effort: EFFORT },
        messages: [{ role: 'user', content: buildGenreParentPrompt(genres) }],
      });

      // A partial taxonomy is worse than none — see the ceiling's docblock.
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
       * **The prompt asks; this ENFORCES** (A29c: an instruction is not a
       * verification). A pairing naming a genre the user does not have is
       * dropped whatever the prompt said — and the count is reported, because a
       * shorter list with no explanation makes the model's error invisible
       * (A29d).
       */
      const known = new Map(genres.map((genre) => [key(genre.name), genre.name]));
      const pairings: Array<{ genre: string; parent: string }> = [];
      let dropped = 0;

      for (const pairing of envelope.data.pairings) {
        const child = known.get(key(pairing.genre));
        const parent = known.get(key(pairing.parent));

        // Self-parenting is §4.1's cycle rule at its simplest, caught before it
        // reaches a user as a proposal they would have to reject.
        if (child === undefined || parent === undefined || child === parent) {
          dropped += 1;
          continue;
        }
        pairings.push({ genre: child, parent });
      }

      return {
        ok: true,
        pairings,
        // Mapped back to the user's own spelling, and unknown names dropped.
        noParentFits: envelope.data.noParentFits
          .map((name) => known.get(key(name)))
          .filter((name): name is string => name !== undefined),
        dropped,
        ...observed,
      };
    },
  };
}

/** Case- and whitespace-insensitive, mapping back to the user's spelling. */
const key = (name: string) => name.trim().toLowerCase();

/** Models wrap JSON in fences despite being asked not to — §9.2 sees the same. */
function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

let shared: GenreParentClient | undefined;

/**
 * The production client.
 *
 * `assertNoLiveCall` fires at the REQUEST SITE and only when the transport is
 * the real `fetch`, so a test reaching this path is refused loudly and by name
 * while an injected fake is not — the same shape as §9.2's and §10b's clients.
 */
export function getGenreParentClient(): GenreParentClient {
  if (shared === undefined) {
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    shared = createGenreParentClient({
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
