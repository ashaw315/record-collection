import { risePose } from './rise-pose';
import { easeRiseInOut } from './motion-tuning';
import { wallDimTo } from './wall-dim';
import { WALL_DIM_FLOOR } from './wall-dim';

/**
 * **Every property the pull drives, at one point in the motion.**
 *
 * Built after the THIRD regression in this animation, all of the same shape: one
 * property advancing out of step with the others, and every one found by looking
 * at a screenshot and describing what seemed wrong.
 *
 *   - the blur snapped to full while the record had not moved;
 *   - the record travelled BACKWARDS on a one-row wall while its size held;
 *   - the record slid to centre while still edge-on, because position used a
 *     hardcoded ease-out and the pose used ease-in-out.
 *
 * **The last one is why `travel` exists here at all, and it is the root cause
 * rather than the symptom.** Position was the only driven property with no pure
 * function — it was lerped inline in `WallScene` with a duplicated ease-out. It
 * drifted precisely because it was the one quantity nobody could see.
 *
 * > **An inline computation is invisible to every layer of the suite by
 * > construction.** Not under-tested — UNTESTABLE, until it is given a name. The
 * > unit layer cannot import it, the component layer does not evaluate it, and
 * > E2E sees only its rendered result. Extracting `riseTravel` is what made this
 * > whole file possible.
 *
 * ---
 *
 * **WHAT THIS CANNOT COVER**, attached here rather than left in a commit
 * message, because a reader finding a "motion table" will reasonably assume it
 * covers motion. **It covers value relationships between pure functions.**
 *
 * 1. **TIMING.** Every column is parameterised by PROGRESS, not milliseconds.
 *    The duration mismatch (rise and return sharing 620ms) and the four
 *    hardcoded `waitForTimeout` races were both defects of the same week, and
 *    neither would appear here: they are about WHEN progress advances, not what
 *    holds at a given progress.
 * 2. **Anything not driven by a pure function** — the camera, the shelf
 *    geometry, the chrome's CSS fade, the tilt. **A property only becomes
 *    visible here once it is a sampled quantity**, which is why the blur's snap
 *    stayed invisible until the blur became a sampled column. (The blur has
 *    since been dropped — see NOTES — but the lesson generalises to every
 *    property not yet sampled.)
 * 3. **Rendering.** Everything downstream of the numbers: the composite that
 *    painted the baked wall out, the colour-space chase, the record blurred by
 *    the composer. All of those had correct values and a wrong image.
 * 4. **Whether the design is right.** It shows that properties agree, not that
 *    agreement is what is wanted. The "return should be faster" instinct and its
 *    reversal were both judgements no table settles.
 */
export type MotionSample = {
  /** 0..1 through the animation, before easing. */
  t: number;
  /** How far along its path the record has travelled, 0..1. */
  travel: number;
  /** Radians about Y: π/2 edge-on, 0 face-on. */
  rotationY: number;
  /** Forward of the wall plane. */
  depth: number;
  /** Size in the scene, spine-sized to full. */
  scale: number;
  /** The wall's brightness multiplier. */
  dim: number;
};

/**
 * **The easing position uses, named rather than inlined.**
 *
 * It was `1 - Math.pow(1 - progress, 3)` written out inside `WallScene`, while
 * `risePose` used `easeRiseInOut`. They had been the same curve, so the
 * duplication was invisible until one of them changed.
 */
export const riseTravel = (progress: number): number => easeRiseInOut(progress);

/**
 * Samples every driven property at `t`, for the pull or the return.
 *
 * Pure, so both the divergence test and the printed table read the same numbers
 * the scene does — there is no second implementation to disagree with the first.
 */
export function motionSample({
  t,
  returning = false,
  slotDepth = 1,
  dimFloor = WALL_DIM_FLOOR,
}: {
  t: number;
  returning?: boolean;
  slotDepth?: number;
  dimFloor?: number;
}): MotionSample {
  /* The return runs the same description backwards; progress is what reverses. */
  const progress = returning ? 1 - t : t;
  const pose = risePose({ progress, slotDepth });

  return {
    t,
    travel: riseTravel(progress),
    rotationY: pose.rotationY,
    depth: pose.z,
    scale: pose.scale,
    dim: wallDimTo(progress, dimFloor),
  };
}

/**
 * The whole motion as a printed table, for scanning by eye.
 *
 * **A test fires on a threshold set in advance; a table shows the SHAPE**,
 * including whatever nobody thought to assert. Every regression in this
 * animation was found by looking, and this is the cheapest way to keep looking
 * without a browser.
 *
 * Columns are normalised to 0..1 where they have a natural range, so a glance
 * shows whether they advance together — divergence appears as one column out of
 * step with its neighbours.
 */
export function motionTable({
  returning = false,
  steps = 10,
}: { returning?: boolean; steps?: number } = {}): string {
  const rows: string[] = [];
  const header = ['t', 'travel', 'turn', 'depth', 'scale', 'dim'];
  rows.push(header.map((h) => h.padStart(7)).join(' '));

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s = motionSample({ t, returning });
    /* Turn as 0..1 from edge-on to face-on, so it reads like the others. */
    const turn = 1 - s.rotationY / (Math.PI / 2);
    rows.push(
      [t, s.travel, turn, s.depth, s.scale, s.dim]
        .map((v) => v.toFixed(3).padStart(7))
        .join(' '),
    );
  }

  return rows.join('\n');
}
