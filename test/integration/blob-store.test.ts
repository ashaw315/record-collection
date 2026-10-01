import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { getBlobStorage, storageKeyFor } from '@/lib/storage/blob';

/**
 * **The one test that crosses Vercel Blob for real.** The boundary rule
 * (NOTES, "A test that replaces an external adapter proves the caller and
 * never the boundary"): every external boundary carries either one test that
 * crosses it for real, gated on the credential and failing loudly when the
 * credential is present but the crossing fails, or a stated note. This is
 * Blob's. The route's tests replace the adapter with a spy, which is how a
 * store-side refusal -- the project's OIDC setting turning on, the SDK then
 * preferring OIDC over the read-write token -- passed green from 25 August
 * until the sheet ran.
 *
 * **Three states, not two**, on the Neon transaction test's pattern:
 *   - `BLOB_TEST_READ_WRITE_TOKEN` absent: the named skip below prints in the
 *     count, as "absent", never as a pass.
 *   - present and the put, read-back and delete succeed: the boundary is
 *     crossed with the token passed EXPLICITLY, which is the fix under test --
 *     on an OIDC-enabled project the SDK's own resolution would be refused.
 *   - present and any of the three fails: a loud failure, not a skip.
 *
 * The token is for a store you accept a one-byte object being written to
 * under `diagnostics/` and deleted again. It is read from the environment
 * at run time only, never from a file this repository loads: run as
 *   BLOB_TEST_READ_WRITE_TOKEN='…' npx vitest run test/integration/blob-store.test.ts
 */
const token = process.env.BLOB_TEST_READ_WRITE_TOKEN;
const configured = token !== undefined && token !== '';

/** One real PNG: a 1 × 1 image, the smallest body the adapter's content sniffing accepts. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0xe2, 0x26, 0x05, 0x9b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('Vercel Blob, crossed for real', () => {
  const original = process.env.BLOB_READ_WRITE_TOKEN;
  let uploaded: string | null = null;
  afterAll(async () => {
    /* Teardown is gated on the same probe: a delete that fails here must not bury the message that says what is wrong. */
    if (uploaded !== null && configured) {
      process.env.BLOB_READ_WRITE_TOKEN = token;
      await getBlobStorage().delete(uploaded).catch(() => undefined);
    }
    if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = original;
  });

  (configured ? it : it.skip)(configured ? 'crosses the store for real: puts, reads back and deletes a one-byte object under diagnostics/ with the token passed explicitly' : 'NOT crossed: BLOB_TEST_READ_WRITE_TOKEN is absent, so Vercel Blob is unverified in this run', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = token;
    const storage = getBlobStorage();
    const key = storageKeyFor('diagnostics', `vitest-${randomUUID()}.png`).replace(/^records\//, 'diagnostics/');
    const { url } = await storage.put(key, PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength), 'image/png');
    uploaded = url;
    expect(url, 'the SDK reports a URL').toMatch(/^https:\/\//);
    const response = await fetch(url);
    expect(response.status, 'the object is readable at the URL the SDK reported').toBe(200);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body), 'and is the bytes that were put').toEqual(Array.from(PNG));
    await storage.delete(url);
    uploaded = null;
  }, 30_000);

});
