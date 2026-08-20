import { describe, expect, it } from 'vitest';
import { parseSuggestions } from './parse-suggestions';

/**
 * SPEC.md §9.2's parse boundary, and R5's enumerated cases are the test plan:
 * markdown fences, a truncated response, valid JSON of the wrong shape, an
 * empty array, and a `genre` outside the user's hierarchy (A29d).
 *
 * **A malformed response must be distinguishable from an empty one.** "The
 * model returned nothing" and "the model returned something we could not read"
 * are different facts, and collapsing them is the absent-versus-unknown failure
 * this project keeps meeting. Hence a tagged result rather than an array that
 * is empty in both cases.
 */

const VOCABULARY = ['UK82', 'Hardcore', 'Punk'];

const ONE = {
  artist: 'Anti-Cimex',
  title: 'Raped Ass',
  reason: 'Swedish käng built directly on the UK82 template you collect.',
  genre: 'UK82',
};

const wrap = (value: unknown) => JSON.stringify({ suggestions: [value] });

describe('the happy path', () => {
  /** Fails against: a parser that rejects well-formed input. */
  it('parses a clean response', () => {
    const result = parseSuggestions(wrap(ONE), VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toEqual([ONE]);
    expect(result.dropped).toBe(0);
  });
});

describe('markdown fences', () => {
  /**
   * Fails against: a parser that does not strip fences — §9.2 requires it
   * explicitly, and a fenced response is the single most common way a model
   * returns JSON.
   */
  it.each([
    ['```json\n{"suggestions":[]}\n```', 'json-tagged'],
    ['```\n{"suggestions":[]}\n```', 'bare'],
    ['  ```json\n{"suggestions":[]}\n```  ', 'padded'],
  ])('strips %s fences', (body) => {
    const result = parseSuggestions(body, VOCABULARY);

    expect(result.ok).toBe(true);
  });

  /**
   * Fails against: removing the fence stripper and relying on the brace-slicing
   * fallback alone.
   *
   * **Was a probe, committed per CLAUDE.md §2.** Deleting the fence regex passed
   * all 19 tests, because slicing from the first `{` to the last `}` handles
   * every fenced case the other tests use — so the mutation looked like dead
   * code. It is not: prose CONTAINING A BRACE breaks brace-slicing and the fence
   * survives it. Measured both ways before concluding either.
   *
   * A model signing off with "Hope that helps! {smile}" is not exotic, and
   * without this the fallback would take the last brace from the sign-off and
   * fail to parse a response that was perfectly good.
   */
  it.each([
    ['trailing prose with a brace', '```json\n{"suggestions":[]}\n```\nHope that helps! {smile}'],
    ['a preamble with a brace', 'Note: use {} for empty.\n```json\n{"suggestions":[]}\n```'],
  ])('reads fenced JSON despite %s', (_name, body) => {
    const result = parseSuggestions(body, VOCABULARY);

    expect(result.ok).toBe(true);
  });

  /**
   * Fails against: a fence-stripper that also mangles prose around the JSON.
   *
   * A model that says "Here is the analysis:" before its fence is not returning
   * JSON-only, but the JSON is still there and still good. Refusing it discards
   * a usable answer over a preamble.
   */
  it('finds the JSON when the model adds a preamble', () => {
    const result = parseSuggestions(`Here you go:\n\n\`\`\`json\n${wrap(ONE)}\n\`\`\``, VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toHaveLength(1);
  });
});

describe('failures that are not the same failure', () => {
  /**
   * Fails against: a parser that throws, or that returns an empty list.
   *
   * **The distinction R5 asks for.** A truncated response is unreadable, and
   * reporting it as "no suggestions" tells the user the model had nothing to
   * say when in fact the app could not read the answer.
   */
  it('a truncated response is malformed, not empty', () => {
    const result = parseSuggestions('{"suggestions":[{"artist":"Anti-Cim', VOCABULARY);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('unreadable');
  });

  /**
   * Fails against: a parser accepting any JSON at all.
   *
   * Valid JSON of the wrong shape — R5's third case. `{"results": [...]}` parses
   * perfectly and is not what §9.2 specified.
   */
  it.each([
    ['{"results":[]}', 'wrong envelope key'],
    ['{"suggestions":"nope"}', 'suggestions not an array'],
    ['[]', 'a bare array'],
    ['"a string"', 'a bare string'],
    ['null', 'null'],
  ])('rejects %s as malformed', (body) => {
    const result = parseSuggestions(body, VOCABULARY);

    expect(result.ok).toBe(false);
  });

  /**
   * Fails against: collapsing an empty result into a failure.
   *
   * The other half of the same distinction. An empty array is a SUCCESSFUL
   * response saying "no gaps found" — a legitimate answer for a complete
   * collection, and the user must be told that rather than shown an error.
   */
  it('an empty array is a success with nothing in it', () => {
    const result = parseSuggestions('{"suggestions":[]}', VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toEqual([]);
    expect(result.dropped).toBe(0);
  });
});

describe('per-suggestion validation', () => {
  /**
   * Fails against: whole-response rejection on one bad item, and against
   * silently dropping it.
   *
   * A29d: a `genre` outside the hierarchy is valid JSON of the wrong shape, and
   * the resolution is per-suggestion — one bad genre in five is not a reason to
   * discard four good ones. But the drop must be REPORTED: a shorter list with
   * no explanation makes the model's error invisible.
   */
  it('drops a suggestion whose genre is outside the hierarchy, and counts it', () => {
    const body = JSON.stringify({
      suggestions: [ONE, { ...ONE, artist: 'Some Band', genre: 'Punk Rock' }],
    });

    const result = parseSuggestions(body, VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].artist).toBe('Anti-Cimex');
    expect(result.dropped).toBe(1);
  });

  /**
   * Fails against: a genre check that is case- or whitespace-sensitive.
   *
   * "uk82" is the user's own genre with different capitalisation, not a
   * flattening. Dropping it would discard a correct suggestion over a
   * formatting difference — the opposite error from accepting "punk" for UK82.
   */
  it('matches the vocabulary case-insensitively', () => {
    const result = parseSuggestions(wrap({ ...ONE, genre: ' uk82 ' }), VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toHaveLength(1);
    // Normalised to the user's own spelling, not the model's.
    expect(result.suggestions[0].genre).toBe('UK82');
  });

  /**
   * Fails against: accepting a suggestion missing a required field.
   *
   * Each field is rendered, so an absent one is a blank in the UI. Dropped for
   * the same reason and counted the same way.
   */
  it.each([['artist'], ['title'], ['reason'], ['genre']])(
    'drops a suggestion missing %s',
    (field) => {
      const incomplete: Record<string, unknown> = { ...ONE };
      delete incomplete[field];

      const result = parseSuggestions(wrap(incomplete), VOCABULARY);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.suggestions).toEqual([]);
      expect(result.dropped).toBe(1);
    },
  );

  /**
   * Fails against: a parser that reports success when EVERY suggestion was
   * dropped without saying so.
   *
   * All four dropped is not the same as the model returning nothing, and the
   * count is what keeps them distinguishable — the same absent-versus-unknown
   * line the malformed/empty split draws, one level down.
   */
  it('reports the count when every suggestion is dropped', () => {
    const body = JSON.stringify({
      suggestions: [
        { ...ONE, genre: 'Nope' },
        { ...ONE, genre: 'Also nope' },
      ],
    });

    const result = parseSuggestions(body, VOCABULARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toEqual([]);
    expect(result.dropped).toBe(2);
  });
});
