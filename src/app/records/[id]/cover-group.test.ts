import { describe, expect, it } from 'vitest';
import { coverGroup, displayedCover } from './gallery-order';

/**
 * §62 (step 165): "The group lists every cover the record holds, newest
 * first, and the cover the page shows is first and marked as the one shown."
 * Pure, beside `displayedCover`, so the mark cannot drift from what the frame
 * draws: the first of the group IS the displayed cover, by the same clock.
 *
 * Fails against `gallery-order.ts`: the sort, the mark, the cover filter.
 */
function image(id: string, imageType: string | null, createdAt: string) {
  return { id, url: `https://example.test/${id}.jpg`, imageType, caption: null, createdAt };
}

describe('coverGroup (§62: every cover, newest first, the shown one first and marked)', () => {
  it('lists the covers newest first and marks only the first as shown', () => {
    const images = [
      image('old', 'cover', '2026-01-01T00:00:00Z'),
      image('back', 'back', '2026-01-04T00:00:00Z'),
      image('new', 'cover', '2026-01-03T00:00:00Z'),
      image('mid', 'cover', '2026-01-02T00:00:00Z'),
    ];
    const group = coverGroup(images);
    expect(group.map((g) => g.image.id)).toEqual(['new', 'mid', 'old']);
    expect(group.map((g) => g.shown)).toEqual([true, false, false]);
    /* The mark is the frame's cover, not a separate decision. */
    expect(group[0]?.image.id).toBe(displayedCover(images)?.id);
  });

  it('is empty for a record with no cover (§54), whatever else it holds', () => {
    expect(coverGroup([image('b', 'back', '2026-01-01T00:00:00Z')])).toEqual([]);
    expect(coverGroup([])).toEqual([]);
  });
});
