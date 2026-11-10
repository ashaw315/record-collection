/**
 * **Withdrawal and supersession markers, read by Design's grammar (DESIGN-RULES, "Marker grammar", 10 Nov).**
 *
 * A marker begins at its verb and ends its opening at the first colon before any sentence stop. It may follow a full
 * stop, a section heading, a colon, a parenthesis or a quote, so nothing here requires a sentence start. The grammar:
 *
 *   1. a verb, "Withdrawn" or "Superseded" ("Narrowed" is read as "Withdrawn in part");
 *   2. optionally "in part" or "in whole";
 *   3. optionally "within" or "by", followed by one or more section references joined by "," or "and";
 *   4. optionally a qualifier saying what the marker covers, or, with no reference, what superseded it;
 *   5. the colon.
 *
 * The colon is what makes a marker: "(withdrawn by §20)" is a reference to a withdrawal, and a sentence that names one
 * and ends in a full stop is prose. A marker-shaped opener that doesn't parse throws, naming itself: on 10 Nov a check
 * reading two forms missed 44 of 107 markers on one card, a five-form list would have refused fourteen, and requiring a
 * sentence start would have missed nine. Enumerate and fail on the remainder; never widen a pattern and hope.
 */
const REF = '§[A-Za-z0-9.]+';
const REFS = new RegExp(`^\\s+(within|by)\\s+(${REF}(?:(?:,\\s*|\\s+and\\s+)${REF})*)`);
const SCOPE = /^\s+in (part|whole)\b/;
const OPENER = /^(Withdrawn|Superseded|Narrowed)\b([\s\S]*):$/;
const STOP = /[.!?](?=[”’")\]]*(?:\s|$))/;

export function parseMarker(opener) {
  const text = opener.trim();
  const m = OPENER.exec(text);
  if (m === null) throw new Error(`not a marker: ${text}`);
  const narrowed = m[1] === 'Narrowed';
  const verb = narrowed ? 'Withdrawn' : m[1];
  let rest = m[2];
  let scope = narrowed ? 'part' : 'whole';
  const fail = () => { throw new Error(`a marker-shaped opener that does not parse by the grammar: ${text}`); };
  const sc = SCOPE.exec(rest);
  if (sc !== null) { if (narrowed) fail(); scope = sc[1]; rest = rest.slice(sc[0].length); }
  let how = null; let refs = [];
  const hw = REFS.exec(rest);
  if (hw !== null) { how = hw[1]; refs = hw[2].split(/,\s*|\s+and\s+/); rest = rest.slice(hw[0].length); }
  const qualifier = rest.replace(/^ +/, '').trim();
  if (/§/.test(qualifier)) fail();
  if (how === null && (qualifier === '' || /^(by|within)$/.test(qualifier))) fail();
  return { verb, scope, how, refs, qualifier, narrowed };
}

/** The opener with every section reference read as §N, so openers are grouped by their form. */
export const normaliseOpener = (opener) => opener.replace(new RegExp(REF, 'g'), '§N').replace(/\s+/g, ' ').trim();

const blank = (m) => ' '.repeat(m.length);

/**
 * Every marker in a plain text, in order: its opener, where it starts, its parse, its normalised form, and whether it
 * opens a sentence (nothing before it in the text, or a sentence stop). Text inside quotation marks is an example of
 * the form, not a declaration, and is skipped; the verb is matched in its own case at a word boundary.
 */
export function markersIn(plain) {
  const text = plain.replace(/\s+/g, ' ');
  const scrubbed = text.replace(/“[^”]*”/g, blank).replace(/"[^"]*"/g, blank);
  const out = [];
  for (const v of scrubbed.matchAll(/\b(Withdrawn|Superseded|Narrowed)\b/g)) {
    const rest = scrubbed.slice(v.index);
    const colon = rest.indexOf(':');
    if (colon === -1) continue;
    const stop = rest.search(STOP);
    if (stop !== -1 && stop < colon) continue;
    const opener = text.slice(v.index, v.index + colon + 1);
    const before = text.slice(0, v.index).trim();
    const opensSentence = before === '' || /[.!?][”’")\]]*$/.test(before);
    out.push({ opener, start: v.index, parsed: parseMarker(opener), normalised: normaliseOpener(opener), opensSentence });
  }
  return out;
}
