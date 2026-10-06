/**
 * How the gallery arranges §4.2's image types.
 *
 * Pure, and separate from the component, because the ordering is a decision
 * rather than markup — a test asserting on rendered DOM would confirm whatever
 * order the code produced without ever stating what it should be.
 */

/**
 * §4.2's types in the order a sleeve is examined: front, back, inside, then the
 * detail shots.
 *
 * The two gatefold leaves (§10b, A21a) sit together after `back` rather than at
 * the end — they are the sleeve's own artwork, and filing them behind close-ups
 * of the dead wax would bury the thing a gatefold exists for.
 *
 * Left before right, because that is the order a reader meets them on an open
 * sleeve rather than an alphabetical accident.
 */
export const IMAGE_TYPE_ORDER = [
  'cover',
  'back',
  'gatefold_left',
  'gatefold_right',
  'label',
  'matrix',
  'other',
] as const;

export type GalleryImageType = (typeof IMAGE_TYPE_ORDER)[number];

/** The shape the gallery needs, narrower than the full row. */
export type GalleryImage = {
  id: string;
  url: string;
  imageType: string | null;
  caption: string | null;
  createdAt: string | Date;
};

/** One tile of §56's flowing grid: the image and the type it is filed under. */
export type ImageTile = { type: GalleryImageType; image: GalleryImage };

const LABELS: Record<GalleryImageType, string> = {
  cover: 'Cover',
  back: 'Back',
  // The collector's word, and it says the sleeve FOLDS rather than describing
  // where the photograph was taken — "Inside" would do the latter. Two leaves
  // since A21a, distinguished because a reader looking at a gallery of six
  // photographs needs to know which half of the spread each one is.
  gatefold_left: 'Gatefold (left)',
  gatefold_right: 'Gatefold (right)',
  label: 'Label',
  // Spelled out: a heading reading just "Matrix" invites confusion with the
  // catalog number, and §4.2's column is `matrix_runout` — this is the dead wax.
  matrix: 'Matrix / runout',
  other: 'Other',
};

export function imageTypeLabel(type: GalleryImageType): string {
  return LABELS[type];
}

function isKnownType(value: string | null): value is GalleryImageType {
  return value !== null && (IMAGE_TYPE_ORDER as readonly string[]).includes(value);
}

function time(value: string | Date): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/**
 * §56 (step 66): the non-cover images as ONE ordered list, in
 * `IMAGE_TYPE_ORDER` and oldest first within a type, each filed under the
 * type its badge names. The gallery flows them in one grid "so a row fills
 * before it wraps"; the group a type once made is gone, and with it the
 * row a group of one cost beside empty cells. The order is the one someone
 * examines a record in -- front, back, inside, label, dead wax.
 *
 * The frame owns the cover, so it is left out: a cover shown whole in the
 * frame has no fuller version below the fold. Every record in the
 * collection has exactly one image and it is a cover, so for all of them
 * this returns [] -- which the component must not read as "no images"
 * (see `ImageGallery`).
 *
 * An unknown value from the database is filed under other, so a stored
 * image is always reachable; the enum constrains writes, not what a row
 * may hold after a later migration.
 */
export function orderImages(images: GalleryImage[]): ImageTile[] {
  const withoutCover = images.filter((image) => image.imageType !== 'cover');
  return IMAGE_TYPE_ORDER.flatMap((type) =>
    withoutCover
      .filter((image) =>
        type === 'other' ? !isKnownType(image.imageType) || image.imageType === 'other' : image.imageType === type,
      )
      // Oldest first: the gallery records a physical object, not a feed, and a
      // newest-first order would move every image whenever one is added.
      .sort((a, b) => time(a.createdAt) - time(b.createdAt))
      .map((image) => ({ type, image })),
  );
}

/**
 * §61 (step 72): the cover a record shows is its NEWEST cover row -- the
 * owner's own photograph of their own copy is a better source than the
 * catalogue image that arrived first, and §5.2 reads the record, not the
 * catalogue. Null is §54's record: no cover at all.
 */
export function displayedCover(images: GalleryImage[]): GalleryImage | null {
  return newestOfType(images, 'cover');
}

/**
 * §M.2: "Every face shows the newest photo of its type: the front the
 * newest cover, as §61 rules for the page, the back the newest back, and
 * each inside leaf the newest of its own type." One rule for every face, so
 * the displayed cover is this function asked for a cover.
 */
export function newestOfType(images: GalleryImage[], type: GalleryImageType): GalleryImage | null {
  let newest: GalleryImage | null = null;
  for (const image of images) {
    if (image.imageType !== type) continue;
    if (newest === null || time(image.createdAt) > time(newest.createdAt)) newest = image;
  }
  return newest;
}

/**
 * §62 (step 73): what the Images line counts. "The Images count counts what
 * the page shows: the displayed cover and the gallery's tiles, and nothing
 * the page does not draw." A count beside a page reads as a count of that
 * page; it counted every row, so a record with four covers and a back read
 * 5 above one sleeve and one tile. The covers the page does not show "are
 * named, not folded into the count", since the line is the only place a
 * reader learns they exist.
 *
 * Built from the two functions that decide what is drawn, so the count
 * cannot drift from the page: `displayedCover` for the frame, `orderImages`
 * for the gallery.
 */
export function imagesShown(images: GalleryImage[]): { shown: number; earlierCovers: number } {
  const cover = displayedCover(images) === null ? 0 : 1;
  const covers = images.filter((image) => image.imageType === 'cover').length;
  return { shown: cover + orderImages(images).length, earlierCovers: covers - cover };
}
