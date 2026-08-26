import { z } from 'zod';

/**
 * SPEC.md §9.2's parse boundary.
 *
 * **Three outcomes, not two**, and keeping them apart is the point of this
 * module. "The model returned nothing", "the model returned something we could
 * not read", and "the model returned five and one was unusable" are different
 * facts about different failures. Collapsing them into an empty array is the
 * absent-versus-unknown shape this project keeps meeting — and here it would
 * tell a user their collection has no gaps when the truth is that a response
 * was truncated in transit.
 *
 * No `server-only`: this is a pure function over a string and its unit tests
 * import it directly.
 */

export type Suggestion = {
  artist: string;
  title: string;
  reason: string;
  genre: string;
};

/**
 * Why a response could not be read — SHAPE ONLY, never content.
 *
 * **Both halves matter.** The reason distinguishes a response that ran out of
 * room from one that finished and answered wrongly, which is the difference
 * between "retrying will stop at the same place" and "a retry is worth
 * something". The user is told which, not only the operator.
 *
 * **And nothing here quotes the response.** The prompt carries the user's
 * artists, labels and want-list titles (`collection-summary.ts`), so the reply
 * can echo them, and Vercel logs are readable by anyone with dashboard access.
 * `describeError` became a redacted projection for exactly this reason after R6
 * reproduced a credential reaching a log line — and a DELIBERATE log must not
 * get a weaker standard than an accidental one. So: lengths and positions, and
 * no text. `parse-suggestions.test.ts` pins it.
 */
export type ParseFailure = {
  ok: false;
  /**
   * `cut` — the JSON ended mid-structure, so the response stopped before it
   * finished. `malformed` — it parsed as JSON but is not the expected shape,
   * so the model finished and answered wrongly.
   */
  reason: 'cut' | 'malformed';
  /** How much text arrived, in characters. Shape, not content. */
  length: number;
};

export type ParseResult = { ok: true; suggestions: Suggestion[]; dropped: number } | ParseFailure;

const suggestionSchema = z.object({
  artist: z.string().trim().min(1),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  genre: z.string().trim().min(1),
});

const envelopeSchema = z.object({
  /**
   * `unknown` per item, deliberately: a malformed suggestion must not fail the
   * envelope, because A29d resolves a bad item per-suggestion rather than
   * per-response. Validating each one below is what produces the `dropped`
   * count.
   */
  suggestions: z.array(z.unknown()),
});

/**
 * Strips markdown fences and any prose around the JSON.
 *
 * §9.2 requires fences stripped. The preamble case is handled too — a model
 * that writes "Here you go:" before its fence has still returned a usable
 * answer, and refusing it discards a good response over a courtesy.
 *
 * Falls back to the whole string when no fence is present, so a clean
 * JSON-only response takes the same path.
 */
function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1] !== undefined) return fenced[1].trim();

  /*
   * No fence: take from the first brace to the last. A model that adds a
   * trailing sentence after bare JSON is the same courtesy in a different
   * costume, and `JSON.parse` would reject the whole thing.
   */
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) return raw.slice(first, last + 1);

  return raw.trim();
}

/**
 * Parses a §9.2 response against the user's own genre vocabulary (A29d).
 *
 * **What this catches: an INVENTED genre.** "Britpop" against a collection with
 * no such genre is a name the user does not have, and it is dropped.
 *
 * **What this does NOT catch: a FLATTENING.** `Punk` is one of the user's genre
 * names, so a suggestion tagged `Punk` validates even when every record sits at
 * a leaf beneath it. This docblock used to claim otherwise — that a model
 * flattening UK82 into "punk" "produces a name the hierarchy does not contain"
 * — which holds only while the parent is absent from the collection, and fails
 * for precisely the collections that have a hierarchy (R5's F2).
 *
 * Flattening is prevented in the PROMPT, which now renders each genre with its
 * parent so the model can see which term is which. Two mechanisms, two
 * failures; neither backs the other up.
 *
 * **Rejecting parents here was considered and refused.** "Nothing is tagged
 * Punk" describes the collection today, not a rule about it, and a parser that
 * dropped parent-tagged suggestions would silently delete correct answers for
 * any collection organised at the top level. Being wrong in the prompt costs a
 * weaker suggestion; being wrong here deletes a good one.
 */
export function parseSuggestions(raw: string, genreVocabulary: string[]): ParseResult {
  const candidate = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    /*
     * **`cut` versus `malformed`, decided from STRUCTURE rather than from the
     * error message.** A JSON syntax error's text is engine-specific prose; the
     * bracket balance is a fact about the document. An unclosed brace or
     * bracket means the text stopped before the structure did, which is what a
     * truncated response looks like — and is the hypothesis this whole unit
     * exists to confirm or kill.
     */
    return { ok: false, reason: isUnclosed(candidate) ? 'cut' : 'malformed', length: raw.length };
  }

  const envelope = envelopeSchema.safeParse(parsed);
  // Parsed cleanly but is not our shape: the model FINISHED and answered
  // wrongly, which is a different thing to tell the user.
  if (!envelope.success) return { ok: false, reason: 'malformed', length: raw.length };

  /*
   * Case- and whitespace-insensitive, mapping back to the USER's spelling.
   * "uk82" is their own genre typed differently, not a flattening — dropping it
   * would discard a correct suggestion over formatting, which is the opposite
   * error from accepting "punk" for UK82. What the UI renders is the user's
   * name, never the model's.
   */
  const canonical = new Map(genreVocabulary.map((name) => [name.trim().toLowerCase(), name]));

  const suggestions: Suggestion[] = [];
  let dropped = 0;

  for (const candidate of envelope.data.suggestions) {
    const item = suggestionSchema.safeParse(candidate);
    if (!item.success) {
      dropped += 1;
      continue;
    }

    const match = canonical.get(item.data.genre.trim().toLowerCase());
    if (match === undefined) {
      dropped += 1;
      continue;
    }

    suggestions.push({ ...item.data, genre: match });
  }

  return { ok: true, suggestions, dropped };
}

/**
 * Whether a JSON document ends with structure still open.
 *
 * Counts braces and brackets OUTSIDE string literals, honouring escapes — a
 * runout-like value containing `{` would otherwise be counted as structure, and
 * a trailing backslash would swallow the closing quote. Depth below zero means
 * more closers than openers, which is malformed rather than cut.
 */
function isUnclosed(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
  }

  // An unterminated string is also a stop mid-structure.
  return depth > 0 || inString;
}
