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
 */
export const MIN_SPINE_WIDTH = 26;
export const MAX_SPINE_WIDTH = 34;

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
 * §10b: "spine text is artist, title and catalogue number."
 *
 * A missing catalogue number is dropped rather than left as a dangling
 * separator — §10's quick in-store entry leaves it blank and that is the common
 * case, not an edge. When it IS present it stays, however crowded the spine:
 * §10b calls it "the collector's identifier" that "earns its space".
 */
export function spineText(record: {
  artistName: string;
  title: string;
  catalogNumber: string | null;
}): string {
  return [record.artistName, record.title, record.catalogNumber]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
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
