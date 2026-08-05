/**
 * Normalization for user-entered names that reach a UNIQUE index.
 *
 * Postgres compares text by CODE POINT, not by Unicode equivalence — verified
 * against the test database, where NFC "Björk" (5 chars) and NFD "Björk"
 * (6 chars) compare as unequal and both insert successfully. They then render
 * identically everywhere, so the collection ends up with two rows nobody can
 * distinguish and a filter on one silently misses the records tagged with the
 * other. `.trim()` addressed neither that nor characters that are invisible
 * rather than merely whitespace.
 *
 * Used by every reference resource, since all six have a name that must be
 * unique and human-comparable.
 */

/**
 * Maximum length of a name, in Unicode code points.
 *
 * SPEC.md §4.1 types these columns as TEXT with no limit, so this is an
 * application-level product decision, not a schema constraint — the previous
 * `.max(100)` was an invented number with no stated basis, which is why it is
 * replaced by a named constant with this note rather than a different invented
 * number.
 *
 * The only hard limit is the btree index's ~2704-byte row cap (a third of the
 * 8KB page); 200 code points cannot approach that even at 4 bytes each. 200 is
 * chosen as comfortably longer than any real artist, label, genre or tag name
 * — "The Chemical Brothers", "Dischord Records", "UK first-wave punk" — while
 * still rejecting a paragraph pasted into a name field by mistake. Raise it
 * freely if a real name is ever refused; nothing depends on the specific value.
 */
export const NAME_MAX_LENGTH = 200;

/**
 * Characters removed outright: invisible, and so capable of making two
 * different names render identically.
 *
 *   U+00AD          soft hyphen
 *   U+200B-200F     ZWSP, ZWNJ, ZWJ, LRM, RLM
 *   U+2028-2029     line/paragraph separators
 *   U+202A-202E     bidirectional embedding/override
 *   U+2060-2064     word joiner, invisible operators
 *   U+2066-2069     bidirectional isolates
 *   U+FEFF          BOM / zero-width no-break space
 *   U+0000-001F,    C0 and C1 controls (tab/newline handled
 *   U+007F-009F     as separators below, not deleted)
 *
 * Bidirectional controls matter beyond duplicates: they reorder rendering, so a
 * stored name can display as something other than what it is.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;

/**
 * Whitespace that is a genuine separator but not a plain space — non-breaking
 * space, en/em spaces, ideographic space. Converted rather than deleted:
 * deleting the space in "first show" would silently join two words.
 */
const EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t\n\r]/gu;

/**
 * Normalizes a user-entered name to its canonical comparable form.
 *
 * Order is deliberate and each step depends on the previous one:
 *   1. NFKC — canonical AND compatibility folding, so "Ｓｉｇｎｅｄ" and "ﬁrst"
 *      collapse to their ordinary forms. NFC alone leaves those distinct while
 *      they render as ordinary text.
 *   2. Strip invisibles — after normalization, since NFKC can itself introduce
 *      or reposition combining marks.
 *   3. Fold exotic whitespace to plain spaces.
 *   4. Collapse runs of spaces and trim — last, so whitespace introduced by
 *      steps 2 and 3 is also collapsed.
 *
 * Idempotent: cleanName(cleanName(x)) === cleanName(x). That is required rather
 * than incidental, because a stored name is compared against a freshly cleaned
 * one on every lookup — if cleaning were not idempotent, a stored name could
 * stop matching itself. Asserted in text.test.ts.
 */
export function cleanName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(EXOTIC_SPACE, ' ')
    .replace(/ {2,}/gu, ' ')
    .trim();
}

/** Length in code points, not UTF-16 units: '🎁' is one character to a user
 * but two units, and measuring .length would reject a name of half the stated
 * size. */
export function nameLength(value: string): number {
  return [...value].length;
}
