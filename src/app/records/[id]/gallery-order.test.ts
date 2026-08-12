import { describe, expect, it } from 'vitest';
import { IMAGE_TYPE_ORDER, groupImages, imageTypeLabel } from './gallery-order';

/**
 * How the gallery arranges §4.2's five image types.
 *
 * Ordering is separated from rendering because it is the part with a rule in
 * it: the sequence is deliberate, and a component test asserting on rendered
 * DOM would prove the order without ever stating what the order should BE.
 */

function image(id: string, imageType: string | null, createdAt = '2026-01-01T00:00:00Z') {
  return { id, url: `https://blob.example/${id}.jpg`, imageType, caption: null, createdAt };
}

describe('IMAGE_TYPE_ORDER', () => {
  it('runs cover, back, label, matrix, other', () => {
    /**
     * Not alphabetical and not the enum's declaration order by accident — this
     * is the order someone examines a record in: the front first, then the
     * back, then the centre label, then the dead wax. Matrix sits late because
     * it is the specialist's field (CLAUDE.md §8), not the identifying glance.
     */
    expect(IMAGE_TYPE_ORDER).toEqual(['cover', 'back', 'label', 'matrix', 'other']);
  });
});

describe('groupImages', () => {
  it('returns groups in IMAGE_TYPE_ORDER, whatever order the rows arrive in', () => {
    const groups = groupImages([
      image('a', 'matrix'),
      image('b', 'cover'),
      image('c', 'label'),
    ]);

    expect(groups.map((group) => group.type)).toEqual(['cover', 'label', 'matrix']);
  });

  it('omits a type with no images rather than showing an empty heading', () => {
    // An empty "Back" heading asserts a back photo exists and failed to load —
    // absence rendered as something, which is the family this build keeps
    // meeting. Nothing is the honest rendering of nothing.
    const groups = groupImages([image('a', 'cover')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('cover');
  });

  it('keeps an untyped image rather than dropping it', () => {
    /**
     * `image_type` is nullable in §4.2, and an upload with no type chosen is
     * legal. Dropping it would lose a file the user successfully stored — the
     * upload said 201 and the gallery would show nothing, with no way to tell
     * that from a failed upload.
     */
    const groups = groupImages([image('a', null)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('other');
    expect(groups[0].images).toHaveLength(1);
  });

  it('files an untyped image alongside genuinely "other" ones', () => {
    const groups = groupImages([image('a', 'other'), image('b', null)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].images.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('orders within a group oldest first, so the first upload stays first', () => {
    // The gallery is a record of a physical object, not a feed. A newest-first
    // order would move an image every time another is added.
    const groups = groupImages([
      image('newer', 'cover', '2026-03-01T00:00:00Z'),
      image('older', 'cover', '2026-01-01T00:00:00Z'),
    ]);

    expect(groups[0].images.map((row) => row.id)).toEqual(['older', 'newer']);
  });

  it('handles a record with no images at all', () => {
    expect(groupImages([])).toEqual([]);
  });

  it('does not invent a group for an unknown type from the database', () => {
    /**
     * The enum constrains writes, but this function receives whatever the row
     * holds — a future migration adding a type would otherwise render an
     * unlabelled group. Filed under "other" so the image is still reachable.
     */
    const groups = groupImages([image('a', 'sleeve-detail')]);

    expect(groups.map((group) => group.type)).toEqual(['other']);
    expect(groups[0].images).toHaveLength(1);
  });
});

describe('imageTypeLabel', () => {
  it('names each type the way the form does', () => {
    expect(imageTypeLabel('cover')).toBe('Cover');
    expect(imageTypeLabel('back')).toBe('Back');
    expect(imageTypeLabel('label')).toBe('Label');
    expect(imageTypeLabel('other')).toBe('Other');
  });

  it('spells matrix out, because "Matrix" alone names the wrong thing', () => {
    // §4.2 calls the field matrix_runout and the form says "Matrix / runout".
    // A heading reading just "Matrix" invites confusion with the catalog
    // number; this is the dead wax.
    expect(imageTypeLabel('matrix')).toBe('Matrix / runout');
  });
});
