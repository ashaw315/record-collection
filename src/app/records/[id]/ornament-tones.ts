import { hexToOklch, oklchToHex, type RecordLadder } from '@/lib/colour/record-ladder';

/**
 * **§9.2's three faces, as three lightnesses of the one tint value.**
 *
 * §9.2 states it exactly: "The three faces of a solid are three lightnesses of
 * the one tint value, not three hues — which is §5.3's argument that a form
 * reads as an object because its tones are lightness steps." And §5.1 closes
 * off the shortcut by name: every colour mark sits "at one of the three steps
 * of §5.5 and **never at an opacity variant**".
 *
 * The build had drawn `fill={tint}` three times at opacity 1, 0.72 and 0.5.
 * That is the forbidden variant, and it does not produce the ruled result:
 * opacity composites each face toward PAPER, so the three sides converge on
 * the ground instead of stepping down in lightness. The solids read flat and
 * grey, which is what §12 reports.
 *
 * **Ornament starts at TINT and never reaches base** — §9.2: "Everything is
 * tint step and nothing is base", which is what keeps §9.4's base-mark count
 * at four. So this does not reuse the record ladder's base and shade: those
 * are the record's colour ARRIVING, and ornament is ground. The steps are
 * taken from the tint's own lightness instead.
 *
 * The two steps down are the ladder's own proportions applied to the tint
 * rather than new numbers: each face is a fixed fraction of the way from the
 * tint toward ink, so a near-grey record — six of sixteen real covers, §5.2 —
 * steps by exactly the same amounts as a chromatic one. That matters because
 * the near-grey is where a flat solid would be least legible as an object.
 */

/** Each face's descent from the tint's lightness, toward ink. */
const LEFT_TOWARD_INK = 0.16;
const RIGHT_TOWARD_INK = 0.32;

export type OrnamentFace = { L: number; C: number; h: number; fill: string };

export type OrnamentFaces = {
  /** The lit face: the tint itself, unmodified. */
  top: OrnamentFace;
  left: OrnamentFace;
  /** The darkest side — §5.3's "shade is a face and never a shape". */
  right: OrnamentFace;
};

function face(L: number, C: number, h: number): OrnamentFace {
  return { L, C, h, fill: oklchToHex({ L, C, h }) };
}

export function ornamentFaces(ladder: RecordLadder): OrnamentFaces {
  const { tintL: L, tintHue: h } = ladder;
  /*
    The tint's own chroma, which `recordLadder` carries as the base's: the
    ladder varies LIGHTNESS across its steps and holds chroma and hue, so the
    tint's chroma is the ladder's chroma. Taking it from here rather than
    re-deriving keeps one value across all three faces, which is what makes
    them read as one object seen from three sides.
  */
  const C = ladder.baseC;

  return {
    top: face(L, C, h),
    left: face(L * (1 - LEFT_TOWARD_INK), C, h),
    right: face(L * (1 - RIGHT_TOWARD_INK), C, h),
  };
}

/**
 * The same three faces from the tint alone.
 *
 * `Section` is handed §5.5's tint as a CSS colour rather than the whole
 * ladder, so this is the entry point the drawing uses. It is the same
 * function: the tint's own lightness, chroma and hue are read back out of it
 * and stepped, so a caller with the ladder and a caller with only its tint
 * get identical faces. Returns `null` for a colour that cannot be parsed,
 * which is the caller's cue to draw nothing rather than to invent a value.
 */
export function ornamentFacesFromTint(tint: string): OrnamentFaces | null {
  const c = hexToOklch(tint);
  if (c === null) return null;

  return {
    top: face(c.L, c.C, c.h),
    left: face(c.L * (1 - LEFT_TOWARD_INK), c.C, c.h),
    right: face(c.L * (1 - RIGHT_TOWARD_INK), c.C, c.h),
  };
}
