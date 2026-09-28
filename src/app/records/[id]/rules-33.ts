/**
 * §33's sizing rules for the frame's lower band.
 *
 * **"The band fits the record in front of it."** §33 is ruled from Adam's
 * capture of the built page rather than from §1's drawing, because §1 "still
 * shows a cell that no longer exists".
 */

/** §33: "It takes 0.855 of the cell's free height below the matrix text". */
export const SOLID_OF_FREE_HEIGHT = 0.855;

/** §29's face minimum, which §33 applies here as a suppression. */
export const MIN_FACE = 6;

/**
 * The archetype's drawn proportions, 120 × 104 — kept as a RATIO rather than a
 * size, because the size is what §33 makes variable.
 */
const ARCHETYPE_WIDTH = 120;
const ARCHETYPE_HEIGHT = 104;

/**
 * The shortest face as a fraction of the figure's height.
 *
 * The solid is a box in the projection, so its smallest painted face is the
 * top one, whose drawn depth is what vanishes first as the figure shrinks.
 * Measured off the archetype rather than recalled: the three polygons of
 * `MatrixSolid` span 104px of height, of which the top face occupies 36.
 */
const SMALLEST_FACE_RATIO = 36 / ARCHETYPE_HEIGHT;

export interface SolidFit {
  /** False when §29's minimum fails — §33: "the solid is not drawn". */
  drawn: boolean;
  width: number;
  height: number;
}

/**
 * Sizes the matrix solid against the space below the matrix text.
 *
 * **Not the section's height.** §33: this is "§5.4's record-independent solid
 * in the frame's lower band, not a §9 figure, so §25's 0.855 of the section
 * height is the wrong base, and measuring it against that answers a different
 * question."
 */
export function freeHeightSolid({
  cellHeight,
  textBottom,
  cellWidth,
  inset = 0,
}: {
  cellHeight: number;
  /** Where the matrix text ends, measured from the cell's top. */
  textBottom: number;
  cellWidth: number;
  /** The bottom inset the solid sits on; the room below the text ends there. */
  inset?: number;
}): SolidFit {
  /*
    The free height is the room the solid can occupy: from the text's bottom
    to the inset it sits on, not to the cell's edge. Measured to the edge, a
    114-tall cell (§41's packed band at 1000) gave a 53px solid on an 18px
    inset whose top sat 9px above the text, in front of type (§34).
  */
  const free = Math.max(0, cellHeight - inset - textBottom);
  let height = free * SOLID_OF_FREE_HEIGHT;
  let width = height * (ARCHETYPE_WIDTH / ARCHETYPE_HEIGHT);

  /*
    The cell's width binds where the free height is tall — the rule gives a
    height, and a figure wider than its cell would leave the cell it is
    placed inside.
  */
  if (width > cellWidth) {
    width = cellWidth;
    height = width * (ARCHETYPE_HEIGHT / ARCHETYPE_WIDTH);
  }

  /*
    §33 suppresses rather than clamps. Sizing up to the minimum would draw a
    solid the rule says must be absent, which is the same shape as a skip
    reported as a pass: the reader sees a mark and reads it as data.
  */
  const smallestFace = height * SMALLEST_FACE_RATIO;
  if (smallestFace < MIN_FACE) return { drawn: false, width: 0, height: 0 };

  return { drawn: true, width, height };
}

/** Exposed so the test can compute the boundary rather than restate it. */
freeHeightSolid.smallestFaceRatio = SMALLEST_FACE_RATIO;
