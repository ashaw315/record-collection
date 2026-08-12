/**
 * What an uploaded file actually IS, read from its bytes (SPEC.md §5.9: "Max
 * 10MB, accept jpeg/png/webp only").
 *
 * The declared `Content-Type` on a multipart part is chosen by the client. It
 * is an assertion about the bytes, not the bytes — so it is evidence of nothing
 * and this module never reads it. Same rule as `safeImageUrl`'s scheme
 * allow-list: when the server can establish a fact itself, a value supplied by
 * someone else does not get to stand in for it.
 */

/** §5.9's cap, named so the endpoint and the Discogs cover fetch share one bound. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type AcceptedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The three §5.9 accepts, as a value the route can put in an error message. */
export const ACCEPTED_IMAGE_TYPES: readonly AcceptedImageType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;

  return signature.every((byte, index) => bytes[index] === byte);
}

const JPEG_SOI = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
/** "WEBP", at offset 8 — RIFF is a container, and WAV shares its first four bytes. */
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (startsWith(bytes, JPEG_SOI)) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';

  if (startsWith(bytes, RIFF)) {
    // The format tag sits after the 4-byte tag and 4-byte length, so a prefix
    // test on RIFF alone would accept a WAV as an image.
    const tag = bytes.subarray(8, 12);
    return startsWith(tag, WEBP_TAG) ? 'image/webp' : null;
  }

  return null;
}
