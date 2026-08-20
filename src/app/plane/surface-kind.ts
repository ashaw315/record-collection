/**
 * Whether a surface is a PHOTOGRAPH or a SURFACE — which decides whether light
 * touches it.
 *
 * **§10b's rule about spines applies to faces directly.** A spine is a claim
 * about a cover; a cover face is a claim about the artwork. Adding light that
 * was never in the sleeve is the class that declined a saturation boost in unit
 * 1a: the app asserting colour the record does not have.
 *
 * Measured before this rule existed: the rendered cover sat **+0.030 above the
 * source in linear space**, uniformly across all three channels — an additive
 * ambient term rather than a gain. Because a constant add lifts the darkest
 * channel proportionally most, it read as a blue cast: ratios 1.47 / 1.64 /
 * 1.88 against near-constant differences of 21.8 / 25.6 / 27.3.
 *
 * **The rule is about what the surface IS**, which is why this module answers
 * that question rather than handing out materials. A caller cannot choose a
 * material without first saying what it is drawing.
 *
 * It is stated here rather than at each call site so the next face added
 * inherits it. The gatefold leaves are slots with no geometry yet, and leaving
 * the rule implicit is how NOTES's "deferral with no home" happens — the cover
 * itself sat plain behind a comment saying textures were a later unit.
 */

/**
 * The image slots §4.2 defines. Every one is a photograph of artwork.
 *
 * Enumerated rather than sampled, so adding a slot to the schema without adding
 * it here fails a test instead of silently taking the lit default.
 */
export const PHOTOGRAPHED_FACES = [
  'cover',
  'back',
  'gatefold_left',
  'gatefold_right',
] as const;

export type PhotographedFace = (typeof PHOTOGRAPHED_FACES)[number];

/**
 * Everything the record and the wall are made of.
 *
 * The non-photograph entries are surfaces: they have no source image to be
 * faithful to, and they NEED light. Unit 17 found the plain-sleeve fallback's
 * edge only separates tonally from its face because it is lit — unlit, it is a
 * flat rectangle, which is the "missing texture" reading that unit fixed.
 */
export type Surface =
  | PhotographedFace
  | 'plain-sleeve'
  | 'spine'
  | 'spine-edge'
  | 'shelf'
  | 'shelf-lip';

export function isPhotograph(surface: Surface): boolean {
  return (PHOTOGRAPHED_FACES as readonly string[]).includes(surface);
}

/**
 * Which material a surface wants.
 *
 * `unlit` is `MeshBasicMaterial`: it shows its texture as-is, with no lighting
 * term, which is what unit 15 verified to 1.7 levels and why it used one.
 * `lit` is `MeshStandardMaterial`, which shades — and should.
 */
export function surfaceKind(surface: Surface): 'lit' | 'unlit' {
  return isPhotograph(surface) ? 'unlit' : 'lit';
}
