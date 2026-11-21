import type { ReleaseFacts } from './about-grounding';

/**
 * **Whether the record's material could in principle bear on a sentence (the coordinator, 21 Nov): the denominator of
 * an ABOUT audit.** The adversarial pass's material kind can only fire where the tracklist, the credits, the label, the
 * companies or the format reach; an ABOUT's claims about when a scene opened or how a record was received are beyond
 * it, so the two counts are read beside how many sentences were checkable at all. Mechanical and loose on purpose: a
 * sentence bears when it names a track, a credited person (release or track credits), the label, a company, one of the
 * format's words, a side, or a position. With no material nothing bears. This is a count of reach, never a verdict.
 */
const loose = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

const SIDE_OR_POSITION = /\b(?:side (?:one|two|three|four|a|b|c|d|\d)|[a-f]\d{1,2}|opens with|opener|opening track|closes with|closing track|closer|the last track|the first track|track \d+)\b/i;
const GENERIC_FORMAT = /\b(?:mono|stereo|gatefold|LP|EP|7"|10"|12"|45|78|single|double album|2 ?x ?LP|picture disc|reissue|repress|limited edition)\b/i;

export function bearing(sentence: string, facts: ReleaseFacts | null): boolean {
  if (facts === null) return false;
  const text = loose(sentence);
  const has = (value: string | null | undefined) => value !== null && value !== undefined && value.trim() !== '' && text.includes(loose(value));
  if (facts.tracks.some((t) => has(t.title))) return true;
  if (facts.credits.some((c) => has(c.name))) return true;
  if ((facts.trackCredits ?? []).some((c) => has(c.name))) return true;
  if (has(facts.label)) return true;
  if (facts.companies.some((c) => has(c.name))) return true;
  if (facts.format !== null && (GENERIC_FORMAT.test(sentence) || facts.format.split(',').map((w) => w.trim()).some((w) => w.length > 2 && has(w)))) return true;
  if (SIDE_OR_POSITION.test(sentence)) return true;
  return false;
}

export function bearingCount(sentences: readonly string[], facts: ReleaseFacts | null): { bearing: number; of: number } {
  return { bearing: sentences.filter((s) => bearing(s, facts)).length, of: sentences.length };
}
