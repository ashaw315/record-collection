import { SPINE_WIDTH_MAX, frontFace, type PlacedSeat } from './geometry';
import { OUT_MS, SWING_MS, easeInOutCubic, gestureFaces, outTime, poseAt, type GestureState } from './gesture';
import { ARROW_LANE, LANDING_PAD } from './landing';
import type { View } from './view';

/**
 * §W.22: **the view pans; the gesture does not move.** The record's
 * transforms stay exactly as §W.21 rules them, and the drawing region pans
 * so that the landing is in frame — on the swing's own ease and one clock,
 * resolving to zero when the landing is already in frame.
 *
 * The gesture is authored in the wall's coordinates and the landing is
 * specified in the page's, and nothing was converting between them. A drift
 * converts by moving the object, and a fixed point that is itself moving is
 * the negation of §W.21's argument, not a weaker version of it. A pan
 * converts by moving the viewport, which the wall already does (§W.6): the
 * fixture moving on screen during the pull is the correct cost — the wall
 * stays still relative to itself and the record, and only the window over
 * it moves. A person at a shelf steps across to look at the record.
 *
 * **§W.26: the pan gains a target — it settles where the empty seat clears
 * the cover's trailing edge.** 290 units of travel and 560px of cover are
 * each right in their own space and collide in the frame: the landed cover
 * covers its own empty seat, which §W.10 makes the mark of which record is
 * out and §W.22 the separation that replaces a scrim. Neither the travel
 * (watched on a probe) nor the cover (bounded below by the fixture and the
 * seat staying visible) moves; the landing is the pan's business.
 * Mechanically the record carries a horizontal offset from its gesture
 * position (`recordOffset`), and the pan pays for it: the view's target is
 * the canonical framing of the SHIFTED landing, so the record's screen path
 * is exactly the gesture's under the framing pan, and the wall slides under
 * it by the clearance. The offset rides the pan's own ease and unwinds with
 * it, so the seat is covered only while the cover is arriving and uncovers
 * as it leaves.
 */
export type Extent = { minX: number; maxX: number; minY: number; maxY: number };

/** §W.19: the empty seat sits this far clear of the landed cover's trailing edge. */
export const SEAT_CLEARANCE = 55;

/**
 * The horizontal shift (svg px, ≤ 0 — leftward) the landed record carries so
 * the empty seat's near edge is SEAT_CLEARANCE past the cover's right edge.
 * Zero when the seat already clears it.
 *
 * Measured on the seat at its WIDEST spine, so the shift is one number for
 * every seat: the cover's right edge sits at the foot, x + width, and a
 * shift that followed the width would make a neighbour's framing differ by
 * the pitch plus the width difference — and §W.22's same-screen-position
 * landing needs exactly the pitch. A narrower seat clears by more.
 */
export function clearanceShift(seat: PlacedSeat): number {
  const widest = { ...seat, width: SPINE_WIDTH_MAX };
  const cover = gestureFaces(widest, poseAt(OUT_MS)).cover;
  const coverRight = Math.max(...cover.map(([x]) => x));
  const seatLeft = Math.min(...frontFace(widest).map(([x]) => x));
  return Math.min(0, seatLeft - SEAT_CLEARANCE - coverRight);
}

/** The moving record's offset from its gesture position at a state: the shift on the pan's own fraction, zero at rest. */
export function recordOffset(seat: PlacedSeat, state: GestureState): [number, number] {
  const dx = clearanceShift(seat) * panFraction(state);
  return [dx === 0 ? 0 : dx, 0];
}

/** The frame the landing needs, in the svg's px: the landed cover, shifted by the clearance, with its arrow lanes across and the page's padding down. */
export function landedExtent(seat: PlacedSeat): Extent {
  const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
  const shift = clearanceShift(seat);
  const xs = cover.map(([x]) => x + shift);
  const ys = cover.map(([, y]) => y);
  return {
    minX: Math.min(...xs) - LANDING_PAD - ARROW_LANE,
    maxX: Math.max(...xs) + LANDING_PAD + ARROW_LANE,
    minY: Math.min(...ys) - LANDING_PAD,
    maxY: Math.max(...ys) + LANDING_PAD,
  };
}

/**
 * The view that frames a landing the same way every time — the view's
 * top-left in the svg's px: the landing's extent (its lane included) at the
 * view's left, since the record lands left of the fixture, and centred
 * vertically (§W.19's composition, now a statement about the framed view).
 * For a neighbour reached by the arrows it differs by exactly the seat
 * pitch, which is what lands it in the same screen position (§W.22).
 */
export function frameView(extent: Extent, view: Pick<View, 'width' | 'height'>): [number, number] {
  return [extent.minX, (extent.minY + extent.maxY) / 2 - view.height / 2];
}

/** A pan: from the view where the gesture began to the view it arrives at, on the swing's ease of the record driving it. */
export type Pan = { forId: string; from: [number, number]; to: [number, number]; at0: number };

/**
 * Where the view is at a state of the driving record: on the way out, from
 * → to on the swing's eased travel; on the way back, the view retraces to
 * the pre-gesture view as the travel unwinds — scaled from wherever the
 * return began, so a put-back mid-swing is continuous.
 */
export function panView(pan: Pan, state: GestureState): [number, number] {
  const eased = easeInOutCubic(Math.min(1, outTime(state) / SWING_MS));
  if (state.direction === 'out') return [pan.from[0] + (pan.to[0] - pan.from[0]) * eased, pan.from[1] + (pan.to[1] - pan.from[1]) * eased];
  /* The return: the travel unwinds from at0 to 0, and the view retraces from where the return began to the pre-gesture view. */
  const f = pan.at0 > 0 ? Math.min(1, eased / pan.at0) : 0;
  return [pan.to[0] + (pan.from[0] - pan.to[0]) * f, pan.to[1] + (pan.from[1] - pan.to[1]) * f];
}

/** The eased travel at a state, for a return's starting scale. */
export function panFraction(state: GestureState): number {
  return easeInOutCubic(Math.min(1, outTime(state) / SWING_MS));
}

/**
 * The whole view at the landing's framing — what the frame must hold so
 * the framing is always reachable by scrolling: a landing centred in the
 * view needs the room above and below it, not only its own extent.
 */
export function framedViewExtent(seat: PlacedSeat, view: Pick<View, 'width' | 'height'>): Extent {
  const [x, y] = frameView(landedExtent(seat), view);
  return { minX: x, maxX: x + view.width, minY: y, maxY: y + view.height };
}
