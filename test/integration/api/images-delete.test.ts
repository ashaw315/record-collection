import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { DELETE as deleteImageRoute } from '@/app/api/images/[id]/route';
import { POST as uploadImage } from '@/app/api/records/[id]/images/route';
import { POST as createRecord } from '@/app/api/records/route';
import { images } from '@/db/schema';
import { logger } from '@/lib/logger';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';
import * as storage from '@/lib/storage/blob';

/**
 * SPEC.md §5.9: `DELETE /api/images/:id` — "Deletes blob and row."
 *
 * **The row goes first, and that is the whole design of this endpoint.**
 *
 * Blob and Postgres cannot be enrolled in one transaction, so either can fail
 * alone and no order is atomic. The two wreckages are not equally bad:
 *
 *   - blob with no row — invisible, costs pennies, nothing renders it;
 *   - row with no blob — **a permanently broken image on the detail screen**,
 *     indistinguishable from a real one until it fails to load.
 *
 * So delete the row first and treat the blob delete as best-effort. The failure
 * that survives is the cheap one. (Upload does the reverse for the same reason —
 * store, then write the row.)
 */

const db = getTestDb();

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const STORED_URL = 'https://blob.example/records/abc/stored.jpg';

let delSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await truncateAll();

  // This suite seeds through the upload endpoint, which now refuses to start
  // without a configured store. No real token is present — correctly — so the
  // check is stubbed rather than the environment faked.
  vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);

  delSpy = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(storage, 'getBlobStorage').mockReturnValue({
    put: vi.fn().mockResolvedValue({ url: STORED_URL }) as unknown as storage.BlobStorage['put'],
    delete: delSpy as unknown as storage.BlobStorage['delete'],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

/** A record with one uploaded image, returning the image row's id. */
async function seedImage(): Promise<string> {
  const artist = await (
    await import('@/lib/db/queries/artists')
  ).createArtist({ name: 'Discharge' });

  const created = await createRecord(
    new Request('http://test/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hear Nothing', artistId: artist.id }),
    }),
  );
  const recordId = (await created.json()).id;

  const form = new FormData();
  form.set('file', new File([JPEG_BYTES as BlobPart], 'sleeve.jpg', { type: 'image/jpeg' }));

  const uploaded = await uploadImage(
    new Request(`http://test/api/records/${recordId}/images`, { method: 'POST', body: form }),
    { params: Promise.resolve({ id: recordId }) },
  );

  return (await uploaded.json()).id;
}

function remove(id: string): Promise<Response> {
  return deleteImageRoute(new Request(`http://test/api/images/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('DELETE /api/images/:id', () => {
  it('deletes the row and the blob (happy path)', async () => {
    const imageId = await seedImage();

    const response = await remove(imageId);

    expect(response.status).toBe(204);
    expect(await db.select().from(images)).toHaveLength(0);
    expect(delSpy).toHaveBeenCalledWith(STORED_URL);
  });

  it('404s for an image that does not exist (not found)', async () => {
    const response = await remove(UNUSED_UUID);

    expect(response.status).toBe(404);
    expect(delSpy, 'nothing may be deleted for a row that was never there').not.toHaveBeenCalled();
  });

  it('400s on a malformed id rather than treating it as missing (validation failure)', async () => {
    const response = await remove('not-a-uuid');

    expect(response.status).toBe(400);
    expect(delSpy).not.toHaveBeenCalled();
  });

  it('is behind auth (unauthenticated)', () => {
    expect(middlewareRuns('/api/images/abc')).toBe(true);
    expect(routeAuthMode('/api/images/abc')).toBe('session');
  });

  it('still succeeds when the blob delete fails, and says what leaked', async () => {
    /**
     * THE case this endpoint's ordering exists for.
     *
     * A blob that cannot be deleted must not strand the row: the user asked for
     * the image to be gone, and refusing the whole request would leave it
     * visible on the detail screen with no way to remove it. The orphan costs
     * pennies and nothing renders it.
     *
     * It is LOGGED rather than swallowed, because an invisible failure that
     * nobody can find later is how storage bills grow without explanation.
     */
    const imageId = await seedImage();
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    delSpy.mockRejectedValue(new Error('blob store unreachable'));

    const response = await remove(imageId);

    expect(response.status, 'the user asked for it gone; it is gone').toBe(204);
    expect(await db.select().from(images), 'the row is deleted regardless').toHaveLength(0);

    expect(error).toHaveBeenCalled();
    const logged = error.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged, 'the leaked URL has to be recoverable from the log').toContain(STORED_URL);
  });

  it('deletes the row BEFORE attempting the blob', async () => {
    /**
     * The discriminating case for the ordering, and the reason the failure test
     * above is not sufficient on its own: a route that deleted the blob first
     * and the row second would ALSO pass it, because both would still be gone
     * once nothing failed.
     *
     * The row is observed from inside the blob delete — at that moment it must
     * already be gone.
     */
    const imageId = await seedImage();

    let rowsWhenBlobDeleted = -1;
    delSpy.mockImplementation(async () => {
      rowsWhenBlobDeleted = (await db.select().from(images)).length;
    });

    await remove(imageId);

    expect(rowsWhenBlobDeleted, 'the row must already be deleted by then').toBe(0);
  });

  it('removes the image from the record’s hydrated read', async () => {
    // The round trip a client performs: delete, then reopen the record.
    const imageId = await seedImage();
    const [row] = await db.select().from(images);
    const recordId = row.recordId;

    await remove(imageId);

    const { GET: getRecord } = await import('@/app/api/records/[id]/route');
    const response = await getRecord(new Request(`http://test/api/records/${recordId}`), {
      params: Promise.resolve({ id: recordId ?? '' }),
    });

    expect((await response.json()).images).toHaveLength(0);
  });

  it('is idempotent enough to 404 rather than 500 on a second delete', async () => {
    // Two clicks on a delete button, or a retried request. The second must be a
    // clean "already gone", not an error.
    const imageId = await seedImage();

    expect((await remove(imageId)).status).toBe(204);
    expect((await remove(imageId)).status).toBe(404);
  });
});
