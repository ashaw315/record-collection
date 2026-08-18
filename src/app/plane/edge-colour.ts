import { DEFAULT_SPINE_COLOUR } from '../shelf/spine';

/**
 * The colour of the sleeve's edge, derived from the face rather than equal to
 * it.
 *
 * **Unit 16 found the defect this fixes**, and it is not a nuance: at the fixed
 * viewing angle a fallback sleeve's edge is markedly less visible than a
 * photographed one's, because there is no artwork for it to contrast against.
 * That is the face every record shows today — production holds three covers and
 * zero backs — so the object reads least like an object in the commonest case.
 * Same shape as the original QA complaint one layer down: an untextured surface
 * gives light nothing to reveal.
 *
 * **The hazard, and it is why this is arithmetic rather than a CSS filter.** A
 * fixed "darken by 20%" separates a mid-grey sleeve and collapses at the ends:
 * Grave New World sits at ~18% lightness, where multiplying by 0.8 moves it
 * about three levels and the edge vanishes into the face — exactly where unit
 * 16 photographed it vanishing. So the edge moves AWAY from the face: lighter
 * when the face is dark, darker when it is light.
 *
 * The reasoning is `textColourOn`'s, from `spine.ts`, and is deliberately
 * reused rather than reinvented: luminance rather than the largest channel,
 * because pure blue has a high channel value and reads dark while pure yellow
 * does the reverse. What could not be reused is the function itself — it
 * returns a light/dark DECISION, not a colour, and its channel parser is
 * private to that module.
 */

/**
 * How far apart, in relative luminance, the edge and the face must sit.
 *
 * Enough that the two read as different surfaces; not so much that the edge
 * becomes a stripe painted along the side. §10b's spines settled the same
 * question with "thickness reads through lightness, not hue" — this is that
 * rule applied to a surface rather than to text.
 */
export const EDGE_MIN_SEPARATION = 0.11;

/** Parsed to 0–255 per channel, or `null` when the value is not a hex colour. */
function channels(colour: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (match === null) return null;

  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Perceived brightness, 0 to 1.
 *
 * Rec. 601 luma, matching `textColourOn` so the two never disagree about
 * whether a colour is dark. Green dominates perceived brightness and blue
 * barely registers; equal weights would call pure blue bright and lighten an
 * edge that is already too light.
 */
export function relativeLuminance(colour: string): number {
  const rgb = channels(colour) ?? channels(DEFAULT_SPINE_COLOUR);
  if (rgb === null) return 0;

  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * The edge colour for a given face colour.
 *
 * **Direction is chosen from the face, magnitude is guaranteed.** A dark face
 * takes a lighter edge and a light face a darker one, so the separation never
 * collapses at either end of the range — the failure mode this exists to
 * prevent. The shift is applied per channel toward white or black, which keeps
 * the edge the same hue family: it is the same card in different light, not a
 * different material.
 *
 * A malformed stored value falls back rather than throwing. `spine_colour` is
 * TEXT with no CHECK (§4.2), and `spine.ts` already records why that matters:
 * a renderer that throws on one hand-edited row renders nothing at all, losing
 * the whole object to one record.
 */
export function edgeColourFor(faceColour: string | null): string {
  const rgb = channels(faceColour ?? DEFAULT_SPINE_COLOUR) ?? channels(DEFAULT_SPINE_COLOUR);
  if (rgb === null) return DEFAULT_SPINE_COLOUR;

  const [r, g, b] = rgb;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  /*
    Move toward whichever end is further away, so there is always room. The
    factor is a fraction of the REMAINING distance to that end rather than of
    the current value — a proportional darkening runs out of room near black,
    which is the whole defect.
  */
  const towardWhite = luma < 0.5;
  const shift = (channel: number): number => {
    const target = towardWhite ? 255 : 0;
    // 0.34 of the way to the target clears EDGE_MIN_SEPARATION across the range
    // while keeping the edge recognisably the same colour family.
    return Math.round(channel + (target - channel) * 0.34);
  };

  const hex = (channel: number) =>
    Math.max(0, Math.min(255, shift(channel)))
      .toString(16)
      .padStart(2, '0');

  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
