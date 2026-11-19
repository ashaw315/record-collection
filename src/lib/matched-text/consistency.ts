/**
 * **The self-consistency check (the coordinator, 18 Nov): a draft read against itself, with no model and no material.**
 * The adversarial pass flagged two errors a reader finds without the tracklist, because the draft contradicts itself:
 * Smerz's duo "perform and engineer everything themselves" two sentences before Kasper Marott and Peder Mannerfelt are
 * credited, and Whiteman's Cuban Overture "into the middle of the side" one sentence after that side is given two
 * pieces. The pass also showed it does not carry a finding across a draft (Hello Mary, 18 Nov), so this is mechanical.
 *
 * Three shapes, each a pair of sentences: an exclusivity claim beside a sentence naming someone it does not include; a
 * side given one or two pieces beside a track placed in that side's middle; and the two sides sized in opposite
 * directions. A draft consistent with itself and wrong is beyond it, and nothing here is confirmation of anything.
 */
export type Disagreement = { a: number; b: number; why: string };

/* A quoted title is not a name and not a claim; a single-quoted one opens after a space, which an apostrophe inside a word never does. */
const unquoted = (text: string) => text.replace(/"[^"]*"|“[^”]*”|(^|\s)'[^']*'(?=[\s,.;:]|$)/g, '$1""');

/* "everything themselves", "themselves ... all of it" (the Smerz redraft, 18 Nov), "themselves alone", "no one else": one claim in several wordings. */
const EVERYTHING = /\b(?:everything|all of it)\b[^.;]*\b(?:themselves|himself|herself)\b|\b(?:themselves|himself|herself)\b[^.;]*\b(?:everything|all of it)\b|\b(?:themselves|himself|herself)\s+(?:alone|entirely)\b|\bno(?:body| one) else\b/i;
/* Two or more capitalised words run together: a person's name as a draft writes one. A possessive stops at the apostrophe. */
const NAME = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/g;
const names = (text: string) => new Set(unquoted(text).match(NAME) ?? []);

const SIDE = '(one|two|three|four|five|six|[a-f]|\\d{1,2})';
/* A side said to hold one or two pieces, by a verb of holding; "opens with its one dark song" is not a count. */
const HOLDS = new RegExp(`\\bside ${SIDE}\\b (?:is given over (?:entirely )?to|holds|has|contains|carries|consists of|is made of|is|breaks [^.,;]*? into) (?:just |only )?(a single|one|two)\\b (?:\\w+ ){0,2}?(?:tracks?|pieces?|works?|songs?|cuts?)\\b`, 'i');
const MIDDLE = /\b(?:middle|centre|center) of (?:the|that|this) side\b|\bmid-side\b|\bmidway (?:through|down) (?:the|that) side\b/i;
const MIDDLE_OF = new RegExp(`\\b(?:middle|centre|center) of side ${SIDE}\\b`, 'i');
const SIDE_NAMED = new RegExp(`\\bside ${SIDE}\\b`, 'i');

/* The sides sized against each other, each phrasing the drafts have used; "shorter-winded" is not a size. */
const IS_THE = /\bside (one|two)\b[^.;]*?\b(?:is|as|being) (?:the )?(shorter|longer)(?!-)\b/i;
const THAN = /\bside (one|two)\b[^.;]*?\b(more|fewer) tracks than side (one|two)\b/i;
const ORDINAL = /\b(shorter|longer)(?!-)\b[^.;]{0,30}?\b(first|second)(?: side)?\b/i;

/** Which side a sentence makes the shorter, or null where it sizes neither. */
function shorterSide(text: string): 'one' | 'two' | null {
  const t = unquoted(text);
  const is = IS_THE.exec(t);
  if (is !== null) return is[2].toLowerCase() === 'shorter' ? (is[1].toLowerCase() as 'one' | 'two') : is[1].toLowerCase() === 'one' ? 'two' : 'one';
  const than = THAN.exec(t);
  if (than !== null) return than[2].toLowerCase() === 'fewer' ? (than[1].toLowerCase() as 'one' | 'two') : than[1].toLowerCase() === 'one' ? 'two' : 'one';
  const ord = ORDINAL.exec(t);
  if (ord !== null) {
    const side = ord[2].toLowerCase() === 'first' ? 'one' : 'two';
    return ord[1].toLowerCase() === 'shorter' ? side : side === 'one' ? 'two' : 'one';
  }
  return null;
}

export function disagreements(sentences: readonly string[]): Disagreement[] {
  const out: Disagreement[] = [];
  const n = (i: number) => i + 1;
  sentences.forEach((text, i) => {
    const t = unquoted(text);
    if (EVERYTHING.test(t)) {
      const own = names(text);
      sentences.forEach((other, j) => {
        if (j === i) return;
        const outsiders = [...names(other)].filter((name) => !own.has(name));
        if (outsiders.length > 0) out.push({ a: n(Math.min(i, j)), b: n(Math.max(i, j)), why: `sentence ${n(i)} says everything is theirs alone; sentence ${n(j)} names ${outsiders.join(', ')}` });
      });
    }
    const holds = HOLDS.exec(t);
    if (holds !== null) {
      const side = holds[1].toLowerCase();
      const count = holds[2].toLowerCase() === 'two' ? 2 : 1;
      sentences.forEach((other, j) => {
        if (j === i) return;
        const o = unquoted(other);
        const named = MIDDLE_OF.exec(o)?.[1] ?? (MIDDLE.test(o) ? SIDE_NAMED.exec(o)?.[1] : undefined);
        if (named?.toLowerCase() === side) out.push({ a: n(Math.min(i, j)), b: n(Math.max(i, j)), why: `sentence ${n(i)} gives side ${side} ${count} ${count === 1 ? 'piece' : 'pieces'}; sentence ${n(j)} places something in the middle of side ${side}` });
      });
    }
    const shorter = shorterSide(text);
    if (shorter !== null) {
      sentences.forEach((other, j) => {
        if (j <= i) return;
        const theirs = shorterSide(other);
        if (theirs !== null && theirs !== shorter) out.push({ a: n(i), b: n(j), why: `sentence ${n(i)} has side ${shorter} the shorter; sentence ${n(j)} has side ${theirs} the shorter` });
      });
    }
  });
  return out.sort((x, y) => x.a - y.a || x.b - y.b);
}
