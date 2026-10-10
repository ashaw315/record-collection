import { COS30, SIN30 } from '@/app/wall/geometry';

/** §G.3's 24: the margin between the band's column and the figure. */
export const FIGURE_MARGIN = 24;
/** §29's minimum: no face narrower than 6 as drawn. */
export const SOLID_FACE_MIN = 6;
/** §T.6: "up to three", from the first three records the screen shows. */
export const SOLID_SLOTS = 3;
/** "At 768 and up, on the table and grid": below it the only ornament is the empty state's. */
export const FIGURE_FROM = 768;
/** Three solids and a gap of half a solid before each: four and a half solids' width. */
const ROW_IN_SOLIDS = SOLID_SLOTS * 1.5;

/** What the figure stands beside, in one frame of reference. */
export type BlockBounds = {
  /** The filter block's first line's top and its last line's foot. */
  blockTop: number;
  blockFoot: number;
  /** Where the 443 column ends. */
  columnRight: number;
  /** The content's right edge: where the table's right-aligned figures and the grid's last column end. */
  contentRight: number;
  /** The window's width: the composition is §G.8's fork's, 768 and up. */
  windowWidth: number;
};

/** The source record's construction as a figure, measured by the server. */
export type FigureMeasure = {
  /** The construction's width over its height. */
  aspect: number;
  /** The construction's height in its own units, which is what a solid's edge is given in. */
  unitHeight: number;
  /** The height at which its narrowest face clears §29's 6px. */
  clearing: number;
  /** The largest edge, in the construction's units, at which three cubes cover no more than its ink. */
  capEdge: number;
};

export type ComposedFigure = {
  drawn: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** The construction's height, which is the figure's. */
  height: number;
  constructionWidth: number;
  /** A solid's width as drawn, and its edge in the construction's units; null where the construction stands alone. */
  solidWidth: number | null;
  solidEdge: number | null;
};

/**
 * §T.6, steps 111 and 112: the heading's figure on the table and the grid.
 *
 * "Its top meets the block's first line's top, its foot meets the block's
 * last line's foot, and its right edge meets the content's right edge."
 * "Where the width beside the 443 column, less the 24 margin, cannot hold
 * the figure at the filter block's height, the figure narrows to that
 * width with its foot and right edge kept, and below the clearing height
 * there is no figure."
 *
 * The construction comes first (step 112): it is drawn at the block's
 * height, and the three cubes take "the width left beside it, up to the
 * ink cap, with half-solid gaps". A cube's side face is half its width, so
 * "where three cubes cannot each clear 6px on every face" is a solid
 * narrower than 12, and there the construction stands alone at the
 * content's edge. Step 110 sized the cubes first and let them make the
 * construction smaller, which took the figure off the page at 1024.
 */
export function composeFigure(bounds: BlockBounds, figure: FigureMeasure, wantSolids: boolean): ComposedFigure | null {
  const room = bounds.contentRight - bounds.columnRight - FIGURE_MARGIN;
  const blockHeight = bounds.blockFoot - bounds.blockTop;
  if (bounds.windowWidth < FIGURE_FROM || room <= 0 || blockHeight <= 0) return null;

  const full = blockHeight * figure.aspect;
  const height = full > room ? room / figure.aspect : blockHeight;
  const constructionWidth = height * figure.aspect;
  const drawn = height >= figure.clearing;

  let solidWidth: number | null = null;
  let solidEdge: number | null = null;
  if (wantSolids && drawn) {
    const scale = height / figure.unitHeight;
    /* The width left, the ink's allowance, and no taller than the construction: a cube is two edges tall. */
    const width = Math.min((room - constructionWidth) / ROW_IN_SOLIDS, 2 * figure.capEdge * COS30 * scale, height * COS30);
    if (width / 2 >= SOLID_FACE_MIN) {
      solidWidth = width;
      solidEdge = width / (2 * COS30) / scale;
    }
  }
  const width = constructionWidth + (solidWidth === null ? 0 : ROW_IN_SOLIDS * solidWidth);
  return { drawn, left: bounds.contentRight - width, top: bounds.blockFoot - height, right: bounds.contentRight, bottom: bounds.blockFoot, height, constructionWidth, solidWidth, solidEdge };
}

type Point = readonly [number, number];
export type SolidFaces = { base: Point[]; shade: Point[]; top: Point[] };

/**
 * §26's cube at 30°, `count` of them in one row to the right of the
 * construction's box, on its ground line, each half a solid's width from
 * the last. In the construction's own units, so the figure is one drawing
 * at one scale. The faces are §26's as `OrnamentMarks` draws them: base on
 * the left, shade on the right, top last.
 */
export function cubeRow(box: { x: number; y: number; width: number; height: number }, edge: number, count: number): SolidFaces[] {
  const solidWidth = 2 * edge * COS30;
  const gap = solidWidth / 2;
  const ground = box.y + box.height;
  const row: SolidFaces[] = [];
  for (let i = 0; i < count; i += 1) {
    /* The cube's plan origin projects to its top face's upper corner; its lowest corner is one edge beneath the middle. */
    const cx = box.x + box.width + gap + solidWidth / 2 + i * (solidWidth + gap);
    const oy = ground - 2 * edge * SIN30;
    const p = (u: number, v: number, w: number): Point => [cx + (u - v) * COS30 * edge, oy + (u + v) * SIN30 * edge - w * edge];
    row.push({
      base: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)],
      shade: [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
      top: [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    });
  }
  return row;
}
