import { describe, expect, it, vi } from 'vitest';
import { createBlobStorage, storageKeyFor } from './blob';

/**
 * The storage seam (SPEC.md §4.2: "Use Vercel Blob for storage. Store the
 * returned URL here.").
 *
 * The SDK call is INJECTED, for the same reason the Discogs client injects
 * `fetch`: a test that reaches Vercel is not a test, and CLAUDE.md §2 forbids
 * live external calls without exception. `createBlobStorage` takes the two
 * functions it needs, so every test here drives a fake and the production path
 * differs only in what is passed in.
 */

describe('storageKeyFor', () => {
  it('namespaces by record, so one record’s images cannot collide with another’s', () => {
    const key = storageKeyFor('11111111-1111-4111-8111-111111111111', 'sleeve.jpg');

    expect(key).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('keeps the extension, so the blob is served with a usable name', () => {
    expect(storageKeyFor('11111111-1111-4111-8111-111111111111', 'sleeve.jpg')).toMatch(/\.jpg$/);
    expect(storageKeyFor('11111111-1111-4111-8111-111111111111', 'back.PNG')).toMatch(/\.png$/);
  });

  it('does not let a filename escape its record’s prefix', () => {
    /**
     * The discriminating case. A filename is user-supplied, and `../` in it
     * would place the blob outside the record's namespace — overwriting
     * another record's image, or landing somewhere nothing cleans up.
     *
     * Verified against the real hostile shapes rather than a tidy one.
     */
    const id = '11111111-1111-4111-8111-111111111111';

    for (const hostile of ['../../etc/passwd.jpg', 'a/b/c.jpg', '..\\..\\win.jpg', './x.jpg']) {
      const key = storageKeyFor(id, hostile);

      expect(key, hostile).toMatch(new RegExp(`^records/${id}/[^/]+$`));
      expect(key, hostile).not.toContain('..');
    }
  });

  it('gives two uploads of the same filename different keys', () => {
    // Otherwise a second upload silently REPLACES the first's bytes while both
    // rows still point at the one URL — one image, two records claiming it.
    const id = '11111111-1111-4111-8111-111111111111';

    expect(storageKeyFor(id, 'cover.jpg')).not.toBe(storageKeyFor(id, 'cover.jpg'));
  });

  it('survives a filename with no extension at all', () => {
    const key = storageKeyFor('11111111-1111-4111-8111-111111111111', 'scan');

    expect(key).toMatch(/^records\/11111111-1111-4111-8111-111111111111\/[^/]+$/);
  });
});

describe('createBlobStorage', () => {
  // An ArrayBuffer, matching what the route hands the storage — the SDK's
  // PutBody takes a buffer, not a view.
  const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;

  it('returns the URL the SDK reports, not one it builds itself', async () => {
    /**
     * §4.2 says "store the RETURNED url". Constructing the URL from the key
     * would work until Vercel changed its host or added a suffix, and would
     * then write rows pointing at nothing.
     */
    const put = vi.fn().mockResolvedValue({ url: 'https://blob.example/records/abc/x.jpg' });
    const storage = createBlobStorage({ put, del: vi.fn() });

    const result = await storage.put('records/abc/x.jpg', BYTES, 'image/jpeg');

    expect(result.url).toBe('https://blob.example/records/abc/x.jpg');
  });

  it('uploads with the SNIFFED content type, not one the client chose', async () => {
    const put = vi.fn().mockResolvedValue({ url: 'https://blob.example/x.jpg' });
    const storage = createBlobStorage({ put, del: vi.fn() });

    await storage.put('records/abc/x.jpg', BYTES, 'image/jpeg');

    expect(put).toHaveBeenCalledWith(
      'records/abc/x.jpg',
      BYTES,
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });

  it('stores without a random suffix, because the key is already unique', async () => {
    // Vercel appends a random suffix by default. The key already carries one,
    // and a second source of randomness makes the stored URL unpredictable
    // from the key — which the delete path needs.
    const put = vi.fn().mockResolvedValue({ url: 'https://blob.example/x.jpg' });
    const storage = createBlobStorage({ put, del: vi.fn() });

    await storage.put('records/abc/x.jpg', BYTES, 'image/jpeg');

    expect(put).toHaveBeenCalledWith(
      'records/abc/x.jpg',
      BYTES,
      expect.objectContaining({ addRandomSuffix: false }),
    );
  });

  it('surfaces an upload failure rather than reporting a URL that does not exist', async () => {
    const put = vi.fn().mockRejectedValue(new Error('blob store unreachable'));
    const storage = createBlobStorage({ put, del: vi.fn() });

    await expect(storage.put('records/abc/x.jpg', BYTES, 'image/jpeg')).rejects.toThrow(
      /could not be stored/i,
    );
  });

  it('deletes by URL', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const storage = createBlobStorage({ put: vi.fn(), del });

    await storage.delete('https://blob.example/records/abc/x.jpg');

    expect(del).toHaveBeenCalledWith('https://blob.example/records/abc/x.jpg');
  });
});
