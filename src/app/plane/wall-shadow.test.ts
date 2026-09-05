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

  /**
   * **MOVED to `shadow-config.test.ts`, and the reason is the point of this
   * whole file.**
   *
   * This test used to read:
   *
   *     expect(SCENE).toMatch(/castShadow\s*=\s*true/);
   *     expect(SCENE).toMatch(/surface\.receiveShadow/);
   *     expect(SCENE).toMatch(/lip\.receiveShadow/);
   *
   * The last two match a property NAME and consume no value, so
   * `surface.receiveShadow = false` passed. And the first matched two literals
   * sitting INSIDE `if (castsShadow) { ... }` blocks, so flipping that one
   * boolean to `false` — killing every spine cast, both shelf receives and the
   * back panel receive — left this file green at 4/4. Measured, not reasoned:
   * that mutation was run on 2026-09-05 and nothing failed.
   *
   * Who casts and who receives is now a VALUE in `shadow-config.ts`, asserted
   * there against eight mutations. This comment stays because the deleted
   * assertions are more instructive than the ones that replaced them.
   */

  it('reads its shadow roles from the config rather than inlining them', () => {
    expect(SCENE, 'the roles come from shadow-config').toMatch(
      /from '\.\/shadow-config'/,
    );
    /**
     * The regex that CAN still earn its place: no literal `true` assignment to
     * a shadow property, which is what re-inlining a role would look like. A
     * value re-hardcoded here would drift from the config silently, and the
     * config's tests would go on passing while the scene ignored it.
     */
    for (const mesh of ['mesh', 'surface', 'lip', 'panel']) {
      expect(
        SCENE,
        `${mesh}'s shadow role must come from the config, not a literal`,
      ).not.toMatch(new RegExp(`${mesh}\\.(?:cast|receive)Shadow\\s*=\\s*(?:true|false)`));
    }
    /**
     * `key.castShadow = true` is deliberately NOT covered: the light casting is
     * not a mesh role, and it already sits behind the config's `enabled` flag.
     */
  });

  /**
   * **The ambient is the shadow's real enemy.** At 1.5 a cast shadow is washed
   * to nothing regardless of how strong the key is — which is why the original
   * treatment read as no change at all. Fails against a revert to the old value.
   */
  /**
   * **MOVED to `shadow-config.test.ts`** along with the value itself. This
   * regex parsed the ambient out of the source text; it is now a number in a
   * module and asserted directly, so parsing the component for it would be a
   * proxy where the real value is in reach.
   *
   * What remains here is the one thing the config cannot express: that the
   * component actually READS it rather than carrying its own literal.
   */
  it('takes its ambient from the config rather than a literal', () => {
    expect(SCENE, 'the ambient comes from the config').toMatch(/SHADOW\.ambient\./);
    expect(
      SCENE,
      'and is not also hardcoded, which would drift from the config silently',
    ).not.toMatch(/AmbientLight\(0xffffff,\s*diagnostic \? [\d.]+ : [\d.]+\)/);
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
