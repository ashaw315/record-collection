import type { PlacedSeat } from './geometry';
import { OUT_MS, SWING_MS, easeInOutCubic, gestureFaces, outTime, poseAt, type GestureState } from './gesture';
import { ARROW_LANE, LANDING_PAD } from './landing';
import type { View } from './view';

/**
 * §11.22: **the view pans; the gesture does not move.** The record's
 * transforms stay exactly as §11.21 rules them, and the drawing region pans
 * so that the landing is in frame — on the swing's own ease and one clock,
 * resolving to zero when the landing is already in frame.
 *
 * The gesture is authored in the wall's coordinates and the landing is
 * specified in the page's, and nothing was converting between them. A drift
 * converts by moving the object, and a fixed point that is itself moving is
 * the negation of §11.21's argument, not a weaker version of it. A pan
 * converts by moving the viewport, which the wall already does (§11.6): the
 * fixture moving on screen during the pull is the correct cost — the wall
 * stays still relative to itself and the record, and only the window over
 * it moves. A person at a shelf steps across to look at the record.
 */
export type Extent = { minX: number; maxX: number; minY: number; maxY: number };

/** The frame the landing needs, in the svg's px: the landed cover with its arrow lanes across and the page's padding down. */
export function landedExtent(seat: PlacedSeat): Extent {
  const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
  const xs = cover.map(([x]) => x);
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
 * vertically (§11.19's composition, now a statement about the framed view).
 * For a neighbour reached by the arrows it differs by exactly the seat
 * pitch, which is what lands it in the same screen position (§11.22).
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
