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

export type ParseResult =
  | { ok: true; suggestions: Suggestion[]; dropped: number }
  | { ok: false; reason: 'unreadable' };

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
 * The vocabulary is what makes the response CHECKABLE rather than merely
 * plausible: the prompt constrains `genre` to the user's genre names, so a
 * model that flattens UK82 into "punk" produces a name the hierarchy does not
 * contain, and the flattening §9.2 forbids becomes mechanically detectable
 * rather than a hope about prompt-following.
 */
export function parseSuggestions(raw: string, genreVocabulary: string[]): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) return { ok: false, reason: 'unreadable' };

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
