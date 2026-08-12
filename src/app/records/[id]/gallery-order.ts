/**
 * How the gallery arranges §4.2's image types.
 *
 * Pure, and separate from the component, because the ordering is a decision
 * rather than markup — a test asserting on rendered DOM would confirm whatever
 * order the code produced without ever stating what it should be.
 */

export const IMAGE_TYPE_ORDER = ['cover', 'back', 'label', 'matrix', 'other'] as const;

export type GalleryImageType = (typeof IMAGE_TYPE_ORDER)[number];

/** The shape the gallery needs, narrower than the full row. */
export type GalleryImage = {
  id: string;
  url: string;
  imageType: string | null;
  caption: string | null;
  createdAt: string | Date;
};

export type ImageGroup = { type: GalleryImageType; images: GalleryImage[] };

const LABELS: Record<GalleryImageType, string> = {
  cover: 'Cover',
  back: 'Back',
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
 * Groups images by type, in `IMAGE_TYPE_ORDER`, dropping empty groups.
 *
 * An untyped image — `image_type` is nullable (§4.2) — is filed under "other"
 * rather than discarded. The upload returned 201 and the file exists; showing
 * nothing would be indistinguishable from a failed upload, which is the
 * absence-as-success failure this build keeps meeting. An unrecognised value
 * from a future migration is filed the same way, for the same reason.
 */
export function groupImages(images: GalleryImage[]): ImageGroup[] {
  return IMAGE_TYPE_ORDER.map((type) => ({
    type,
    images: images
      .filter((image) =>
        type === 'other' ? !isKnownType(image.imageType) || image.imageType === 'other' : image.imageType === type,
      )
      // Oldest first: the gallery records a physical object, not a feed, and a
      // newest-first order would move every image whenever one is added.
      .sort((a, b) => time(a.createdAt) - time(b.createdAt)),
  })).filter((group) => group.images.length > 0);
}
