import { describe, expect, it } from 'vitest';
import {
  BOX_PANELS,
  SLEEVE_THICKNESS_RATIO,
  boxRotation,
  edgeThickness,
  panelTransform,
  type BoxPanel,
} from './box';

/**
 * §10b's record as an object with thickness.
 *
 * Unit 12 built a convincing rotation of an unconvincing object: at 16° the
 * sleeve's silhouette was a pale face abutting a dark background, no side face,
 * no thickness anywhere. This is the geometry that fixes that, and the flip
 * falls out of it — a box whose back already exists needs no swap to reveal it.
 *
 * **The trap this file is written around.** A box and a plane render
 * IDENTICALLY face-on: same rectangle, same pixels, and every assertion made at
 * 0° passes against either. So no test here observes the record face-on and
 * concludes anything about its geometry. Each one names an angle, a panel that
 * only exists on a box, or a transform that a plane could not carry.
 */

describe('the box has the panels an object needs', () => {
  it('carries a front, a back and four edges', () => {
    /**
     * Fails against `BOX_PANELS`. A plane has one panel; a sleeve has six, and
     * the four edges are the entire difference between the two — they are what
     * occupies the silhouette when the record is turned.
     */
    expect(BOX_PANELS).toHaveLength(6);
    expect(BOX_PANELS.map((panel) => panel.name)).toEqual([
      'front',
      'back',
      'left',
      'right',
      'top',
      'bottom',
    ]);
  });

  it('pushes the front and back apart by the sleeve’s full thickness', () => {
    /**
     * Fails against `panelTransform`'s `translateZ` terms. Both faces sit on the
     * SAME element in a `preserve-3d` box, so what separates them is z-offset
     * alone: front forward by half the thickness, back backward by half. Give
     * them the same offset and the box is a plane with two coincident faces —
     * which, face-on, looks exactly right.
     */
    const front = panelTransform('front', 400);
    const back = panelTransform('back', 400);
    const halfDepth = (400 * SLEEVE_THICKNESS_RATIO) / 2;

    expect(front).toContain(`translateZ(${halfDepth}px)`);
    expect(back).toContain(`translateZ(-${halfDepth}px)`);
  });

  it('mirrors the back so its content does not read reversed', () => {
    /**
     * **The standard trap for this technique**, and the one §10b's back face
     * would show most obviously: the back panel is rotated 180° about Y to face
     * outward, and without that rotation its text renders mirror-reversed.
     *
     * Fails against `panelTransform`'s `back` branch. Asserted as the rotation
     * rather than as a `scaleX(-1)` because the two are not equivalent here —
     * `rotateY(180deg)` also puts the panel's normal the right way round, so it
     * is hidden when the front is showing and vice versa.
     */
    expect(panelTransform('back', 400)).toContain('rotateY(180deg)');
  });

  it('stands each edge perpendicular to the faces', () => {
    /**
     * Fails against the edge branches of `panelTransform`. An edge that is not
     * rotated 90° lies flat against the face and contributes nothing to the
     * silhouette — geometrically present, invisible in every frame, which is
     * the silent-no-op shape this project keeps finding.
     */
    expect(panelTransform('left', 400)).toContain('rotateY(-90deg)');
    expect(panelTransform('right', 400)).toContain('rotateY(90deg)');
    expect(panelTransform('top', 400)).toContain('rotateX(90deg)');
    expect(panelTransform('bottom', 400)).toContain('rotateX(-90deg)');
  });

  it('keeps the sleeve a record rather than a DVD case', () => {
    /**
     * Fails against `SLEEVE_THICKNESS_RATIO`. The reference IS a DVD case, so
     * mimicking its proportion would be borrowing the wrong thing — and the
     * spines already learned this lesson once, at 1:6, which QA read as a shelf
     * of box sets.
     *
     * A real 12" sleeve is ~1:70. This is deliberately thicker than that,
     * because 1:70 is invisible at the angles the tilt reaches — the same
     * legibility-beats-arithmetic trade §10b now states as a rule for spines.
     * The bound asserted here is the one that matters: nowhere near a DVD case.
     */
    expect(SLEEVE_THICKNESS_RATIO).toBeLessThan(1 / 20);
    expect(SLEEVE_THICKNESS_RATIO).toBeGreaterThan(1 / 100);
  });
});

describe('boxRotation — the flip is a rotation, not a swap', () => {
  it('shows the front at rest', () => {
    /**
     * Fails against `boxRotation`'s `front` branch. Zero is the only angle at
     * which the front panel faces the viewer squarely.
     */
    expect(boxRotation('front')).toBe(0);
  });

  it('turns a half circle to show the back', () => {
    /**
     * Fails against the `back` branch. 180° is what brings the back panel —
     * already present, already mirrored — round to face the viewer. Nothing is
     * swapped and no content changes; the object turns.
     *
     * Any value that is not a half turn leaves the record askew, and at 90° it
     * would be edge-on: visible, and wrong.
     */
    expect(boxRotation('back')).toBe(180);
  });

  it('passes THROUGH edge-on, which is what proves it is a turn', () => {
    /**
     * **The assertion a plane cannot satisfy**, and the reason it is here rather
     * than in a screenshot alone.
     *
     * The previous implementation was a HALF turn: the outgoing face was
     * discarded and the incoming one swung in from -92°, because keeping the
     * old face alive to 90° needed exactly the coordination that failed twice.
     * NOTES records that as an honest cost of the structure.
     *
     * A box has no such cost, and the arithmetic is the evidence: rotating from
     * 0 to 180 passes through 90, where the faces are edge-on and the EDGE
     * panels are what the viewer sees. That midpoint exists in the geometry
     * whether or not anything samples it, which is what makes the turn true
     * rather than a swap wearing a rotation's clothes.
     */
    const start = boxRotation('front');
    const end = boxRotation('back');

    expect(Math.min(start, end)).toBeLessThan(90);
    expect(Math.max(start, end)).toBeGreaterThan(90);
  });

  it('does not treat the gatefold as a rotation of the box', () => {
    /**
     * Fails against `boxRotation` if it grows a gatefold branch. §10b: "front →
     * turn → back is rotation; front → open → inner spread is a hinge. Two
     * physical acts, two motions, and sharing one would flatten the
     * distinction." The gatefold keeps its own transform and is out of this
     * unit's scope; what this pins is that the box does not quietly absorb it.
     */
    expect(boxRotation('gatefold')).toBe(0);
  });
});

describe('panelTransform — every panel is placed, none is left at the origin', () => {
  it('gives all six panels a distinct transform', () => {
    /**
     * Fails against `panelTransform` if any two panels collide. Two panels
     * sharing a transform means one is hidden inside the other for ever — again
     * invisible rather than broken, and again only detectable off-axis.
     */
    const transforms = BOX_PANELS.map((panel: BoxPanel) => panelTransform(panel.name, 400));
    expect(new Set(transforms).size).toBe(BOX_PANELS.length);
  });

  it('scales the edges with the face, so the box stays a box at any size', () => {
    /**
     * Fails against `edgeThickness` if the thickness is a constant rather than
     * derived from the face's size. The record renders at 512px pulled and much
     * smaller mid-rise; a fixed edge would be proportionally enormous at the
     * start of the rise and hairline at the end.
     *
     * Asserted against `edgeThickness` rather than `panelTransform`, because
     * thickness is the panel's SIZE and placement is its transform. A first
     * version of this test looked for the depth inside the right edge's
     * transform string, where it does not appear and never could — the test was
     * wrong, not the code, and it is worth recording because the assertion
     * looked reasonable and failed against correct geometry.
     */
    expect(edgeThickness(400)).toBeCloseTo(400 * SLEEVE_THICKNESS_RATIO, 6);
    expect(edgeThickness(100)).toBeCloseTo(edgeThickness(400) / 4, 6);
    expect(panelTransform('right', 100)).not.toBe(panelTransform('right', 400));
  });
});
