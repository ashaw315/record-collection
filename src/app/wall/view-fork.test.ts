import { describe, expect, it } from 'vitest';
import { FACTS_WIDTH, RAIL_WIDTH, isFarView, nearViewMinWidth } from './view-fork';
import { LANDING_PAD } from './landing';
import { PER_SHELF, unitPieces } from './unit';

/**
 * §11.24: the narrow shelf is the far view, measured rather than chosen.
 * §11.1 leaves the label as the only channel that identifies, so the near
 * view cannot shrink; the far view has no width floor at all, because its
 * labels are absent rather than shrunk. The fork is the width where the near
 * view stops being a fixture — the smallest fixture is one shelf of twenty,
 * and below the width that holds it beside the rail and the facts column the
 * pulled state does not exist to be presented either way.
 */
describe('the fork between the near view and the far view (§11.24)', () => {
  it('is the width that holds the rail, the facts column and one twenty-seat shelf with the region’s pad — derived from the fixture, not chosen', () => {
    const points = unitPieces(PER_SHELF).flatMap((piece) => piece.faces.flatMap((face) => face.points));
    const xs = points.map(([x]) => x);
    const fixture = Math.max(...xs) - Math.min(...xs);
    expect(fixture).toBeCloseTo(442, 0);
    expect(RAIL_WIDTH).toBe(148);
    expect(FACTS_WIDTH).toBe(420);
    expect(nearViewMinWidth()).toBe(Math.ceil(RAIL_WIDTH + FACTS_WIDTH + fixture + LANDING_PAD));
    expect(nearViewMinWidth()).toBe(1044);
  });

  it('puts 390 on the far side, the desktop the specs run at on the near side, and the boundary itself on the near side', () => {
    expect(isFarView(390)).toBe(true);
    expect(isFarView(nearViewMinWidth() - 1)).toBe(true);
    expect(isFarView(nearViewMinWidth())).toBe(false);
    expect(isFarView(1280)).toBe(false);
  });
});
