import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, sniffImageType } from './image-type';

/**
 * SPEC.md §5.9: "Max 10MB, accept jpeg/png/webp only."
 *
 * **Sniffed from the BYTES, never from the declared `Content-Type`.** A
 * multipart part's type is a string the client chose; it is an assertion, not a
 * fact, and the server can establish the fact itself by reading four bytes.
 * This is the same rule as `safeImageUrl`'s scheme allow-list — a value chosen
 * by someone else is not evidence about the thing it describes.
 *
 * Magic numbers are constructed from byte arrays rather than string literals,
 * because these are not text and a literal would be an encoding accident
 * waiting to happen (NOTES: the NFD test whose precondition was destroyed by
 * being written to disk).
 */

/** JPEG: SOI marker FF D8 FF. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** PNG: 89 50 4E 47 0D 0A 1A 0A. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

/** WebP: "RIFF" .... "WEBP" — the format tag is at offset 8, not 0. */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

/** GIF89a — a real image, and one §5.9 does not accept. */
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);

describe('sniffImageType', () => {
  it('recognises the three formats §5.9 accepts', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('rejects an image format that is not on the list', () => {
    // GIF is a genuine image. The list is an ALLOW-list, so "it is an image"
    // is not the test — "it is one of these three" is.
    expect(sniffImageType(GIF)).toBeNull();
  });

  it('rejects a file whose bytes are not an image at all', () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    expect(sniffImageType(html)).toBeNull();
  });

  it('rejects a RIFF container that is not WebP', () => {
    /**
     * The discriminating case for the WebP check, and the reason it cannot be
     * a prefix test. RIFF is a generic container — WAV is `RIFF....WAVE`. A
     * check reading only the first four bytes accepts an audio file as an
     * image.
     */
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74,
      0x20,
    ]);

    expect(sniffImageType(wav)).toBeNull();
  });

  it('rejects a file too short to carry a signature', () => {
    // A truncated upload must not read past the end of the buffer.
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it('does not accept a JPEG signature appearing later in the file', () => {
    /**
     * The signature identifies the file only at offset 0. A payload that
     * merely CONTAINS the bytes — an HTML file with a JPEG embedded, say —
     * is not a JPEG, and treating it as one is how a sniffer gets bypassed.
     */
    const notLeading = new Uint8Array([0x00, 0x00, 0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    expect(sniffImageType(notLeading)).toBeNull();
  });
});

describe('MAX_IMAGE_BYTES', () => {
  it('is §5.9’s 10MB, expressed so the number is checkable', () => {
    // Named rather than inlined at the call site: the endpoint, the Discogs
    // cover fetch (unit 4) and the client all have to agree on one bound.
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});
