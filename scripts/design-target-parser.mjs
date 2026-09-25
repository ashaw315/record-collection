/**
 * **The one parser for the design targets' section structure.**
 *
 * Everything that slices these files — the index check, any probe, any future
 * tool — imports from here. A second implementation of the heading pattern is
 * a second copy of a rule, and it fails the way copies fail: silently, on the
 * case the copy did not anticipate.
 *
 * The instance that produced this module: a helper matched the eyebrow
 * STYLING alone, without requiring an id followed by " · ". §26 contains a
 * figure caption carrying that same styling, so the helper ended §26 at the
 * caption and put the section's last two passages outside its own slice.
 * Three withdrawal marks then "could not be found" in text that was plainly
 * there. The script was right and the lookalike was wrong.
 *
 * This is the same argument `ASSERTIONS-spec.md` makes about its allow-list:
 * "Change an allow-list only in this file, never in the script alone." One
 * source for a rule, or the copies drift.
 */

/** Section ids: the wall's `W`/`W.N`, the record targets' `N`/`N.M`. */
export const SECTION_ID = String.raw`(?:W|W\.\d+(?:\.\d+)?|\d{1,2}(?:\.\d+)?)`;

/**
 * A heading is the eyebrow paragraph AND an id followed by " · ".
 *
 * Both halves are load-bearing. Without the styling, body prose matches;
 * without the " · " id, figure captions match — and the captions are what
 * truncated §26.
 */
export const HEADING = () =>
  new RegExp(
    String.raw`<p[^>]*style="[^"]*text-transform:uppercase[^"]*"[^>]*>\s*(?:§)?(${SECTION_ID}) · ([^<]*)`,
    'g',
  );

/**
 * SVG text holds cell labels shaped like headings — "1 · Cover",
 * "1981 · Harvest" — so it is removed before any heading match.
 */
export const withoutSvg = (s) => s.replace(/<svg[\s\S]*?<\/svg>/g, ' ');

/**
 * Spec, "Tag stripping, which is not one rule":
 *
 * > Inline tags — `strong`, `em`, `code`, `a`, `span`, `b`, `i`, `sup`, `sub`
 * > — are removed to the EMPTY STRING. Every other tag becomes a single
 * > space.
 *
 * **The choice decides a pass.** Mapping inline tags to a space makes
 * `26/first-wording-of-placement` read `a pair in air , because` — the prose
 * closes an `<em>` mid-sentence — and its quote scores zero occurrences. To
 * empty, all 27 quotes match. The same file yields both results.
 */
const INLINE = new Set(['strong', 'em', 'code', 'a', 'span', 'b', 'i', 'sup', 'sub']);

export const stripTags = (s) =>
  s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_tag, name) =>
    INLINE.has(name.toLowerCase()) ? '' : ' ',
  );
export const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/** Decode the two entities the spec names, before any text comparison. */
export const decodeEntities = (s) => s.replace(/&rsquo;/g, '’').replace(/&amp;/g, '&');

/**
 * Every section of one target, in order: id, title, and the html from this
 * heading to the next.
 *
 * `prefixW` renumbers the wall target's bare ids (`11` → `W.11`), which is
 * the renumbering the handoff records.
 */
export function sections(fileText, { prefixW = false } = {}) {
  const raw = withoutSvg(fileText);
  const found = [];
  for (const m of raw.matchAll(HEADING())) {
    const id = prefixW && /^\d/.test(m[1]) ? `W.${m[1]}` : m[1];
    found.push({ id, title: collapse(m[2]), at: m.index, end: m.index + m[0].length });
  }
  return found.map((h, i) => ({
    ...h,
    raw,
    html: raw.slice(h.at, i + 1 < found.length ? found[i + 1].at : undefined),
  }));
}

/** A section's text with every declared-withdrawn passage removed. */
export const liveText = (html) =>
  collapse(stripTags(html.replace(/<span[^>]*data-withdrawn-by=[^>]*>[\s\S]*?<\/span>/g, ' ')));

/** A section's full text, withdrawn passages included. */
export const sectionText = (html) => collapse(stripTags(html));
