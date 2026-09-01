import { describe, expect, it } from 'vitest';
import { LIGHT_RIGS, LIGHT_RIG_DEFAULT, lightPosition, shadowThrow } from './light-rig';

/**
 * The rig was one hardcoded triple whose angle nobody knew until it was measured
 * — 39.3 deg, where §10b asks for a raking key. These pin the properties that
 * make the range judgeable by looking.
 */
describe('the light rig is an angle, not a magic triple', () => {
  /**
   * **`studio` must reproduce what shipped**, or the range has no baseline and
   * "is the new one better" cannot be asked. Fails against a renumbered studio.
   */
  it('keeps the shipped rig as the reference point', () => {
    expect(LIGHT_RIGS[LIGHT_RIG_DEFAULT].elevation).toBe(39);
    expect(LIGHT_RIGS.studio.azimuth).toBe(42);
  });

  /**
   * **Elevation and azimuth must be independent.** A rig where raising the light
   * also swings it sideways cannot isolate the axis being judged.
   *
   * Fails against a naive `(x, y, z) = (−sin az, sin el, cos az)` that omits the
   * `cos(el)` horizontal term — there the azimuth's effect grows with elevation.
   */
  it('raises the light without swinging it sideways', () => {
    const low = lightPosition({ elevation: 10, azimuth: 45, distance: 1000 });
    const high = lightPosition({ elevation: 70, azimuth: 45, distance: 1000 });

    /* Same azimuth means the same x:z ratio at any elevation. */
    expect(low.x / low.z).toBeCloseTo(high.x / high.z, 6);
    expect(high.y).toBeGreaterThan(low.y);
  });

  /** Every rig sits at the distance asked for, so brightness is comparable. */
  it('places every rig on the same sphere', () => {
    for (const angle of Object.values(LIGHT_RIGS)) {
      const p = lightPosition({ ...angle, distance: 900 });

      expect(Math.hypot(p.x, p.y, p.z), `${angle.elevation}deg`).toBeCloseTo(900, 6);
    }
  });

  /** In front of the wall and above it — a light behind would backlight the spines. */
  it('puts every rig in front of the wall and above the horizon', () => {
    for (const angle of Object.values(LIGHT_RIGS)) {
      const p = lightPosition({ ...angle, distance: 900 });

      expect(p.z, 'in front').toBeGreaterThan(0);
      expect(p.y, 'above').toBeGreaterThan(0);
    }
  });
});

describe('shadow throw follows from elevation', () => {
  /**
   * **The measured number, pinned.** The shipped rig throws a shadow ~1.2x the
   * caster's distance from the surface; that is what produced the down-right
   * wedge measured at 1.10x on the real scene.
   */
  it('reproduces the shipped rig throw', () => {
    expect(shadowThrow({ elevation: 39 })).toBeCloseTo(1.23, 2);
  });

  /**
   * **A raking light throws far, an overhead one barely at all.** This is the
   * whole reason elevation is the axis worth sweeping, and it fails against any
   * implementation that inverts the relationship.
   */
  it('throws further as the light gets lower', () => {
    const rakes = shadowThrow(LIGHT_RIGS.raking);
    const studio = shadowThrow(LIGHT_RIGS.studio);
    const high = shadowThrow(LIGHT_RIGS.high);

    expect(rakes).toBeGreaterThan(studio);
    expect(studio).toBeGreaterThan(high);
    expect(high, 'an overhead light barely throws').toBeLessThan(1);
  });

  /**
   * **`raking` must actually rake**, which is a claim about that entry rather
   * than about the spread of the set.
   *
   * The first version of this test asserted only that max/min across all rigs
   * exceeded 4x — and **a mutation moving `raking` from 12deg to 35deg survived
   * it**, because `frontal` (12deg) and `high` (62deg) kept the set's spread
   * wide while the named entry quietly stopped raking. A test that measures an
   * aggregate cannot see one member drift.
   *
   * §10b's raking key is the thing under test, so the threshold is on it: a
   * light that throws less than 3x its caster's gap is not grazing the surface.
   */
  it('keeps the raking rig genuinely raking', () => {
    expect(shadowThrow(LIGHT_RIGS.raking), 'grazing, not merely low').toBeGreaterThan(3);
    expect(LIGHT_RIGS.raking.elevation, 'below the shipped rig by a wide margin').toBeLessThan(20);
  });

  /** And the set must still span, so the ends are not both mild. */
  it('spans a range wide enough to judge', () => {
    const throws = Object.values(LIGHT_RIGS).map((a) => shadowThrow(a));

    expect(Math.max(...throws) / Math.min(...throws), 'a real spread').toBeGreaterThan(4);
  });
});
