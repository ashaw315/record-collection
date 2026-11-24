/**
 * **A grid cover is fetched at the size its cell shows (23 Nov).** Production's covers are stored as uploaded or as
 * Discogs sends them, a median of 99 KB and up to 3.1 MB, and the grid drew them into 160-pixel cells as they were; on a
 * phone's fast 3G one 2 MB PNG alone took 14.4s after the ask's reply (scripts/probe-cover-paint.mts). Through Next's
 * optimiser at 320, twice the cell, the phone fetches a resized copy; the original stays as stored. Only the blob store's
 * covers go through it: a data URL (the suites' covers) and any other host are drawn as they are, since the optimiser
 * takes neither. The width must be one of next.config's `images.imageSizes`, or the optimiser answers 400.
 */
export const COVER_WIDTH = 320;
/**
 * The shelf's pulled face and the record page's cover (23 Nov): measured at 433 to 448 CSS px for the face and 480 to 546
 * for the record page on the laptop, and 390 on the phone, so near 1080 at two and three device pixels; one width for
 * both so they share each transformation. The optimiser never enlarges, so a 600-pixel source comes back at 600.
 */
export const COVER_LARGE_WIDTH = 1080;
const BLOB = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

export function coverSrc(url: string, width: number = COVER_WIDTH): string {
  return BLOB.test(url) ? `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75` : url;
}
