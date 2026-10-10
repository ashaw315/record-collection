import { describe, expect, it } from 'vitest';
import { FIGURE_MARGIN, SOLID_FACE_MIN, composeFigure, cubeRow } from './block-figure';

/**
 * §T.6, steps 111 and 112. "On the table and the grid the heading's figure
 * spans the filter block...: its top meets the block's first line's top,
 * its foot meets the block's last line's foot, and its right edge meets the
 * content's right edge." "Where the width beside the 443 column, less the
 * 24 margin, cannot hold the figure at the filter block's height, the
 * figure narrows to that width with its foot and right edge kept, and
 * below the clearing height there is no figure." Step 112: "Draw the
 * construction at the block's height first; size the three cubes to the
 * width left beside it, up to the ink cap, with half-solid gaps; where
 * three cubes cannot each clear 6px on every face, draw the construction
 * alone."
 *
 * The figures are the real table's: the block 286 to 506 once its 12 gap
 * is gone, the column ending at 463, the content at 1420, 1004 and 748.
 */
const block = { blockTop: 286, blockFoot: 506, columnRight: 463, windowWidth: 1440 };
/* The real source: 1.19 wide to 1 tall, 163 of its own units tall, clearing at 172.4, its ink allowing a cube of edge 45. */
const figure = { aspect: 194 / 163, unitHeight: 163, clearing: 172.4, capEdge: 45 };
const COS30 = Math.sqrt(3) / 2;

describe('the figure beside the filter block', () => {
  it('the margin is 24 and a solid’s face is no narrower than 6', () => {
    expect([FIGURE_MARGIN, SOLID_FACE_MIN]).toEqual([24, 6]);
  });

  /* Fails against 103d's air: a figure as tall as the air, 452, with its top under the header. */
  it('is as tall as the block, with its foot on the block’s foot and its right edge on the content’s', () => {
    const f = composeFigure({ ...block, contentRight: 1420 }, figure, false);
    expect(f).toMatchObject({ drawn: true, top: 286, bottom: 506, right: 1420, height: 220 });
    expect(f?.constructionWidth).toBeCloseTo(220 * figure.aspect, 6);
    expect(f?.left).toBeCloseTo(1420 - 220 * figure.aspect, 6);
    expect(f?.solidEdge).toBeNull();
  });

  /* Fails against a figure that keeps its top, or its left, when it narrows. */
  it('narrows to the width beside the column less 24, keeping its foot and its right edge', () => {
    const f = composeFigure({ ...block, contentRight: 748 }, figure, true);
    const width = 748 - 463 - 24;
    expect(f).toMatchObject({ drawn: true, bottom: 506, right: 748 });
    expect(f?.constructionWidth).toBeCloseTo(width, 6);
    expect(f?.height).toBeCloseTo(width / figure.aspect, 6);
    expect(f?.top).toBeCloseTo(506 - width / figure.aspect, 6);
    expect(f?.solidEdge, 'no width is left for solids').toBeNull();
  });

  it('is not drawn below the clearing height, by a narrow width or by a short block', () => {
    expect(composeFigure({ ...block, contentRight: 463 + 24 + 172 * figure.aspect }, figure, true)?.drawn).toBe(false);
    expect(composeFigure({ ...block, contentRight: 463 + 24 + 173 * figure.aspect }, figure, true)?.drawn).toBe(true);
    expect(composeFigure({ blockTop: 286, blockFoot: 286 + 172, columnRight: 463, contentRight: 1420, windowWidth: 1440 }, figure, true)?.drawn).toBe(false);
  });

  /* "At 768 and up": on the real collection the width holds the figure from 713, and it must not be drawn there. Fails against a figure drawn wherever it clears. */
  it('is nothing below a 768 window, whatever the width beside the column holds, and is from 768', () => {
    const at = (windowWidth: number) => composeFigure({ ...block, windowWidth, contentRight: 463 + 24 + 220 * figure.aspect + 1 }, figure, false);
    expect(at(767)).toBeNull();
    expect(at(768)).toMatchObject({ drawn: true, height: 220 });
  });

  it('is nothing at all where there is no width beside the column', () => {
    expect(composeFigure({ ...block, contentRight: 370 }, figure, true)).toBeNull();
  });
});

describe('the solids, sized after the construction', () => {
  /* Fails against step 110's sizing: solids at the ink's full allowance whatever the width, with the construction made smaller to fit them. */
  it('at 1024 the construction keeps the block’s height and the three cubes take the width left, with half a solid between', () => {
    const f = composeFigure({ ...block, contentRight: 1004 }, figure, true);
    const left = 1004 - 463 - 24 - 220 * figure.aspect;
    expect(f).toMatchObject({ drawn: true, height: 220, right: 1004 });
    /* Three solids and three gaps of half a solid: four and a half solids' width. */
    expect(f?.solidWidth).toBeCloseTo(left / 4.5, 6);
    expect(f?.left).toBeCloseTo(1004 - 517, 6);
  });

  /* Fails against solids that grow with the window: the ink is the cap. */
  it('at 1440 the cubes stop at the ink’s allowance, and the figure’s left edge falls where that puts it', () => {
    const f = composeFigure({ ...block, contentRight: 1420 }, figure, true);
    const scale = 220 / figure.unitHeight;
    expect(f?.solidEdge).toBeCloseTo(figure.capEdge, 6);
    expect(f?.solidWidth).toBeCloseTo(2 * figure.capEdge * COS30 * scale, 6);
    expect(f?.left).toBeCloseTo(1420 - 220 * figure.aspect - 4.5 * (f?.solidWidth ?? 0), 6);
  });

  /* "Where three cubes cannot each clear 6px on every face, draw the construction alone." A cube's side face is half its width. */
  it('are not drawn where a face would be under 6, and are from 6', () => {
    const at = (solidWidth: number) => composeFigure({ ...block, contentRight: 463 + 24 + 220 * figure.aspect + 4.5 * solidWidth }, figure, true);
    /* A hair over 12: the width left is a difference of sums, and at 12 exactly it comes back as 11.999…. */
    expect(at(12.01)?.solidEdge).not.toBeNull();
    expect(at(11.9)?.solidEdge).toBeNull();
    expect(at(11.9), 'and the construction then stands at the content’s edge alone').toMatchObject({ drawn: true, height: 220 });
    expect(at(11.9)?.left).toBeCloseTo(463 + 24 + 4.5 * 11.9, 6);
  });

  it('are not drawn where they are not asked for: the grid’s figure is in ink alone', () => {
    expect(composeFigure({ ...block, contentRight: 1420 }, figure, false)?.solidEdge).toBeNull();
  });
});

describe('a row of cubes', () => {
  const box = { x: -87, y: -102, width: 194, height: 163 };
  const row = cubeRow(box, 30, 3);
  const extent = (points: ReadonlyArray<readonly [number, number]>) => ({ minX: Math.min(...points.map((p) => p[0])), maxX: Math.max(...points.map((p) => p[0])), minY: Math.min(...points.map((p) => p[1])), maxY: Math.max(...points.map((p) => p[1])) });
  const boxes = row.map((slot) => extent([...slot.base, ...slot.shade, ...slot.top]));

  it('stands to the construction’s right on its ground line, one size, half a solid apart', () => {
    const width = 2 * 30 * COS30;
    expect(boxes[0].minX - (box.x + box.width)).toBeCloseTo(width / 2, 9);
    for (let i = 1; i < 3; i += 1) expect(boxes[i].minX - boxes[i - 1].maxX).toBeCloseTo(width / 2, 9);
    for (const b of boxes) {
      expect(b.maxX - b.minX).toBeCloseTo(width, 9);
      expect(b.maxY - b.minY, 'a cube is two edges tall').toBeCloseTo(60, 9);
      expect(b.maxY, 'on the ground line').toBeCloseTo(box.y + box.height, 9);
    }
  });
});
