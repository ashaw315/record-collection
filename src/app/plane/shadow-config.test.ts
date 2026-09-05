import { describe, expect, it } from 'vitest';
import { SHADOW, shadowCamera, shadowRoles } from './shadow-config';

/**
 * **THE CAST SHADOW SHIPS, AND IT IS NOT ALLOWED TO GET TASTEFUL.**
 *
 * The shelf spent nine versions being wrong about depth and placement, and the
 * thing that made each error visible was a hard cast shadow. The spec's settled
 * values for light elevation, shelf depth and the dim behind a pulled record
 * were all reached by LOOKING at shadows and comparing. So the shadow is not
 * one feature among many — it is the instrument every visual judgement on this
 * screen was made with.
 *
 * **Why this file exists rather than `wall-shadow.test.ts` alone.** That file
 * asserted shadow behaviour by reading `WallScene.tsx` as a STRING and
 * regex-matching property names, two of its three assertions consuming no value
 * at all. Proven by mutation on 2026-09-05: setting `castsShadow = false` — one
 * character — turned off every spine cast, both shelf receives and the back
 * panel receive, and the file stayed green at 4/4. The guard on the thing every
 * visual judgement rested on could not fail.
 *
 * The config is now a plain value in `shadow-config.ts`, so it is assertable
 * without rendering anything, which keeps CLAUDE.md's component-layer rule
 * ("No interaction, no CSS", and no WebGL) intact.
 *
 * **What this file does NOT do, stated because the distinction is the whole
 * lesson.** It asserts the CONFIGURATION, not the rendering. Nothing in the
 * unit layer can see a pixel of WebGL output, so no test here can prove a
 * shadow lands. It proves the scene is *told* to cast and receive. The gap
 * between those is real and is named in `shadow-config.ts`; the honest guard
 * for the rendering itself is a visual check, which is why these tests are
 * named after the config rather than after the scene.
 */

describe('SHADOW — the configuration the wall is built from', () => {
  /**
   * The one-character mutation. `castsShadow = false` at `WallScene.tsx:712`
   * switched off every shadow in the scene while four tests stayed green; this
   * is the assertion that would have caught it.
   */
  it('casts, unconditionally, on every wall', () => {
    expect(SHADOW.enabled).toBe(true);
  });

  /**
   * **Not gated behind a treatment.** The cast shadow was once conditional on
   * the `shadow` treatment, which left the DEFAULT wall flat — and a wall with
   * no shadow is the state nine versions of shelf work could not distinguish
   * from a wall with a bad one.
   */
  it('is not conditional on a treatment or on the diagnostic view', () => {
    expect(SHADOW.enabled, 'a boolean, not a predicate over treatment').toBe(true);
    expect(typeof SHADOW.enabled).toBe('boolean');
  });

  /**
   * **The ambient is the shadow's real enemy.** At 1.5 a cast shadow is washed
   * to nothing regardless of how strong the key is, which is why the first
   * `shadow` treatment read as no change at all.
   *
   * Bounds rather than an equality: this unit is forbidden from revisiting
   * settled wall values, so the test pins the RANGE the finding established
   * rather than re-deriving the number. A revert to 1.5 fails; a future tune
   * inside the range does not.
   */
  it('keeps the shipping ambient low enough for a shadow to land', () => {
    expect(SHADOW.ambient.shipping, 'a shadow cast into a 1.5 ambient is invisible').toBeLessThanOrEqual(1.2);
    expect(SHADOW.ambient.shipping, 'but the wall still has to be lit').toBeGreaterThan(0.8);
  });

  /**
   * The diagnostic trades fidelity for legibility — a dimmer ambient and a
   * stronger key — so it must be dimmer than the shipping wall, or it is not
   * doing the job it exists for.
   */
  it('gives the diagnostic a dimmer ambient than the shipping wall', () => {
    expect(SHADOW.ambient.diagnostic).toBeLessThan(SHADOW.ambient.shipping);
  });

  /** A shadow map too small reads as a jagged edge, which looks like a bug. */
  it('uses a shadow map large enough not to alias', () => {
    expect(SHADOW.mapSize).toBeGreaterThanOrEqual(1024);
  });
});

/**
 * **Who casts and who receives**, as a value rather than as six scattered
 * assignments in a 2700-line component.
 *
 * Each of these fails against a different one-property mutation, which is the
 * property `wall-shadow.test.ts` lacked: its regexes matched a property NAME
 * and consumed no value, so `surface.receiveShadow = false` passed.
 */
describe('shadowRoles — what casts and what receives', () => {
  const roles = shadowRoles(true);

  it('has every spine cast AND receive', () => {
    expect(roles.spine.cast, 'a spine that does not cast throws no shadow').toBe(true);
    expect(roles.spine.receive, 'and takes its neighbour’s').toBe(true);
  });

  it('has the shelf surface cast and receive', () => {
    expect(roles.surface.cast).toBe(true);
    expect(roles.surface.receive, 'the surface takes the shadow').toBe(true);
  });

  it('has the lip cast and receive', () => {
    expect(roles.lip.cast).toBe(true);
    expect(roles.lip.receive, 'and so does the lip').toBe(true);
  });

  /**
   * **The back panel receives and NEVER casts**, and that asymmetry is
   * load-bearing rather than incidental: a back panel that cast would shadow
   * the very surfaces standing in front of it.
   *
   * This is the assertion that would fail if someone "fixed" the panel to
   * behave like every other mesh.
   */
  it('has the back panel receive but never cast', () => {
    expect(roles.backPanel.receive, 'the spines’ shadows land on it').toBe(true);
    expect(roles.backPanel.cast, 'a casting back panel would shadow what stands in front').toBe(
      false,
    );
  });

  /**
   * The kill switch, from the other direction: with shadows off, nothing casts
   * and nothing receives — EXCEPT that the back panel still must not cast,
   * because its `false` is a geometric fact rather than a consequence of the
   * flag.
   */
  it('turns every role off when shadows are disabled', () => {
    const off = shadowRoles(false);

    for (const part of ['spine', 'surface', 'lip', 'backPanel'] as const) {
      expect(off[part].cast, `${part} must not cast`).toBe(false);
      expect(off[part].receive, `${part} must not receive`).toBe(false);
    }
  });
});

describe('shadowCamera — the frustum the shadow is rendered through', () => {
  /**
   * The shadow camera has to cover the whole wall or shadows clip at the edges,
   * which reads as records at the margin not casting at all.
   */
  it('spans the full extent in every direction', () => {
    const camera = shadowCamera(100);

    expect(camera.left).toBe(-100);
    expect(camera.right).toBe(100);
    expect(camera.top).toBe(100);
    expect(camera.bottom).toBe(-100);
  });

  /**
   * `far` must clear the wall by enough that the light's own distance — set at
   * 1.4x extent — still falls inside the frustum. At 1x the light sits ON the
   * far plane and the shadow vanishes.
   */
  it('reaches past the light, which stands at 1.4x the extent', () => {
    const camera = shadowCamera(100);

    expect(camera.far).toBeGreaterThan(100 * 1.4);
    expect(camera.near, 'near must stay in front of the camera').toBeGreaterThan(0);
    expect(camera.near).toBeLessThan(camera.far);
  });

  it('scales with the wall rather than being fixed', () => {
    expect(shadowCamera(200).right).toBe(2 * shadowCamera(100).right);
    expect(shadowCamera(200).far).toBe(2 * shadowCamera(100).far);
  });
});
