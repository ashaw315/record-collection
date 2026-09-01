/**
 * **Where the key light stands, and how hard its shadow falls.**
 *
 * The rig was one hardcoded position — `(-0.4, 0.8, 1)` scaled by the wall's
 * extent — giving **39.3 deg elevation at 42 deg azimuth**: a studio
 * three-quarter light. §10b describes a RAKING key, which is a different thing:
 * a raking light grazes the surface and picks out relief, and a high one flattens
 * it while throwing long shadows across the frame.
 *
 * Nothing could judge which was right, because there was no way to see a second
 * option. This makes the position a parameter so the question can be answered by
 * looking — the same reason the shelf treatments and the dim floor are sweepable.
 *
 * **Elevation is the axis that matters.** Azimuth changes which way the shadow
 * points; elevation changes whether the scene reads as lit-from-the-side (long
 * shadows, strong relief) or lit-from-above (short shadows, flat surfaces).
 */

/** Degrees above the horizon, and degrees off the camera's axis. */
export type LightAngle = { elevation: number; azimuth: number };

/**
 * The rig options `/scene` offers.
 *
 * **`raking` is what §10b asks for**; `studio` is what shipped. The two extremes
 * exist because a range whose ends are both plausible cannot show which end is
 * right — the shelf's own finding, where a timid shadow was indistinguishable
 * from none.
 */
export const LIGHT_RIGS = {
  /** Very low and hard across the wall — maximum relief, longest shadows. */
  raking: { elevation: 12, azimuth: 55 },
  /** Low, still directional. */
  low: { elevation: 25, azimuth: 48 },
  /** What has shipped since the first prototype. */
  studio: { elevation: 39, azimuth: 42 },
  /** Nearly overhead — short shadows, flat spines. */
  high: { elevation: 62, azimuth: 30 },
  /** Almost on the camera axis: shadows collapse behind their casters. */
  frontal: { elevation: 12, azimuth: 6 },
} as const;

export type LightRig = keyof typeof LIGHT_RIGS;

export const LIGHT_RIG_DEFAULT: LightRig = 'studio';

/**
 * The light's position for a given angle, at a distance that clears the scene.
 *
 * Spherical rather than the old Cartesian triple, because **elevation and
 * azimuth are the quantities being judged** and a position that encodes them
 * implicitly cannot be swept. The previous `(-0.4, 0.8, 1)` had to be run
 * through `atan2` to discover what angle it even was.
 *
 * `+y` is up and `+z` is toward the viewer, so a light in front of and above the
 * wall has positive both. Azimuth is measured from the camera's axis toward the
 * LEFT, matching the shipped rig's direction so `studio` reproduces it.
 */
export function lightPosition({
  elevation,
  azimuth,
  distance,
}: LightAngle & { distance: number }): { x: number; y: number; z: number } {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;

  /*
    The horizontal component shrinks as the light rises, which is what makes
    elevation and azimuth independent: raising the light does not swing it
    sideways.
  */
  const horizontal = Math.cos(el);

  return {
    x: -distance * horizontal * Math.sin(az),
    y: distance * Math.sin(el),
    z: distance * horizontal * Math.cos(az),
  };
}

/**
 * How far a caster's shadow is thrown per unit of its distance from the surface.
 *
 * **This is the number that decides whether a shadow reads as contact.** At 39
 * deg the offset is 1.10x the gap; at 12 deg it is 4.7x, which is why a raking
 * light produces the long wedges visible at `wall: light`. Returned so a test
 * can assert the relationship rather than restate the trigonometry.
 */
export function shadowThrow({ elevation }: { elevation: number }): number {
  const el = (elevation * Math.PI) / 180;

  return Math.cos(el) / Math.sin(el);
}
