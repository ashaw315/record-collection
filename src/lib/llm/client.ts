import Anthropic from '@anthropic-ai/sdk';
import { assertNoLiveCall, usesRealNetwork } from '@/lib/discogs/no-live-calls';
import type { CollectionSummary } from './collection-summary';
import { parseSuggestions, type Suggestion } from './parse-suggestions';

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

/**
 * §9.2's output budget.
 *
 * **This comment used to read "short by construction: §9.2 wants a handful of
 * suggestions, not an essay", and R5's live run contradicted it.** That run
 * returned 34 suggestions in 2994 output tokens and stopped on `end_turn` — the
 * model finished, it did not hit the ceiling. So 4000 is not "short", it is
 * simply where a full answer happens to fit, and "a handful" was the only place
 * in the codebase a count was written down (R5 finding 4).
 *
 * **§9.2 has no count limit and deliberately still does not.** Nothing in §9.2
 * or §5.8 bounds the number of suggestions, and adding a server-side slice would
 * discard output the account was already billed for. If a count is ever wanted
 * the honest place is the PROMPT — ask for N — which costs nothing and returns
 * what it asks for. Recorded rather than fixed, because 34 grouped-by-genre
 * suggestions were judged good on the one real run there has been.
 *
 * Exported so the snippet's budget can be compared against it: the two callers
 * share a client and need different ceilings (`SNIPPET_MAX_TOKENS`).
 */
export const GAP_ANALYSIS_MAX_TOKENS = 4_000;

/**
 * Placeholder tails and bodies, from the `.env.example` idiom rather than from
 * imagination: a value someone copied and did not fill in.
 *
 * **Deliberately narrow.** Each pattern must be something no real credential
 * could contain, because the cost of a false positive is a working deployment
 * with a dead feature — worse than the bug this closes. Anthropic keys are
 * opaque base64-ish strings, so English words joined by hyphens or underscores
 * are safe to reject; a bare `sk-ant-` prefix check would not be.
 */
const PLACEHOLDER_PATTERNS = [
  /your[-_ ]?(api[-_ ]?)?key/i,
  /put[-_ ]?your/i,
  /replace[-_ ]?me/i,
  /key[-_ ]?here/i,
  /^<.*>$/,
  /^(xxx+|placeholder|changeme|todo)$/i,
];

/**
 * Whether §9.2 and §10b can run at all.
 *
 * The key is optional at boot (`env/schema.ts`) so a missing one degrades one
 * feature rather than stopping the server. The cost of that choice is that the
 * absence must be caught HERE, at the point of use — otherwise it surfaces as
 * "Internal server error" for what is a deployment problem, sending the reader
 * to application logs for something the app could have named.
 *
 * **"Present" is not "usable", and R5's live run is why this is more than a
 * non-empty check.** `.env.local` held a 160-character placeholder beginning
 * `sk-ant-` and ending `-put-your-key-here`. It passed every test this function
 * used to apply, so the app claimed a rate-limit slot, built the collection
 * summary and sent it to an API that rejected the credential — surfacing as
 * `500 Internal server error` for a deployment fault the app could have named
 * before spending anything.
 *
 * **This cannot verify a key, and must not try.** Only a request can do that,
 * and a request costs money and a slot. What it can do is reject values that
 * are definitionally not credentials — which is exactly what the placeholder
 * was. A genuine key that is expired or revoked still passes here and is caught
 * at the call site by `isAuthFailure`; the two are complementary, not
 * alternatives.
 */
export function isAnthropicConfigured(): boolean {
  const key = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (key === '') return false;

  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Whether a thrown error is the API rejecting this deployment's credential.
 *
 * **401 and 403 only, and the narrowness is the point.** These are the two
 * statuses that mean "the request was never served", so the account was not
 * charged and the rate-limit slot can be refunded. A 429, a 529 overload or a
 * 500 all mean the request REACHED Anthropic and may well have been counted —
 * refunding those would let a failing call be retried without limit, which is
 * the opposite of what the quota protects.
 *
 * Reads `status` structurally rather than importing the SDK's error classes: the
 * route's tests inject failures through a mocked client, and requiring a real
 * `APIError` instance would make the tests assert the SDK's constructor rather
 * than this app's behaviour.
 */
export function isAuthFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403;
}

/**
 * The prompt. **This is the feature**, in the sense that everything else here
 * is transport — §12's own note says as much about this step.
 *
 * Two deliberate choices worth naming:
 *
 * **The genre vocabulary is the user's own, and the constraint on `genre` makes
 * an INVENTED genre checkable** — "Britpop" against a collection that has no
 * such genre is dropped by `parseSuggestions` (A29d).
 *
 * **It does not make a FLATTENING checkable, and this docblock used to say it
 * did** (R5's F2). `Punk` is one of the user's names, so a suggestion tagged
 * `Punk` validates even when every record sits at a leaf beneath it. What
 * prevents flattening is the HIERARCHY rendered below — each genre with its
 * parent, so the model can see which term is which — not the validation.
 *
 * **The scenes are not hard-coded.** CLAUDE.md §8 names five as EXAMPLES of a
 * distinction that matters; a prompt that listed them would flatten a
 * collection organised around dub or post-punk just as badly, in the other
 * direction. The hierarchy the user actually built is the vocabulary.
 */
export function buildPrompt(summary: CollectionSummary): string {
  /*
   * **A41: titles are rendered, so "already own" is checkable at record level.**
   * Withholding them made A29g's ownership rule unenforceable while the prompt
   * still asked the model to reason about ownership — which produced the same
   * already-owned suggestion twice in two runs.
   */
  const owned = summary.artists
    .map((a) => {
      const meta = a.genres.length > 0 ? `; ${a.genres.join(', ')}` : '';
      const titles = a.titles.length > 0 ? `: ${a.titles.join(', ')}` : '';
      return `- ${a.name} (${a.recordCount} records${meta})${titles}`;
    })
    .join('\n');

  const labels = summary.labels.map((l) => `- ${l.name} (${l.recordCount})`).join('\n');

  const wanted =
    summary.wantList.length === 0
      ? '(nothing on the want list)'
      : summary.wantList.map((w) => `- ${w.artist} — ${w.title} (priority ${w.priority})`).join('\n');

  /*
   * **The hierarchy, rendered so the relationship is legible** (R5's F2). A29d
   * says the prompt supplies it; it used to send `summary.genreVocabulary
   * .join(', ')`, a flat comma list, two paragraphs above an instruction not to
   * flatten a scene into a parent term. The model was told to respect a
   * structure it was never shown.
   *
   * A child names its immediate parent. A genre with no parent is listed plainly
   * — a flat collection is the common case and must not read as a tree whose
   * every node is a root.
   */
  const genreLines = summary.genres
    .map((g) => (g.parent === null ? `- ${g.name}` : `- ${g.name} (a kind of ${g.parent})`))
    .join('\n');

  return [
    'You are helping a collector find gaps in a vinyl collection.',
    '',
    'GENRES THEY ORGANISE BY:',
    genreLines,
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
    /*
     * Only sayable now the tree is rendered. It asks for the MOST SPECIFIC
     * genre rather than forbidding parents outright — a parent is a legitimate
     * answer for a collection organised at that level, and the validation
     * accepts one deliberately (see `parseSuggestions`).
     */
    'Where one of their genres is a kind of another, use the most specific one',
    'that fits. Answering with the parent when the record belongs to one of its',
    'children is the flattening this is asking you to avoid.',
    '',
    'Name records that are conspicuous absences given what they own — a',
    'foundational record of a scene they collect deeply, or a key release by a',
    'band adjacent to several they own.',
    '',
    /*
     * **A37: the count lives in the PROMPT** (SPEC §9.2, 2026-08-26).
     *
     * Measured rather than assumed: a real gap analysis over 17 records was
     * truncated with `out_tokens=4000` against a 4000 ceiling and only 1,533
     * input tokens, so the pressure is entirely output-side. With no count the
     * model returns as many as it judges warranted — R5 measured 34 — and that
     * grows with the collection, which is why raising `max_tokens` buys a few
     * more suggestions and fails again later.
     *
     * A server-side slice was rejected by R5 for a reason that still holds: it
     * discards output the account was already billed for.
     *
     * **"At most", never "exactly".** A quota to fill invites padding a short
     * list with weak suggestions, which is output produced to satisfy a number
     * rather than because the gap is real — the same failure shape as any
     * fabricated field.
     */
    'Give AT MOST SIX suggestions, the six most worth their attention. Fewer is',
    'correct when fewer are genuinely warranted — do not pad the list to reach',
    'six. Keep each reason to one sentence.',
    '',
    /*
     * **R5's finding 3, decided at the ARTIST level, because that is the only
     * level the payload can express.** The artists section carries a name, a
     * count and genre names — no record titles — so "do not recommend anything
     * they already own" could not be honoured at record level by either side.
     *
     * The want list is different and the asymmetry is deliberate: it carries
     * artist AND title, so a record-level prohibition there is checkable.
     */
    /*
     * **A41 (2026-08-26): titles are now sent, so this rule changed shape.**
     * A29g made "already owned" artist-level BECAUSE titles were withheld, then
     * asked the model to reason about ownership anyway — and it suggested a
     * record the collection contains, twice in two runs. The rule is now
     * enforceable at record level, the way the want-list prohibition already
     * was, so it is stated at record level.
     */
    'Each artist above is listed with the records they own. Do not recommend a',
    'record that appears there — that is checkable, and naming one wastes a',
    'suggestion. A DIFFERENT record by an artist they own is still a welcome',
    'suggestion.',
    /*
     * **The disclosure stays; its FRAMING changed** (Adam, 2026-08-26, on a
     * real suggestion). "Say so" produced reasons reading as an apology — "a
     * different record by an artist they own" — when that fact is the strongest
     * argument available: they demonstrably collect this artist and this record
     * is missing. A29g's disclosure requirement is unchanged, so nothing about
     * §9.2's honesty is traded; only the sentence the model writes.
     */
    /*
     * **The example is the load-bearing part, and the first version of it was
     * the defect** (found by Adam, 2026-08-26). It read "You own Miles Davis
     * but not this one" — and the model faithfully produced "You own one Miles
     * Davis but not the record that founded the Fusion lineage" about a record
     * he owns.
     *
     * "but not X" asserts non-ownership of a specific record, which THIS
     * PAYLOAD CANNOT SUPPORT: the artists list carries a name, a count and
     * genres, and no titles at all. The example licensed a claim the model had
     * no way to check.
     *
     * So the example now asserts only what is owned and spends the rest of the
     * sentence on why the record matters. That shape was already appearing in
     * good output — "You own Discharge but this is the UK82 album that defined
     * the scene" — so it is proven rather than hoped for.
     */
    'When that is what you are doing, make it the REASON rather than a caveat:',
    '"You own Discharge, and this is the album that defined their scene" is the',
    'point, not an admission.',
    '',
    /*
     * **Kept after A41, and the reason changed rather than disappearing.**
     * Titles are now sent, so a "you do not own X" claim is no longer a pure
     * guess. It is still the wrong sentence: the list is what they own, not an
     * inventory of everything they have ever owned or heard, so "you lack X"
     * over-reads it — and the shape produced a false claim once already. The
     * positive form needs no such caveat and reads better.
     */
    'Do not tell them which records they lack. The list shows what they own,',
    'not everything they have heard or once owned, so an absence there is not a',
    'fact about their shelves. Name what they own; say why THIS record earns',
    'its place. Do not write "but not this one", "but not the record that…", or',
    'anything else asserting a specific record is absent.',
    'Do not recommend anything already on their want list, which is listed',
    'with titles.',
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
}) => Promise<AnthropicResponse>;

/**
 * What the SDK returns, including the two fields the previous cast discarded.
 *
 * **`stop_reason` is the field that settles truncation**, and it was on every
 * response the client already received. Adam's live 502 could not be diagnosed
 * because it was thrown away at this type boundary — the evidence existed at
 * runtime and nothing kept it.
 */
type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  /** `max_tokens` means it ran out of room; `end_turn` means it finished. */
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
};

/**
 * A failure, plus what the transport observed about it.
 *
 * SHAPE ONLY — token counts, a stop reason and a length. Never response text:
 * the prompt carries the user's collection, so the reply can echo it, and these
 * fields are written to logs (see `ParseFailure`).
 */
export type GapAnalysisFailure = {
  ok: false;
  reason: 'cut' | 'malformed' | 'no-text';
  length: number;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** What the transport observed, carried on success and failure alike (A38). */
export type GapAnalysisUsage = {
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type GapAnalysisResult =
  | ({ ok: true; suggestions: Suggestion[]; dropped: number } & GapAnalysisUsage)
  | GapAnalysisFailure;

export type GapAnalysisClient = {
  analyse: (summary: CollectionSummary) => Promise<GapAnalysisResult>;
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
        max_tokens: GAP_ANALYSIS_MAX_TOKENS,
        output_config: { effort: EFFORT },
        messages: [{ role: 'user', content: buildPrompt(summary) }],
      });

      const text = response.content.find((block) => block.type === 'text')?.text;

      /*
       * Carried alongside every failure so the route can log WHY and tell the
       * user which failure it was. `stop_reason` is the one field that
       * distinguishes "ran out of room" from "finished and answered wrongly".
       */
      const observed = {
        stopReason: response.stop_reason ?? null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };

      /*
       * No text block is UNREADABLE, not empty — the same distinction the
       * parser draws, one layer up. A response carrying only a refusal or only
       * thinking has told us nothing about the collection's gaps, and reporting
       * that as "no gaps found" would be a confident lie.
       */
      if (text === undefined) {
        return { ok: false, reason: 'no-text', length: 0, ...observed };
      }

      const parsed = parseSuggestions(text, summary.genreVocabulary);

      /*
       * **`observed` on BOTH branches**, and the previous version of this line
       * is the defect A38 fixes: `parsed.ok ? parsed : {...parsed, ...observed}`
       * dropped usage on success, so a completed run recorded nothing and the
       * headroom estimate had no baseline to be checked against.
       */
      return { ...parsed, ...observed };
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
        }) as unknown as Promise<AnthropicResponse>;
      },
    });
  }

  return shared;
}
