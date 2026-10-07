import type { CoverTreatment } from './cover-fit';

/**
 * The cover's travel (§M.7): from its square on the record page to the
 * modal's square, and back.
 *
 * **Decided by the build** (6 Oct: "You decide the duration, the
 * perspective strength and the fade length, and you accept them"):
 *
 * - 400ms for the travel, at every width, as §M.7 rules one duration. It
 *   is shorter than the turn's 600 because it comes first and the reader
 *   is waiting on it; on an ease-out most of the distance is done in the
 *   first 150.
 * - 150ms for the label and controls, starting at the landing: long enough
 *   to read as arriving after the cover, short enough not to be a second
 *   event.
 */
export const TRAVEL_MS = 400;
export const FADE_MS = 150;

export type Square = { left: number; top: number; size: number };

/** The travelling square at eased value `e`, 0 on the page and 1 in the modal: position and size on the one value. */
export function travelBox(e: number, page: Square, modal: Square): Square {
  const at = (a: number, b: number) => a + (b - a) * e;
  return { left: at(page.left, modal.left), top: at(page.top, modal.top), size: at(page.size, modal.size) };
}

/**
 * The photograph's drawn size inside a travelling square of side `side`.
 * The page crops a cover inside §33's bound, which is the photograph
 * covering the square; the modal fits every face, which is the photograph
 * inside it. "The crop eases out to the fit as the cover travels." Where
 * the page already fits the cover, it is fitted throughout.
 */
export function travelPhoto(e: number, side: number, natural: { width: number; height: number }, page: CoverTreatment): { width: number; height: number } {
  const aspect = natural.width / natural.height;
  const fitted = aspect >= 1 ? { width: side, height: side / aspect } : { width: side * aspect, height: side };
  if (page === 'fit') return fitted;
  const cropped = aspect >= 1 ? { width: side * aspect, height: side } : { width: side, height: side / aspect };
  return { width: cropped.width + (fitted.width - cropped.width) * e, height: cropped.height + (fitted.height - cropped.height) * e };
}
