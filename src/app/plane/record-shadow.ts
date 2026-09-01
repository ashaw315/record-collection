import { sceneZ, type SceneZ } from './frames';
import { shelfSurfaceSpan } from './wall-framing';

/**
 * **The pulled record's shadow on the wall behind it.**
 *
 * Adam, on why this and not the blur: *"it is the effect I actually wanted when
 * I asked for blur — the record reading as an object in front of something
 * rather than pasted on it."*
 *
 * The blur tried to separate the record from the wall by destroying the wall's
 * detail. A shadow separates them by asserting the SPACE between them, which is
 * the thing actually being communicated. It also costs one plane and one light
 * setting rather than a second render path.
 *
 * ---
 *
 * **THE WALL HAD NOWHERE FOR A SHADOW TO LAND**, which is why this needed
 * geometry rather than only a strength control.
 *
 * `WALL_BACK` is `scene.background` — a clear colour, not a surface. Only the
 * shelf plane and lip had `receiveShadow`, so a record pulled forward cast onto
 * nothing: verified by looking at a 125-record wall with a record settled, where
 * the spines shadowed the shelf beneath them and the pulled record had no shadow
 * at all.
 *
 * **§10b is protected by the MATERIAL, not by this module.** A shadow cannot
 * fall on a cover because cover faces are `MeshBasicMaterial` (`surface-kind.ts`
 * returns `unlit` for every photographed face) and a basic material has no
 * lighting term to darken. The `receiveShadow` flag on a record mesh is
 * therefore inert on its photographed faces and live only on its lit edges,
 * which is the correct split rather than a lucky one.
 */

/**
 * Where the shadow-catching plane sits, in scene Z.
 *
 * **Behind the shelf's own back edge**, so it is behind every spine, the shelf
 * board and the lip, and cannot intercept anything. The shelf spans -107..133
 * (`shelfSurfaceSpan`), so the plane sits at its back.
 *
 * Not at `z = 0`: the wall plane at 0 is where the CAMERA is framed, and putting
 * receiving geometry there would catch shadows in front of the shelf's rear
 * portion.
 */
export function shadowPlaneZ(): SceneZ {
  return sceneZ(shelfSurfaceSpan().back);
}

/**
 * The shadow's strength range, as `/scene` offers it.
 *
 * **The top of the range is deliberately past what looks right to me.** Adam:
 * *"my judgement of these effects runs stronger than yours, and I would rather
 * have the top of the range available than discover the ceiling is too low."*
 * The shelf's own finding is the precedent — a timid shadow was measured
 * indistinguishable from no shadow at all, and the fix was a HARD one.
 *
 * These are darkness multipliers: 0 is no shadow, 1 is a fully opaque one.
 */
export const SHADOW_STRENGTHS = {
  off: 0,
  subtle: 0.25,
  medium: 0.5,
  strong: 0.75,
  /** Past what reads right to me, kept because the ceiling must be reachable. */
  heavy: 1,
} as const;

export type ShadowStrength = keyof typeof SHADOW_STRENGTHS;

export const SHADOW_STRENGTH_DEFAULT: ShadowStrength = 'medium';

/**
 * How dark the shadow is at a given point in the rise.
 *
 * **Driven by the rise's own progress**, not by a second clock — the constraint
 * that governed the dim and the one the split-easing regression broke. A shadow
 * on its own timer would drift out of step with the record casting it, which is
 * the exact defect class `motion-sample.ts` exists to catch.
 *
 * **Linear, like `wallDim` and for the same reason.** A record at 15% of its
 * travel has barely left the wall, and an eased curve would put most of the
 * shadow's arrival there — the front-loading that makes the backdrop resolve
 * ahead of the object. The shadow should arrive WITH the record.
 */
export function shadowOpacity({
  progress,
  strength,
}: {
  progress: number;
  strength: number;
}): number {
  const t = Math.min(1, Math.max(0, progress));

  return t * strength;
}

/**
 * How far the shadow spreads, as a radius multiplier, at a given progress.
 *
 * **A shadow softens as its caster moves away from the surface** — the real
 * behaviour Adam asked for ("it grows and softens as the record comes forward").
 * At rest the record is in its slot and the shadow is tight; settled, it is far
 * forward and the shadow is broad and diffuse.
 *
 * Returned as a multiplier on the light's base radius so the caller does not
 * need to know the units.
 */
export function shadowSpread({ progress }: { progress: number }): number {
  const t = Math.min(1, Math.max(0, progress));

  /*
    1 -> 4 across the travel. A shadow four times as soft at full extension is
    a large change, and it should be: the record moves most of the camera's
    distance to the wall, so the real spread would be larger still.
  */
  return 1 + 3 * t;
}
