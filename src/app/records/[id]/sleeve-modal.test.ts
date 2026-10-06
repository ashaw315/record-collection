import { describe, expect, it } from 'vitest';
import { SLEEVE_STACK_BELOW, sleeveSquare } from './sleeve-modal';
import { displayedCover, newestOfType } from './gallery-order';

/**
 * §M.4: "The closed sleeve is the same size on every record at a given
 * viewport... It is the largest square that fits the space below the top
 * row, less the controls' row and an 18 inset."
 *
 * The ruling gives the row (53), the controls (44) and the inset (18). It
 * does not give the face label's line or the two gaps that set the label
 * between the sleeve and the controls; those are this build's proposal,
 * 11 for the line and 12 each side, and they are stated here so a change to
 * them is a change to a test.
 */
describe('sleeveSquare: the closed sleeve’s side, from the viewport alone', () => {
  it('reserves 115 below the row: 18, the sleeve, 12, the 11 label, 12, the 44 controls, 18', () => {
    expect(SLEEVE_STACK_BELOW).toBe(18 + 12 + 11 + 12 + 44 + 18);
  });

  /* Fails against a square taken from the width alone: 1404 where 732 fits. */
  it('is bounded by the height on a wide window: 1440 × 900 gives 900 − 53 − 115 = 732', () => {
    expect(sleeveSquare(1440, 900)).toBe(732);
  });

  /* Fails against a square taken from the height alone: 676 where 354 fits. */
  it('is bounded by the width less an 18 inset each side on a phone: 390 × 844 gives 354', () => {
    expect(sleeveSquare(390, 844)).toBe(354);
  });

  it('is a whole number of pixels, rounded down, and never negative', () => {
    expect(sleeveSquare(1000.5, 700.75)).toBe(532);
    expect(sleeveSquare(390, 120)).toBe(0);
  });
});

function image(id: string, imageType: string | null, createdAt: string) {
  return { id, url: `https://blob.example/${id}.jpg`, imageType, caption: null, createdAt };
}

/** §M.2: "Every face shows the newest photo of its type." */
describe('newestOfType', () => {
  const images = [
    image('back-old', 'back', '2026-01-01T00:00:00Z'),
    image('cover', 'cover', '2026-09-01T00:00:00Z'),
    image('back-new', 'back', '2026-10-01T00:00:00Z'),
    image('left', 'gatefold_left', '2026-03-01T00:00:00Z'),
  ];

  /* Fails against the wall's built order, oldest first. */
  it('picks the newest row of the type asked for, whatever order the rows come in', () => {
    expect(newestOfType(images, 'back')?.id).toBe('back-new');
    expect(newestOfType([...images].reverse(), 'back')?.id).toBe('back-new');
    expect(newestOfType(images, 'gatefold_left')?.id).toBe('left');
  });

  it('is null where the record has none of that type', () => {
    expect(newestOfType(images, 'gatefold_right')).toBeNull();
  });

  it('is the rule the displayed cover already follows', () => {
    expect(displayedCover(images)).toBe(newestOfType(images, 'cover'));
  });
});
