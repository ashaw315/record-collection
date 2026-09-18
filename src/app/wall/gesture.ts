import { DEPTH, SPINE_HEIGHT, project, type PlacedSeat, type Point } from './geometry';
import { ARROW_LANE, LANDED_SIZE, LANDING_PAD } from './landing';
import type { View } from './view';
import { OPEN_ANGLE } from './rotation';

/**
 * The assembled gesture (8a §11.19, §11.21): **travel, growth and rotation on
 * one span, with the finish after it, and the return the whole thing
 * reversed on one clock.**
 *
 * The probe's numbers, exactly, since guessing them reproduces a different
 * gesture: the swing is 1300ms; travel is 290 · easeInOutCubic(k) over it;
 * rotation is 45° · easeInOutCubic(clamp((k − 0.42) / 0.58)), so it joins
 * at k = 0.42 — 546ms in, with the record 85.9 units out — and the phases
 * overlap: sequential read as slide, stop, pivot, three events for one
 * action. The clearance is angle-dependent, and the swing is legal at
 * every point because its eases are shaped to be (gesture.test.ts asserts
 * the joint state at every frame).
 *
 * **Growth is a parameter, held at 1** (see `GROWTH`). When it returns it
 * rides phase one's curve (§11.21) about the same fixed point as the
 * rotation. **Growth and rotation share one fixed point: the foot of the
 * cover's near vertical edge**, at y + depth (§11.21). The
 * rotation already holds that edge, so its foot is a point fixed by both
 * transforms; any other origin moves a point the rotation is holding
 * still. The gesture is that corner staying put while everything else
 * leaves — with the travel, which carries the corner itself.
 *
 * **The finish is added after the rotation, not carved out of it**: 300ms,
 * a number Design labels chosen rather than derived — long enough that a
 * 22.5% width change is not a cut, short enough to read as settling rather
 * than a third phase. It is the one number in the gesture a probe should
 * overrule, and the probe that gave 1300 could not have measured it;
 * expect it to move once the assembled gesture can be watched. Its two
 * terms (§11.17) are the projection undone on the 45° rectangle: the run
 * compressed by 0.8165 and the thickness sliver collapsing to zero,
 * together. Out is therefore 1600ms and the return 860 — 700 × 1600 / 1300.
 *
 * Every frame is the box rotated rigidly in three dimensions and
 * re-projected; nothing here interpolates a corner (§11.16).
 */
export const SWING_MS = 1300;
/** Chosen, not derived: the number a probe should overrule. */
export const FINISH_MS = 300;
export const OUT_MS = SWING_MS + FINISH_MS;
export const RETURN_MS = (700 * OUT_MS) / SWING_MS;
export const TRAVEL = 290;
export const ROTATION_START = 0.42;
/**
 * **No growth, for now.** The probe that read correctly never grew the record:
 * scale is a parameter of the construction, not a curve. §11.21 ruled growth
 * rides the travel on the argument that a record coming toward the reader
 * gets larger — but 3.73× over 290 units is not what approach looks like,
 * it is a zoom with a slide under it, and it was the dominant difference
 * from the probe. Growth is back with Design as its own question, with the
 * comparison in hand; the record leaves the row at its own size. §11.19's
 * 560 (`LANDED_SIZE`) waits with it.
 */
export const GROWTH = 1;
void LANDED_SIZE;

export type GestureState = { id: string; direction: 'out' | 'back'; ms: number };
export type Pose = { k: number; travel: number; scale: number; angle: number; finish: number };

export function easeInOutCubic(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Where on the out gesture's own time a state is: the return reads the same times backwards. */
export function outTime(state: GestureState): number {
  if (state.direction === 'out') return Math.min(OUT_MS, state.ms);
  return OUT_MS * (1 - Math.min(RETURN_MS, state.ms) / RETURN_MS);
}

export function settled(state: GestureState): boolean {
  return state.ms >= (state.direction === 'out' ? OUT_MS : RETURN_MS);
}

export function poseAt(t: number): Pose {
  const k = Math.min(1, Math.max(0, t / SWING_MS));
  const eased = easeInOutCubic(k);
  return {
    k,
    travel: TRAVEL * eased,
    scale: 1 + (GROWTH - 1) * eased,
    angle: OPEN_ANGLE * easeInOutCubic((k - ROTATION_START) / (1 - ROTATION_START)),
    finish: t <= SWING_MS ? 0 : easeInOutCubic((t - SWING_MS) / FINISH_MS),
  };
}

export type GestureFaces = {
  top: readonly Point[];
  cover: readonly Point[];
  spine: readonly Point[];
  /** The cover's plane: local (0..DEPTH, 0..SPINE_HEIGHT) from the near-top corner, toward the far end and down. */
  coverMatrix: string;
  /** The label's plane: local x up the spine, local y across its width, from the spine's bottom-left. */
  labelMatrix: string;
  /** The cover's corners in wall plan, for the advance claim. */
  coverWall: readonly (readonly [number, number])[];
  /** Axis-aligned wall-space bounds of the grown, rotated solid, for the painter's sort. */
  bounds: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  scale: number;
};

const fmt = (m: readonly number[]) => `matrix(${m.join(' ')})`;

/**
 * The record's three faces at a pose. Points of the box are (a, b, c):
 * `a` along the thickness from the cover (0 at the cover, width at the
 * body's far side), `b` along the run from the near edge to the far end,
 * `c` up. In wall space the foot F = (x + width, y + DEPTH + travel, z);
 * the thickness and run directions are rotated about F by `angle` and
 * scaled by `scale`. Through the finish the same points are laid out on a
 * basis that runs from the 45° projection to the page's plane.
 */
export function gestureFaces(seat: PlacedSeat, pose: Pose, drift: Point = [0, 0]): GestureFaces {
  const { scale: s, angle, finish: u, travel } = pose;
  /* The interim composition drift (see `landingDrift`), on the swing's own ease: nothing at 0, all of it from the swing's end. */
  const carried: Point = [drift[0] * easeInOutCubic(pose.k), drift[1] * easeInOutCubic(pose.k)];
  const w = seat.width;
  const foot: readonly [number, number, number] = [seat.x + w, seat.y + DEPTH + travel, seat.z];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  /* Unit directions in wall plan: thickness toward the body (−x rotated), run toward the far end (−y rotated). */
  const thick: readonly [number, number] = [-cos, -sin];
  const run: readonly [number, number] = [sin, -cos];

  const wall = (a: number, b: number, c: number): readonly [number, number, number] => [
    foot[0] + s * (a * thick[0] + b * run[0]),
    foot[1] + s * (a * thick[1] + b * run[1]),
    foot[2] + s * c,
  ];

  let screen: (a: number, b: number, c: number) => Point;
  if (u <= 0) {
    screen = (a, b, c) => {
      const [x, y] = project(...wall(a, b, c));
      return [x + carried[0], y + carried[1]];
    };
  } else {
    /* The finish: the projection removed on the rotated basis, both terms together. */
    const F = project(...foot);
    const T = project(thick[0], thick[1], 0);
    const R = project(run[0], run[1], 0);
    const Tu: Point = [T[0] * (1 - u), T[1] * (1 - u)];
    const Ru: Point = [R[0] + (1 - R[0]) * u, R[1] * (1 - u)];
    screen = (a, b, c) => [F[0] + carried[0] + s * (a * Tu[0] + b * Ru[0]), F[1] + carried[1] + s * (a * Tu[1] + b * Ru[1] - c)];
  }

  const H = SPINE_HEIGHT;
  const D = DEPTH;
  const cover = [screen(0, D, 0), screen(0, 0, 0), screen(0, 0, H), screen(0, D, H)];
  const spine = [screen(w, 0, 0), screen(0, 0, 0), screen(0, 0, H), screen(w, 0, H)];
  const top = [screen(w, D, H), screen(0, D, H), screen(0, 0, H), screen(w, 0, H)];

  const nearTop = cover[2];
  const farTop = cover[3];
  const nearBottom = cover[1];
  const coverMatrix = fmt([
    (farTop[0] - nearTop[0]) / D,
    (farTop[1] - nearTop[1]) / D,
    (nearBottom[0] - nearTop[0]) / H,
    (nearBottom[1] - nearTop[1]) / H,
    nearTop[0],
    nearTop[1],
  ]);
  const bl = spine[0];
  const tl = spine[3];
  const br = spine[1];
  const labelMatrix = fmt([(tl[0] - bl[0]) / H, (tl[1] - bl[1]) / H, (br[0] - bl[0]) / w, (br[1] - bl[1]) / w, bl[0], bl[1]]);

  const corners: (readonly [number, number, number])[] = [];
  for (const a of [0, w]) for (const b of [0, D]) for (const c of [0, H]) corners.push(wall(a, b, c));
  const bounds = {
    x0: Math.min(...corners.map(([x]) => x)),
    x1: Math.max(...corners.map(([x]) => x)),
    y0: Math.min(...corners.map(([, y]) => y)),
    y1: Math.max(...corners.map(([, y]) => y)),
    z0: foot[2],
    z1: foot[2] + s * H,
  };
  const coverWall = [wall(0, D, 0), wall(0, 0, 0), wall(0, 0, H), wall(0, D, H)].map(([x, y]) => [x, y] as const);

  return { top, cover, spine, coverMatrix, labelMatrix, coverWall, bounds, scale: s };
}

/**
 * **An interim composition rule, explicitly assumed, until Design places the
 * landed square.** The gesture's own construction lands a top-shelf record
 * above the region and a left-end record left of it: the foot stays at the
 * seat's screen height while the cover grows 560 up from it, and +y travel
 * carries it 251px left of a fixture that sits at the region's left edge.
 * §11.19 placed the landed square by composition — vertically centred, the
 * fixture clear beside it — and §11.20 reversed its side, and the two cannot
 * both hold in this region. Until that is ruled, the record is carried on
 * the swing's own ease by a screen-space drift that centres the landed
 * square vertically in the frozen view and keeps it inside the region's
 * arrow lanes. Zero when the construction already fits; the seated frame is
 * never touched. Recorded in NOTES as a finding, not a ruling.
 */
export function landingDrift(seat: PlacedSeat, view: View): Point {
  const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
  const xs = cover.map(([x]) => x);
  const ys = cover.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const left = view.x + LANDING_PAD + ARROW_LANE;
  const right = view.x + view.width - LANDING_PAD - ARROW_LANE;
  let dx = 0;
  if (minX < left) dx = left - minX;
  else if (maxX > right) dx = right - maxX;
  const dy = view.y + view.height / 2 - midY;
  return [dx, dy];
}
