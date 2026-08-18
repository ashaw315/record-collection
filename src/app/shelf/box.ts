/**
 * §10b's pulled record as an object with thickness.
 *
 * Unit 12 built a convincing rotation of an unconvincing object: at 16° the
 * sleeve's silhouette was a pale face meeting a dark background with no side
 * face and no depth anywhere. The rotation was right and the thing being
 * rotated was a sheet of card.
 *
 * **Six panels in one `preserve-3d` box, and the flip falls out of it.** The
 * back is not swapped in when you turn the record over — it is already there,
 * behind the front, mirrored and facing outward, and turning the box 180° brings
 * it round. That is why this unit builds the box and the flip together: the
 * structure that gives the record depth is the same structure that makes a true
 * two-sided turn trivial.
 *
 * **What this deletes.** The previous flip was a HALF turn, and NOTES recorded
 * the reason honestly: one element whose contents were swapped, so the outgoing
 * face could not stay alive to 90° without the coordination that failed twice.
 * A box has no flag to coordinate. Nothing is halfway between two states,
 * because there are no two states — there is one object at one angle.
 *
 * Pure, because the geometry is a decision. No timing here: the flip's duration
 * lives in the stylesheet, like every other duration in this feature.
 */

/**
 * How thick a sleeve is, as a fraction of its face.
 *
 * **Chosen by rendering it and looking**, which is the method §10b now
 * prescribes for exactly this kind of number — the spines went through the same
 * argument and it is recorded there in both directions.
 *
 * A real 12" sleeve is 314mm square and 3-5mm thick: about 1:70. That loses,
 * for the same reason 1:40 lost on the spines. At 512px a 1:70 edge is 7px seen
 * face-on and, foreshortened by the tilt's 16°, about 2px — which is the
 * silhouette unit 12 photographed and called no thickness at all.
 *
 * 1:40 is the compromise: 12.8px at full size, ~3.5px foreshortened at 16°, and
 * a clearly readable band edge-on. Thicker candidates were rejected by looking:
 * at 1:20 the record reads as a DVD case, which is the reference's own
 * proportion and precisely the wrong thing to borrow — the spines already
 * shipped that mistake once at 1:6 and QA called it a shelf of box sets.
 */
export const SLEEVE_THICKNESS_RATIO = 1 / 40;

export type PanelName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type BoxPanel = {
  name: PanelName;
  /** Whether this panel carries artwork, or is a lit edge of the sleeve. */
  kind: 'face' | 'edge';
};

/**
 * The six surfaces of the sleeve.
 *
 * Front and back carry content; the four edges are the sleeve's thickness and
 * exist to be seen at an angle. Order is stable so the DOM order is stable —
 * `preserve-3d` resolves depth by transform rather than by paint order, but a
 * shifting DOM would still churn the tree for nothing.
 */
export const BOX_PANELS: readonly BoxPanel[] = [
  { name: 'front', kind: 'face' },
  { name: 'back', kind: 'face' },
  { name: 'left', kind: 'edge' },
  { name: 'right', kind: 'edge' },
  { name: 'top', kind: 'edge' },
  { name: 'bottom', kind: 'edge' },
] as const;

/**
 * Where a panel sits, given the face's rendered size in pixels.
 *
 * **The thickness derives from the face**, never a constant: the record renders
 * at 512px pulled and a few pixels wide mid-rise, so a fixed edge would be
 * proportionally vast at the start of the rise and hairline at the end.
 *
 * **The back is rotated, not merely offset.** `rotateY(180deg)` both faces it
 * outward and un-mirrors its content — a back panel without it renders its text
 * reversed, which is the standard trap for this technique and the most visible
 * possible bug on a face whose whole job is to be read.
 */
export function panelTransform(panel: PanelName, faceSize: number): string {
  const halfDepth = (faceSize * SLEEVE_THICKNESS_RATIO) / 2;
  const halfFace = faceSize / 2;

  switch (panel) {
    case 'front':
      return `translateZ(${halfDepth}px)`;
    case 'back':
      return `translateZ(-${halfDepth}px) rotateY(180deg)`;
    case 'left':
      return `translateX(-${halfFace}px) rotateY(-90deg)`;
    case 'right':
      return `translateX(${halfFace}px) rotateY(90deg)`;
    case 'top':
      return `translateY(-${halfFace}px) rotateX(90deg)`;
    case 'bottom':
      return `translateY(${halfFace}px) rotateX(-90deg)`;
  }
}

/**
 * How thick an edge panel is, in pixels, for a face of this size.
 *
 * Separate from `panelTransform` because thickness is the panel's SIZE, not its
 * placement — the edges are positioned by transform and sized by width or
 * height, and conflating the two is what made an early version of this module's
 * test assert against a string that could never contain the number.
 */
export function edgeThickness(faceSize: number): number {
  return faceSize * SLEEVE_THICKNESS_RATIO;
}

/**
 * How far the box is turned, in degrees, to show a given face.
 *
 * **This is a fact about the object, not a flag mediating an animation** (A18d).
 * It carries no duration, is not read during the motion, and gates nothing — the
 * value changes, the stylesheet transitions the rotation, and the compositor
 * owns everything in between.
 *
 * The gatefold is deliberately not a rotation of the box. §10b: "front → turn →
 * back is rotation; front → open → inner spread is a hinge. Two physical acts,
 * two motions, and sharing one would flatten the distinction." It keeps its own
 * transform on its own element and is out of this unit's scope.
 */
export function boxRotation(face: 'front' | 'back' | 'gatefold'): number {
  return face === 'back' ? 180 : 0;
}
