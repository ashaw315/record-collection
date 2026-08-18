import { DEFAULT_SPINE_COLOUR } from '../shelf/spine';

/**
 * What goes on each surface of §10b's object, and what a surface shows when its
 * image does not exist.
 *
 * **Separated from the renderer because the fallbacks are decisions, not
 * drawing.** Which image belongs on which face, whether a hinge may open, and
 * how a non-square photograph is fitted are all answerable without a GPU — and
 * WebGL's failures are silent, so anything that can be settled before the draw
 * call should be.
 *
 * **The fallbacks are the common path.** Production holds three `cover` rows,
 * zero `back`, and no inner leaves, so every record on screen today shows a
 * fallback back. §10b treats that as ordinary rather than degraded: "Both cases
 * are ordinary and neither is an error state."
 */

export type SkinSources = {
  coverUrl: string | null;
  backUrl: string | null;
  gatefoldLeftUrl: string | null;
  gatefoldRightUrl: string | null;
  spineColour: string | null;
};

/**
 * A surface is either a photograph or a plain sleeve.
 *
 * `imprint` marks the fallback BACK, which §10b gives "label and catalogue
 * number as a small imprint and nothing further". A photographed back never
 * carries it — printing over someone's photograph of a real sleeve would deface
 * their data — and a plain FRONT never carries it either, because a blank front
 * is a blank sleeve and a catalogue number on it would invent a cover.
 */
export type Skin =
  | { kind: 'texture'; url: string }
  | { kind: 'plain'; colour: string; imprint?: true };

export type Skins = {
  front: Skin;
  back: Skin;
  /** Present only when BOTH leaves exist (§10b, A21c). */
  gatefold: { left: string; right: string } | null;
};

/**
 * **Both leaves, or no hinge.**
 *
 * §10b as amended by A21c: "One is not enough: a hinge that opens onto artwork
 * on one side and a blank on the other invents exactly the thing the user came
 * to see, and it does it in the most conspicuous place possible."
 *
 * The lone leaf is still stored and still appears in the gallery — it is a real
 * photograph of a real record — it simply does not open the sleeve.
 *
 * **This duplicates `faces.ts`'s guard of the same name, deliberately and
 * temporarily.** The CSS implementation (units 10-13) and this one are parallel
 * while the renderer is proven, and importing across them would couple two
 * things that are meant to be independently deletable. It is still the
 * two-places-one-rule shape this codebase keeps meeting, so it is written down
 * rather than left to be discovered: when the CSS version is removed, one of
 * these two goes with it and the other is the only copy. If they ever disagree
 * before then, the bug is that they exist twice.
 */
export function hasGatefold(sources: SkinSources): boolean {
  return sources.gatefoldLeftUrl !== null && sources.gatefoldRightUrl !== null;
}

/**
 * The four slots resolved to surfaces.
 *
 * **The plain colour is REUSED from `records.spine_colour`, never recomputed.**
 * A second averaging pass could disagree with the wall's spine for the same
 * record, and one sleeve wearing two different colours is worse than either.
 * `DEFAULT_SPINE_COLOUR` is the shelf's own constant for the same reason: a
 * null colour is ordinary (§4.2), so this path runs constantly, and a separate
 * default here would put one grey on the wall and another on the object.
 */
export function resolveSkins(sources: SkinSources): Skins {
  const colour = sources.spineColour ?? DEFAULT_SPINE_COLOUR;

  return {
    front:
      sources.coverUrl !== null
        ? { kind: 'texture', url: sources.coverUrl }
        : { kind: 'plain', colour },
    back:
      sources.backUrl !== null
        ? { kind: 'texture', url: sources.backUrl }
        : { kind: 'plain', colour, imprint: true },
    gatefold: hasGatefold(sources)
      ? // Non-null by `hasGatefold`; asserted through the guard rather than with
        // `!`, which CLAUDE.md §6 forbids.
        { left: sources.gatefoldLeftUrl ?? '', right: sources.gatefoldRightUrl ?? '' }
      : null,
  };
}

/** A texture's UV window: how much of the image to sample, and from where. */
export type Uv = { repeatX: number; repeatY: number; offsetX: number; offsetY: number };

/**
 * The UV window that shows the CENTRE SQUARE of a possibly non-square image.
 *
 * §10b as amended by A22: "A non-square image is cropped to square from its
 * centre when it is mapped onto the object, matching what the wall already does
 * with `object-cover`. The alternative — fitting the whole image and
 * letterboxing the remainder — puts a border on a record that has none."
 *
 * **This is a mapping-time transformation and never touches the stored file.**
 * The gallery shows the whole photograph, unmodified: it is the user's data
 * (§7.8), and the object's needs are not a reason to alter it. Adjusting
 * `repeat` and `offset` on the texture is exactly that — the bytes are
 * untouched and only the sampling window moves.
 *
 * Covers are not reliably square and that was measured rather than assumed: the
 * first one checked was 591×599 (unit 15). A zero-sized image — read before it
 * has decoded — falls back to the full window rather than dividing by zero,
 * because `NaN` in a UV repeat renders the surface blank and says nothing.
 */
export function centredSquareUv(imageWidth: number, imageHeight: number): Uv {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };
  }

  // Keep the shorter axis whole; trim the longer one to match it.
  const repeatX = imageWidth > imageHeight ? imageHeight / imageWidth : 1;
  const repeatY = imageHeight > imageWidth ? imageWidth / imageHeight : 1;

  // Half the discarded remainder comes off each end, so the crop is centred.
  return { repeatX, repeatY, offsetX: (1 - repeatX) / 2, offsetY: (1 - repeatY) / 2 };
}
