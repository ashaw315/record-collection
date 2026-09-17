import { describe, expect, it } from 'vitest';
import { COS30, DEPTH, SPINE_HEIGHT, project, type PlacedSeat } from './geometry';
import { PANEL_GAP, panelAnchor } from './panel-anchor';

/**
 * §11.7: the panel sits in the plane of the page — flat, on paper — to the
 * right of the pulled record, vertically aligned to the cover's top edge,
 * as wide as the cover's projected width, so the composition reads as two
 * columns rather than an object with a caption.
 */
describe('panelAnchor', () => {
  const seat: PlacedSeat = { id: 'r', x: 100, y: 90, z: 458, width: 20 };
  const frame = { viewBox: '-300 -250 1400 900', width: 1400, height: 900 };

  it('aligns to the cover’s far-top corner — the right face’s highest, rightmost point — in the svg’s px', () => {
    const [cx, cy] = project(seat.x + seat.width, seat.y, seat.z + SPINE_HEIGHT);
    const anchor = panelAnchor(seat, frame);
    /* Rounded to whole px: laid out in the page's plane, not drawn in the projection. */
    expect(anchor.top).toBe(Math.round(cy - -250));
    expect(anchor.left).toBe(Math.round(cx - -300 + PANEL_GAP));
  });

  it('is as wide as the cover’s projected width', () => {
    expect(panelAnchor(seat, frame).width).toBe(Math.round(DEPTH * COS30));
    expect(panelAnchor(seat, frame).width).toBe(208);
  });
});
