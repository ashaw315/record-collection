/**
 * The wall's shadow configuration, as a plain value.
 *
 * **THE CAST SHADOW SHIPS, AND IT IS NOT ALLOWED TO GET TASTEFUL.** The shelf
 * spent nine versions being wrong about depth and placement, and a hard cast
 * shadow is what made each error visible. §10b's settled values for light
 * elevation, shelf depth and the dim behind a pulled record were reached by
 * LOOKING at shadows and comparing — so this is the instrument every visual
 * judgement on this screen was made with, not one feature among many.
 *
 * **Why it lives here rather than inside `WallScene.tsx`.** It used to be a
 * `const castsShadow = true` in the middle of a 2700-line WebGL component,
 * with six assignments reading it. `wall-shadow.test.ts` guarded that by
 * reading the component AS A STRING and regex-matching property names — two of
 * its three assertions consumed no value at all. Measured 2026-09-05: flipping
 * that one boolean to `false` turned off every spine cast, both shelf receives
 * and the back panel receive, and the file stayed green at 4/4.
 *
 * A value in a `.ts` module is assertable without rendering anything, which is
 * the same move that made `TONE_CLASS` guardable. Nothing here changes what the
 * wall looks like: every number is lifted verbatim from the component.
 *
 * **What this module CANNOT give you, stated because the gap is the point.**
 * These are the values the scene is BUILT FROM, not the pixels it produces.
 * Asserting `SHADOW.enabled === true` proves three.js was told to cast; it
 * cannot prove a shadow lands, that the key is angled to throw one, or that
 * the ambient does not wash it out. Nothing in the unit layer can — WebGL does
 * not render there. **The guard for the rendering itself is a visual check**
 * (`/plane?diagnostic=1`, where a white object over a hard shadow is the whole
 * diagnostic), and that guard does not exist as an automated test. Tests
 * against this module are named after the configuration for exactly that
 * reason: a test named after the scene while asserting a config is how the
 * previous guard came to be vacuous.
 */

/** Which parts of the scene cast a shadow and which receive one. */
export type ShadowRole = { cast: boolean; receive: boolean };

export type ShadowRoles = {
  /** A record standing in the wall. */
  spine: ShadowRole;
  /** The shelf board the records stand on. */
  surface: ShadowRole;
  /** The front edge of that board. */
  lip: ShadowRole;
  /** The panel behind the records, which gives their shadows somewhere to land. */
  backPanel: ShadowRole;
};

export const SHADOW = {
  /**
   * **Every wall casts.** This was once gated behind the `shadow` treatment,
   * which meant the default wall had none — and "timid" was indistinguishable
   * from "absent", which is the finding the whole shelf investigation produced.
   * The diagnostic view changes the LIGHTING for legibility; it does not change
   * whether a shadow exists.
   */
  enabled: true,

  /**
   * **The ambient is the shadow's real enemy.** A shadow cast into a 1.5
   * ambient is washed to nothing regardless of how strong the key is, which is
   * why the first `shadow` treatment read as no change at all. Dropped to 1.05
   * for the shipping wall; the diagnostic goes further still, trading fidelity
   * for legibility.
   */
  ambient: { shipping: 1.05, diagnostic: 0.55 },

  /** Key light intensity. The diagnostic drives it harder so geometry reads. */
  keyIntensity: { shipping: 2.3, diagnostic: 2.6 },

  /** Square shadow map. Below ~1024 the shadow edge aliases and reads as a bug. */
  mapSize: 2048,
} as const;

/**
 * Who casts and who receives, derived from the single switch.
 *
 * A function rather than a constant because the roles are not independent: all
 * of them follow `enabled`, and scattering that relationship across six
 * assignment sites is what let one of them drift unnoticed.
 */
export function shadowRoles(enabled: boolean = SHADOW.enabled): ShadowRoles {
  return {
    spine: { cast: enabled, receive: enabled },
    surface: { cast: enabled, receive: enabled },
    lip: { cast: enabled, receive: enabled },
    /**
     * **Receives, never casts**, and the asymmetry is geometric rather than
     * incidental: a back panel that cast would shadow the very surfaces
     * standing in front of it. `false` unconditionally, so it stays false even
     * when shadows are on.
     */
    backPanel: { cast: false, receive: enabled },
  };
}

/**
 * The orthographic frustum the shadow is rendered through, sized to the wall.
 *
 * `far` is `extent * 4` so it clears the key light, which stands at `extent *
 * 1.4` — at `1x` the light would sit on the far plane and the shadow would
 * vanish. Lifted verbatim from the component.
 */
export function shadowCamera(extent: number): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
} {
  return {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 0.5,
    far: extent * 4,
  };
}
