import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';
import { COVER_WIDTH, coverSrc } from './cover-src';

/**
 * **A grid cover is fetched at the size its cell shows (the coordinator, 23 Nov, on the throttled phone probe).** The
 * covers are served as stored, a median of 99 KB and up to 3.1 MB, into a 160 cell; on fast 3G one 2 MB PNG alone took
 * 14.4s after the reply. Through Next's optimiser at 320, twice the cell, the phone fetches a resized copy. Fails against
 * a cover drawn from the blob URL directly, a width the optimiser would refuse (one not in `images.imageSizes` answers
 * 400), and a blob host the config does not allow.
 */
const BLOB = 'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/abc/cover.png';

describe('coverSrc', () => {
  it('sends a blob cover through the optimiser at 320', () => {
    expect(COVER_WIDTH).toBe(320);
    expect(coverSrc(BLOB)).toBe(`/_next/image?url=${encodeURIComponent(BLOB)}&w=320&q=75`);
  });

  it('leaves a data URL and any other host as they are: the optimiser takes neither', () => {
    expect(coverSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(coverSrc('https://i.discogs.com/x.jpg')).toBe('https://i.discogs.com/x.jpg');
  });

  it('asks for a width the config serves, from a host the config allows', () => {
    expect(nextConfig.images?.imageSizes ?? []).toContain(COVER_WIDTH);
    const allowed = (nextConfig.images?.remotePatterns ?? []).some((p) => typeof p !== 'string' && 'hostname' in p && p.protocol === 'https' && p.hostname === '*.public.blob.vercel-storage.com');
    expect(allowed, 'the blob store’s hosts are allowed').toBe(true);
  });
});
