import { describe, expect, it } from 'vitest';
import { IMAGE_TYPE_ORDER, displayedCover, imageTypeLabel, imagesShown, orderImages } from './gallery-order';

/**
 * How the gallery arranges §4.2's image types (six since §10b's gatefold).
 *
 * Ordering is separated from rendering because it is the part with a rule in
 * it: the sequence is deliberate, and a component test asserting on rendered
 * DOM would prove the order without ever stating what the order should BE.
 */

function image(id: string, imageType: string | null, createdAt = '2026-01-01T00:00:00Z') {
  return { id, url: `https://blob.example/${id}.jpg`, imageType, caption: null, createdAt };
}

describe('IMAGE_TYPE_ORDER', () => {
  it('runs cover, back, both gatefold leaves, label, matrix, other', () => {
    /**
     * Not alphabetical and not the enum's declaration order by accident — this
     * is the order someone examines a record in: the front first, then the
     * back, then inside, then the centre label, then the dead wax. Matrix sits
     * late because it is the specialist's field (CLAUDE.md §8), not the
     * identifying glance.
     *
     * `gatefold` (§10b) joined after `back` and NOT at the end: it is the
     * sleeve's own artwork, and filing it behind close-ups of the dead wax
     * would bury the thing a gatefold exists for. The rule this test states did
     * not change — the new state was placed by it.
     */
    expect(IMAGE_TYPE_ORDER).toEqual([
      'cover',
      'back',
      'gatefold_left',
      'gatefold_right',
      'label',
      'matrix',
      'other',
    ]);
  });
});

describe('orderImages (§56: one flowing grid, the fixed type order, no groups)', () => {
  it('returns every non-cover image in IMAGE_TYPE_ORDER, whatever order the rows arrive in', () => {
    /* Not a cover among them: the frame owns that one. */
    const tiles = orderImages([
      image('a', 'matrix'),
      image('b', 'back'),
      image('c', 'label'),
    ]);

    expect(tiles.map((tile) => tile.type)).toEqual(['back', 'label', 'matrix']);
    expect(tiles.map((tile) => tile.image.id)).toEqual(['b', 'c', 'a']);
  });

  it('is one flat list, not groups: two images of one type are two tiles in sequence', () => {
    /* §56: "The images that are not the cover flow in one grid in the fixed type order... group labels are dropped." */
    const tiles = orderImages([image('a', 'label'), image('b', 'back'), image('c', 'label', '2026-02-01T00:00:00Z')]);

    expect(tiles.map((tile) => `${tile.type}:${tile.image.id}`)).toEqual(['back:b', 'label:a', 'label:c']);
  });

  it('keeps an untyped image rather than dropping it, filed as other', () => {
    /**
     * `image_type` is nullable in §4.2, and an upload with no type chosen is
     * legal. Dropping it would lose a file the user successfully stored — the
     * upload said 201 and the gallery would show nothing, with no way to tell
     * that from a failed upload.
     */
    const tiles = orderImages([image('a', null)]);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].type).toBe('other');
  });

  it('files an untyped image alongside genuinely "other" ones, after every known type', () => {
    /* Distinct times: within a type the order is oldest first, and these two share the type. */
    const tiles = orderImages([image('b', null, '2026-02-01T00:00:00Z'), image('a', 'other', '2026-01-01T00:00:00Z'), image('m', 'matrix')]);

    expect(tiles.map((tile) => tile.image.id)).toEqual(['m', 'a', 'b']);
    expect(tiles.map((tile) => tile.type)).toEqual(['matrix', 'other', 'other']);
  });

  it('orders within a type oldest first, so the first upload stays first', () => {
    // The gallery is a record of a physical object, not a feed. A newest-first
    // order would move an image every time another is added.
    const tiles = orderImages([
      image('newer', 'back', '2026-03-01T00:00:00Z'),
      image('older', 'back', '2026-01-01T00:00:00Z'),
    ]);

    expect(tiles.map((tile) => tile.image.id)).toEqual(['older', 'newer']);
  });

  it('handles a record with no images at all', () => {
    expect(orderImages([])).toEqual([]);
  });

  it('does not invent a type for an unknown value from the database', () => {
    /**
     * The enum constrains writes, but this function receives whatever the row
     * holds — a future migration adding a type would otherwise render an
     * unlabelled tile. Filed under "other" so the image is still reachable.
     */
    const tiles = orderImages([image('a', 'sleeve-detail')]);

    expect(tiles.map((tile) => tile.type)).toEqual(['other']);
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

describe('gatefold — §10b\'s third state', () => {
  /**
   * §10b: "a sleeve that folds out is a third state, reached by a different
   * gesture from turning the record over, because it is a different physical
   * act." Front → turn → back is rotation; front → open → inner spread is a
   * hinge.
   *
   * This unit only makes the value STORABLE and displayable in the gallery. The
   * shelf affordance that reads it comes later, and §10b is explicit that the
   * affordance appears only where an inner image exists — there is no generated
   * stand-in, because folding a sleeve open onto a panel of metadata would
   * invent the artwork the user opened it to see.
   */
  it('orders gatefold between back and label', () => {
    /**
     * The gallery reads front, back, inside, then the detail shots. Placing it
     * after `matrix` would file the sleeve's own artwork behind close-ups of
     * the dead wax.
     */
    const order = [...IMAGE_TYPE_ORDER];

    expect(order.indexOf('gatefold_left')).toBeGreaterThan(order.indexOf('back'));
    expect(order.indexOf('gatefold_right')).toBeLessThan(order.indexOf('label'));
    // Adjacent, and left before right: the two halves of one spread belong
    // together and in the order a reader meets them.
    expect(order.indexOf('gatefold_right') - order.indexOf('gatefold_left')).toBe(1);
  });

  it('carries a heading of its own', () => {
    // "Gatefold" rather than "Inside": the collector's word, and it says the
    // sleeve folds rather than describing where the photo was taken.
    expect(imageTypeLabel('gatefold_left')).toMatch(/gatefold/i);
    expect(imageTypeLabel('gatefold_right')).toMatch(/gatefold/i);
    // Distinguishable, because a gallery of six photographs has to say which
    // half of the spread each one is.
    expect(imageTypeLabel('gatefold_left')).not.toBe(imageTypeLabel('gatefold_right'));
  });

  it('orders a gatefold image under its own type rather than dropping it as unknown', () => {
    /**
     * The discriminating case. `orderImages` files through `isKnownType`,
     * so a value present in the database but absent from `IMAGE_TYPE_ORDER`
     * would be filed as other — the image would upload successfully, sit in
     * the table, and lose its name.
     */
    const tiles = orderImages([
      {
        id: 'g1',
        url: 'https://blob.example/inner.jpg',
        imageType: 'gatefold_left',
        caption: null,
        createdAt: '2026-08-17T00:00:00Z',
      },
    ]);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].type).toBe('gatefold_left');
  });
});

describe('the frame owns the cover, so the gallery does not repeat it', () => {
  /**
   * **The one pure repetition the inventory found.** 8a's sleeve cell renders
   * the cover at six columns; the gallery rendered it again below the fold, so
   * the same image appeared twice on one screen. §8 makes the sections below
   * the fold the FULL SET behind the frame's summary — but a cover shown whole
   * in the frame has no fuller version, so it is repetition rather than depth.
   *
   * Excluded here rather than in the component, because "which images the
   * gallery shows" is the ordering function's question and a component-level
   * filter would leave `orderImages` claiming to order every image.
   */
  it('leaves the cover out of the tiles', () => {
    const tiles = orderImages([
      { id: '1', url: 'u1', imageType: 'cover', caption: null, createdAt: '2024-01-01' },
      { id: '2', url: 'u2', imageType: 'back', caption: null, createdAt: '2024-01-02' },
    ]);

    expect(tiles.map((tile) => tile.type)).toEqual(['back']);
  });

  it('returns nothing for a record whose only image is its cover', () => {
    /*
      **The common case, and the reason this needs its own assertion.** Every
      record in the collection has exactly one image and it is always a cover,
      so this is what the gallery renders on all seventeen — not an edge case.
    */
    expect(
      orderImages([
        { id: '1', url: 'u1', imageType: 'cover', caption: null, createdAt: '2024-01-01' },
      ]),
    ).toEqual([]);
  });

  it('is not distinguishable from a record with no images, and that is the defect', () => {
    /**
     * Both return `[]`, so the component cannot tell "no images" from "only a
     * cover, which the frame is showing" — and the empty state says "No images
     * yet", which is FALSE for the second. The component has to be told which
     * it is; this asserts the two really are identical at this layer so the
     * fix cannot be attempted here.
     */
    const onlyCover = orderImages([
      { id: '1', url: 'u1', imageType: 'cover', caption: null, createdAt: '2024-01-01' },
    ]);

    expect(onlyCover).toEqual(orderImages([]));
  });
});

/**
 * §61 (step 72): "The record shows its newest cover." The frame's sleeve
 * and the shelf both read this; the build showed the oldest, so an upload
 * sat beside the Discogs image unseen.
 */
describe('displayedCover (§61: the newest cover)', () => {
  it('returns the newest cover row, whatever order the rows arrive in', () => {
    const shown = displayedCover([
      image('old', 'cover', '2026-01-01T00:00:00Z'),
      image('new', 'cover', '2026-10-01T20:53:18Z'),
      image('mid', 'cover', '2026-06-01T00:00:00Z'),
    ]);
    expect(shown?.id).toBe('new');
  });

  it('ignores every other type: a newer back photograph is not the cover', () => {
    const shown = displayedCover([image('c', 'cover', '2026-01-01T00:00:00Z'), image('b', 'back', '2026-10-01T00:00:00Z')]);
    expect(shown?.id).toBe('c');
  });

  it('is null with no cover at all, which is §54’s record', () => {
    expect(displayedCover([image('b', 'back')])).toBeNull();
    expect(displayedCover([])).toBeNull();
  });
});

/**
 * §62 (step 73): "The Images count counts what the page shows: the displayed
 * cover and the gallery's tiles, and nothing the page does not draw. ...
 * Covers the page does not show are named, not folded into the count."
 * It counted every row, so Bitches Brew read Images 5 above one tile.
 */
describe('imagesShown (§62: the count is what the page draws; earlier covers are named beside it)', () => {
  /* Fails against the `shown` sum in imagesShown: counting rows gives 5. */
  it('counts the displayed cover and the tiles, and names the other covers: four covers and a back are 2 and 3', () => {
    const rows = [
      image('c1', 'cover', '2026-08-01T00:00:00Z'),
      image('c2', 'cover', '2026-10-01T20:50:00Z'),
      image('c3', 'cover', '2026-10-01T20:51:00Z'),
      image('c4', 'cover', '2026-10-01T20:53:18Z'),
      image('b', 'back', '2026-10-01T21:00:00Z'),
    ];
    expect(imagesShown(rows)).toEqual({ shown: 2, earlierCovers: 3 });
  });

  /* Fails against `earlierCovers`: a record that holds only what it shows carries no clause, so the figure must be 0, not 1. */
  it('names no earlier cover on a record that holds only what it shows', () => {
    expect(imagesShown([image('c', 'cover')])).toEqual({ shown: 1, earlierCovers: 0 });
    expect(imagesShown([image('c', 'cover'), image('b', 'back'), image('l', 'label')])).toEqual({ shown: 3, earlierCovers: 0 });
  });

  /* Fails against the cover term: with no cover the frame draws none, so only tiles count and nothing is "earlier". */
  it('counts only the tiles where there is no cover, and nothing at all on an empty record', () => {
    expect(imagesShown([image('b', 'back'), image('m', 'matrix')])).toEqual({ shown: 2, earlierCovers: 0 });
    expect(imagesShown([])).toEqual({ shown: 0, earlierCovers: 0 });
  });

  /* Fails against the tile term reading known types only: an untyped row is drawn as an Other tile, so it is counted. */
  it('counts an untyped image, which the gallery draws under Other', () => {
    expect(imagesShown([image('c', 'cover'), image('u', null)])).toEqual({ shown: 2, earlierCovers: 0 });
  });
});
