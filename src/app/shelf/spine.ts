/**
 * The rules behind §10b's spines, separated from the markup.
 *
 * Pure because these are decisions — how wide a spine is, what it says, whether
 * its text reads light or dark — and a component test would confirm whatever
 * the component produced without ever stating what it should be. Same reasoning
 * as `gallery-order` and `sparkline`.
 */

/**
 * The plain spine a record with no cover gets.
 *
 * §10b calls that "an honest absence, not a gap in the wall" — so it is a
 * neutral the eye reads as *unphotographed*, deliberately not a colour that
 * could be mistaken for a sleeve. It is also not the page background: an
 * invisible spine would be a gap, which is the thing §10b rules out.
 */
export const DEFAULT_SPINE_COLOUR = '#3a3a3a';

/**
 * How much shelf a spine occupies, in pixels.
 *
 * Records are physically near-identical, so this varies only a little: enough
 * that the wall has texture rather than reading as a barcode, not so much that
 * it implies a fact about thickness nobody recorded. A 2xLP is genuinely
 * thicker, but `formats` does not say how thick, and inventing the difference
 * would be the §8 shape — a shelf asserting something the data does not hold.
 *
 * **11-15px against a 160px spine is roughly 1:12**, which is §10b's amended
 * rule: narrow enough to read as a record, wide enough to name it. It was
 * 26-34px (about 1:6) and QA found that reads as a shelf of box sets.
 *
 * The spec first said 1:40, from arithmetic about sleeve thickness — a real 12″
 * sleeve is 314mm tall and 3-5mm thick, so 1:63 to 1:105, and even 1:40 was a
 * compromise. It loses to legibility: at 160px tall that is 4px, narrower than
 * a 9px glyph, so the spine text §10b requires becomes impossible and the wall
 * becomes colour bars you must hover one at a time to identify.
 *
 * **Narrowing does not change the TEXT BUDGET.** Width decides whether a glyph
 * fits across the spine; height decides how many fit along it. Checked rather
 * than assumed, and pinned by a test.
 */
/**
 * How tall a spine stands, and the row rhythm the shelf repeats at.
 *
 * **One constant, two consumers.** The shelf paints its shelf-edge with a
 * repeating background every `SPINE_ROW_HEIGHT` pixels, and a spine is
 * `SPINE_HEIGHT` tall. If the spine were taller than the row it would overhang
 * the shelf below; if the two were declared separately they would drift the
 * first time either changed — the two-places-must-match smell recorded in
 * NOTES, so the row is derived rather than restated.
 *
 * **240 rather than 160, chosen by looking at the full-bleed wall.** At 160 the
 * shelf was a 510x188 strip in the corner of a 1280x900 window with the page
 * empty below it — a widget rather than a wall, which is why a record leaving
 * it did not read as leaving anything. The reference's spines dominate the
 * frame and that is what makes a case emerging from them read as emerging from
 * something.
 */
export const SPINE_HEIGHT = 240;
export const SHELF_EDGE = 8;
export const SPINE_ROW_HEIGHT = SPINE_HEIGHT + SHELF_EDGE;

/**
 * **Derived from the height, because §10b states 1:12 as a RULE and not a
 * number.** Hardcoding these was a latent defect: raising the height alone
 * would have turned the wall into planks with no test noticing, since the
 * ratio assertion checks the relationship rather than the values.
 *
 * The spread is 1:14 to 1:10, which averages near 1:12 and gives the wall
 * texture — enough that it does not read as a barcode, not so much that it
 * implies a fact about thickness nobody recorded. A 2xLP is genuinely thicker,
 * but `formats` does not say how thick, and inventing the difference would be
 * the §8 shape.
 */
export const MIN_SPINE_WIDTH = Math.round(SPINE_HEIGHT / 14);
export const MAX_SPINE_WIDTH = Math.round(SPINE_HEIGHT / 10);

/**
 * The shelf's minimum width, as a fraction of the content column.
 *
 * §10b: "no wider than it needs, no shorter than a shelf." A shelf is
 * FURNITURE — it has a length whether or not it is full, and a real shelf with
 * five records on it is still a shelf with space beside them.
 *
 * Both neighbouring values were shipped and both were wrong. A full-width band
 * with five spines at the left reads as MISSING DATA, because the emptiness is
 * the whole viewport and implies a collection that should have filled it. A box
 * shrunk to its contents reads as a THUMBNAIL of a shelf: 105px of timber
 * floating in a 1200px column.
 *
 * Chosen by looking at 30%, 40% and 50% rendered at five records, not by
 * arithmetic — the arithmetic only established that the shelf does not fill a
 * 1200px column until about sixty records, which is what made this a decision
 * rather than a tuning problem.
 */
export const MIN_SHELF_FRACTION = 0.4;

/**
 * Derived from the record's id, so it is STABLE across loads.
 *
 * §8.2's determinism rule outlived the feature it was written for: a wall that
 * resizes or reshuffles between page loads cannot be scanned by eye, which is
 * §10b's entire purpose. `Math.random()` here would be a different wall every
 * time.
 */
export function spineWidth(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100_000;
  }

  const span = MAX_SPINE_WIDTH - MIN_SPINE_WIDTH + 1;
  return MIN_SPINE_WIDTH + (hash % span);
}

/**
 * How many characters fit on a spine, top to bottom.
 *
 * A 160px spine at 9px mono holds about 29 (~5.4px per character, measured).
 * Derived from `SPINE_HEIGHT` rather than restated, so shortening the spine
 * cannot leave a budget measured against the old height — which is how the
 * clipping this exists to prevent would return. Measured rather than guessed, and
 * the measurement is why this exists at all: against the real collection, four
 * of five spines overflowed — 38, 41, 43 and 49 characters — and the browser
 * clipped them at BOTH ends, taking the catalogue number with it.
 *
 * A constant rather than a runtime measurement because the spine height is
 * fixed in the component and text measurement in a server component is not
 * available. If the height changes, this changes with it.
 */
export const SPINE_TEXT_BUDGET = Math.floor(SPINE_HEIGHT / 5.4);

/** Two spaces, not " · ": on a rotated mono spine they read the same and cost
 * one character instead of three, which is six characters back for the title. */
const GAP = '  ';

/** Truncates with an ellipsis, never returning more than `room` characters. */
function clip(value: string, room: number): string {
  if (room <= 0) return '';
  if (value.length <= room) return value;
  if (room === 1) return '…';

  return `${value.slice(0, room - 1)}…`;
}

/**
 * §10b: "spine text is artist, title and catalogue number."
 *
 * **Truncated to FIT, not to a fixed length.** A short spine loses nothing; a
 * long one loses exactly enough. The title absorbs the shortfall, because §10b
 * names the priority: the catalogue number "is the collector's identifier and
 * earns its space", and the artist is how a record is found on a shelf. The
 * title is what a collector can lose and still know which record this is.
 *
 * **When artist and catalogue number ALONE exceed the budget, the artist gives
 * way — not the identifier.** That case is not hypothetical: measured across
 * plausible collections, four of six artist/catalogue pairs blow the budget
 * before the title gets a character ("Crosby, Stills, Nash & Young" + "SD 7200"
 * is 37 against 31). The measurement decided the direction rather than taste:
 *
 *     truncate artist    -> "Crosby, Stills, Nash …  SD 7200"    still obvious
 *     truncate catalogue -> "Crosby, Stills, Nash & Young  S…"   identifies nothing
 *
 * A clipped artist stays readable because its distinguishing information is
 * front-loaded. A catalogue number's is spread across the whole string, so a
 * stub of one is not an identifier at all.
 */
export function spineText(record: {
  artistName: string;
  title: string;
  catalogNumber: string | null;
}): string {
  const catalogue = record.catalogNumber ?? '';
  const hasCatalogue = catalogue !== '';

  // What the identifiers need before the title is considered at all.
  const fixed = record.artistName.length + (hasCatalogue ? GAP.length + catalogue.length : 0);

  if (fixed > SPINE_TEXT_BUDGET) {
    /**
     * Degenerate: the identifiers do not fit together, so the title is gone and
     * the artist is cut down to whatever remains. The catalogue number is never
     * touched — if it alone fills the budget, it is the last thing standing,
     * and a spine showing only an identifier beats one showing neither.
     */
    const roomForArtist = SPINE_TEXT_BUDGET - (hasCatalogue ? GAP.length + catalogue.length : 0);
    const artist = clip(record.artistName, roomForArtist);

    return [artist, hasCatalogue ? catalogue : '']
      .filter((part) => part !== '')
      .join(GAP);
  }

  /**
   * Below three characters a truncated title is noise — "N…" tells the reader
   * nothing and costs space the identifiers could use. Absence is cleaner than
   * a stub.
   */
  const roomForTitle = SPINE_TEXT_BUDGET - fixed - GAP.length;
  const title = roomForTitle >= 3 ? clip(record.title, roomForTitle) : '';

  return [record.artistName, title, hasCatalogue ? catalogue : '']
    .filter((part) => part !== '')
    .join(GAP);
}

/** Parsed to 0–255 per channel, or `null` if the value is not a hex colour. */
function channels(colour: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (match === null) return null;

  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Whether spine text should be light or dark against its background.
 *
 * **By LUMINANCE, not by the largest channel.** Pure blue has a high channel
 * value and is dark to the eye; pure yellow is the reverse. A rule keyed on
 * `max(r,g,b)` puts white text on yellow, and the colours here come from
 * photographs so every case arrives eventually.
 *
 * A malformed value falls back rather than throwing: `spine_colour` is TEXT
 * with no CHECK, and a shelf that throws on one hand-edited row renders nothing
 * at all — the whole wall lost to one record.
 */
export function textColourOn(colour: string | null): 'light' | 'dark' {
  const rgb = channels(colour ?? DEFAULT_SPINE_COLOUR) ?? channels(DEFAULT_SPINE_COLOUR);
  if (rgb === null) return 'light';

  const [r, g, b] = rgb;
  // Rec. 601 luma: green dominates perceived brightness, blue barely registers.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luma > 0.55 ? 'dark' : 'light';
}
