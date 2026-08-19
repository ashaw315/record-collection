import { SPINE_HEIGHT } from '../shelf/spine';

/**
 * How a spine's text becomes something WebGL can draw.
 *
 * **Text in a scene is not free.** The CSS wall got its legibility from a
 * rotated 9px mono span, which the browser hinted and antialiased as text. A
 * canvas-textured label gets none of that, so it has to buy the same
 * readability with device pixels.
 *
 * The plan is separated from the drawing because the plan is the part with
 * decisions in it — how big, how dense, which way round — and the drawing is a
 * sequence of canvas calls. A component test would confirm whatever the
 * component produced; this states what it should be.
 *
 * **Truncation is NOT decided here.** `spineText` owns it and has its own
 * budget and tests. Two places deciding what fits is the two-systems smell, and
 * the accessible name deliberately carries the untruncated title because the
 * visible string is not the record's identity.
 */

export type SpineLabelPlan = {
  /** The string to draw, already truncated by `spineText`. */
  text: string;
  /** Texture width in device pixels — the spine's LONG axis. */
  canvasWidth: number;
  /** Texture height in device pixels — across the spine. */
  canvasHeight: number;
  /** Font size in device pixels. */
  fontPx: number;
  /** How many device pixels per wall pixel. */
  pixelRatio: number;
  /** Whether the texture is turned onto the spine when applied. */
  rotated: true;
};

/**
 * Supersampling factor.
 *
 * **Three, because a texture is not hinted.** At 1:1 a 9px glyph gets nine
 * device pixels and no hinting, which is the same budget the CSS wall had
 * WITHOUT the browser's text rasteriser — and it reads as mush. Three is enough
 * that the glyph edges survive the GPU's bilinear filter at real size; more
 * costs texture memory across 125 spines for no visible gain.
 */
const PIXEL_RATIO = 3;

/**
 * How much of the spine's width a glyph may occupy.
 *
 * Under 1 so the text does not touch the spine's edges — a label bleeding into
 * the gap between records reads as a printing error rather than as a spine.
 */
const GLYPH_FIT = 0.62;

export function spineLabelPlan({
  text,
  spineWidth,
}: {
  text: string;
  spineWidth: number;
}): SpineLabelPlan {
  /*
    The label runs ALONG the spine: a spine is ~20px wide and 240px tall, so
    laying text across it would leave room for two glyphs. §10b: "set in mono,
    rotated."
  */
  const canvasWidth = Math.max(1, Math.round(SPINE_HEIGHT * PIXEL_RATIO));
  const canvasHeight = Math.max(1, Math.round(spineWidth * PIXEL_RATIO));

  /*
    **The font size comes from the WIDTH**, because that is the constraint: a
    glyph has to fit across a 17px spine. Deriving it keeps that true if the
    proportion changes — §10b states 1:12 as a rule and `MIN_SPINE_WIDTH` is
    already derived from `SPINE_HEIGHT` for the same reason.
  */
  const fontPx = Math.max(1, Math.round(spineWidth * GLYPH_FIT * PIXEL_RATIO));

  return {
    text,
    canvasWidth,
    canvasHeight,
    fontPx,
    pixelRatio: PIXEL_RATIO,
    rotated: true,
  };
}
