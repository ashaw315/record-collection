import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCENE = readFileSync(
  join(import.meta.dirname, 'WallScene.tsx'),
  'utf-8',
);

/**
 * **THE CAST SHADOW SHIPS, AND IT IS NOT ALLOWED TO GET TASTEFUL.**
 *
 * The shelf spent nine versions being wrong about depth and placement, and the
 * thing that made each error visible was a hard cast shadow in the diagnostic
 * view. Adam: *"the diagnostic proves a hard shadow works and the coloured
 * version may just be too timid."*
 *
 * The first `shadow` treatment was `planeColour.multiplyScalar(0.55)` — a
 * uniform darkening, not a shadow, which tested nothing and read as nothing.
 * **Timid was indistinguishable from absent**, and that is the finding this file
 * exists to protect: a future edit that softens the shadow "so it looks nicer"
 * reintroduces exactly the defect the whole shelf investigation was about.
 *
 * These are source assertions rather than render assertions because the scene
 * needs WebGL, which the unit layer does not have. They are deliberately narrow:
 * each one names a specific way the shadow could be switched off by accident.
 */
describe('the wall casts a real shadow, unconditionally', () => {
  it('enables the shadow map for every wall, not only a treatment', () => {
    expect(SCENE, 'shadow mapping is on').toMatch(/renderer\.shadowMap\.enabled\s*=\s*true/);
    expect(
      SCENE,
      'and not gated behind the shadow treatment, which would leave the default wall flat',
    ).not.toMatch(/treatment === 'shadow'\s*\)\s*\{\s*renderer\.shadowMap\.enabled/);
  });

  it('has every spine cast and the shelf receive', () => {
    expect(SCENE).toMatch(/castShadow\s*=\s*true/);
    expect(SCENE, 'the surface takes the shadow').toMatch(/surface\.receiveShadow/);
    expect(SCENE, 'and so does the lip').toMatch(/lip\.receiveShadow/);
  });

  /**
   * **The ambient is the shadow's real enemy.** At 1.5 a cast shadow is washed
   * to nothing regardless of how strong the key is — which is why the original
   * treatment read as no change at all. Fails against a revert to the old value.
   */
  it('keeps the ambient low enough for a shadow to land', () => {
    const ambient = SCENE.match(/AmbientLight\(0xffffff,\s*diagnostic \? [\d.]+ : ([\d.]+)\)/);
    expect(ambient, 'the shipping ambient is stated explicitly').not.toBeNull();

    const value = Number(ambient?.[1]);
    expect(value, 'a shadow cast into a 1.5 ambient is invisible').toBeLessThanOrEqual(1.2);
    expect(value, 'but the wall still has to be lit').toBeGreaterThan(0.8);
  });

  /**
   * The colour-multiply version, which is the shape of "make it subtler" that
   * this project already shipped once and could not see.
   */
  it('does not fake the shadow by darkening the plane', () => {
    expect(
      SCENE,
      'a uniform darkening is not a shadow and reads as nothing',
    ).not.toMatch(/planeColour\.multiplyScalar/);
  });
});
