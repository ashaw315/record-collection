/**
 * **Assertion 13: a test a target names exists** (scripts/ASSERTIONS-spec.md, DESIGN-RULES).
 *
 * A sentence in a build target in the stated form, "the test asserts", "the test sets" or
 * "the test clicks", is paired with a `@target §SECTION "phrase"` marker in a test file. It
 * shows the test exists, and not that it checks what the sentence says: 8a §18's test exists
 * and reads three records where its sentence says the fixture, and this passes it.
 *
 * Pure, so the rule can be tested without the whole index. check-index.mjs does the reading.
 */
const FORM = /\bthe test (?:asserts|sets|clicks)\b/i;
const LOOSE = /\b(?:a test (?:sets|that|asserts)|test that|asserts? |asserted )/gi;
const MARKER = /@target\s+§([\w.]+)\s+(?:"([^"]+)"|'([^']+)')/g;

/** Case, hyphens, dashes, curly quotes and non-breaking spaces: "reduced motion" once missed "reduced-motion". */
export const normalise = (text) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-‐-― ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/);

/** Each in-form sentence of the sections given, as `{ id, text }`. */
export const inFormSentences = (sections) =>
  sections.flatMap(({ id, text }) => sentencesOf(text).filter((s) => FORM.test(s)).map((sentence) => ({ section: id, sentence })));

export const markersIn = (file) => [...file.matchAll(MARKER)].map((m) => ({ section: m[1], phrase: m[2] ?? m[3] }));

/** `armed` is whether every in-form sentence was paired at the last commit: the transition needs no owner. */
export function verdict(sentences, markers, armed) {
  const isPaired = ({ section, sentence }) => markers.some((m) => m.section === section && normalise(sentence).includes(normalise(m.phrase)));
  const unpaired = sentences.filter((s) => !isPaired(s));
  return { paired: sentences.length - unpaired.length, total: sentences.length, unpaired, fails: armed && unpaired.length > 0 };
}

/** Test sentences outside the form, a count for the report and no rule. */
export const loose = (text) =>
  sentencesOf(text)
    .filter((s) => !FORM.test(s))
    .reduce((n, s) => n + (s.match(LOOSE)?.length ?? 0), 0);
