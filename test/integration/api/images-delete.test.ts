import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { DELETE as deleteImageRoute } from '@/app/api/images/[id]/route';
import { POST as uploadImage } from '@/app/api/records/[id]/images/route';
import { POST as createRecord } from '@/app/api/records/route';
import { images } from '@/db/schema';
import { logger } from '@/lib/logger';
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

/**
 * §61 (step 72): "Deleting that cover falls back to the next newest and
 * re-derives again; a record with no cover left is §54's." The remaining
 * cover's bytes are not in the request, so the route fetches them from the
 * stored URL; here the fetch is stubbed to hand back the first cover's
 * pixels, since the test store's URLs do not resolve.
 */
describe('§61: deleting the displayed cover re-derives the colour', () => {
  const solidPng = async (r: number, g: number, b: number) =>
    (await import('sharp')).default({ create: { width: 24, height: 24, channels: 3, background: { r, g, b } } }).png().toBuffer();
  const spineColourOf = async (recordId: string) => {
    const { records } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ c: records.spineColour }).from(records).where(eq(records.id, recordId));
    return row?.c ?? null;
  };
  async function coverUpload(recordId: string, png: Buffer, name: string): Promise<string> {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(png) as BlobPart], name, { type: 'image/png' }));
    form.set('imageType', 'cover');
    const uploaded = await uploadImage(new Request(`http://test/api/records/${recordId}/images`, { method: 'POST', body: form }), { params: Promise.resolve({ id: recordId }) });
    expect(uploaded.status).toBe(201);
    return (await uploaded.json()).id as string;
  }
  async function seedRecordOnly(): Promise<string> {
    const artist = await (await import('@/lib/db/queries/artists')).createArtist({ name: 'Discharge' });
    const created = await createRecord(new Request('http://test/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Hear Nothing', artistId: artist.id }) }));
    return (await created.json()).id as string;
  }

  it('falls back to the next newest cover and re-derives from its pixels', async () => {
    const recordId = await seedRecordOnly();
    const first = await solidPng(0xa7, 0x19, 0x1d);
    await coverUpload(recordId, first, 'first.png');
    const second = await coverUpload(recordId, await solidPng(0x33, 0x66, 0x99), 'second.png');
    expect(await spineColourOf(recordId), 'the newest cover decides while it is there').toBe('#336699');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array(first), { status: 200, headers: { 'content-type': 'image/png' } }));
    const response = await remove(second);
    expect(response.status).toBe(204);
    expect(fetchSpy, 'the remaining cover is read from its stored URL').toHaveBeenCalledWith(STORED_URL);
    expect(await spineColourOf(recordId), 'the first cover’s colour returns').toBe('#a7191d');
  });

  it('clears the colour when the only cover is deleted: the record is §54’s again', async () => {
    const recordId = await seedRecordOnly();
    const only = await coverUpload(recordId, await solidPng(0x33, 0x66, 0x99), 'only.png');
    expect(await spineColourOf(recordId)).toBe('#336699');
    const response = await remove(only);
    expect(response.status).toBe(204);
    expect(await spineColourOf(recordId)).toBeNull();
  });

  it('leaves the colour alone when a non-cover image is deleted', async () => {
    const recordId = await seedRecordOnly();
    await coverUpload(recordId, await solidPng(0x33, 0x66, 0x99), 'cover.png');
    const form = new FormData();
    form.set('file', new File([new Uint8Array(await solidPng(0xa7, 0x19, 0x1d)) as BlobPart], 'back.png', { type: 'image/png' }));
    form.set('imageType', 'back');
    const back = await uploadImage(new Request(`http://test/api/records/${recordId}/images`, { method: 'POST', body: form }), { params: Promise.resolve({ id: recordId }) });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await remove((await back.json()).id as string);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await spineColourOf(recordId)).toBe('#336699');
  });
});

describe('DELETE /api/records/:id — the blobs go too', () => {
  /**
   * **The one path where the documented asymmetry did not hold.**
   *
   * `images.record_id` is `ON DELETE CASCADE`, so deleting a record removes the
   * image ROWS in the database and nothing ever touched the blobs. That is the
   * same "blob with no row" wreckage the single-image delete accepts
   * deliberately — except here it happens SILENTLY, in bulk, and
   * unrecoverably: the rows that held the URLs are gone, so nothing can find
   * the orphans afterwards. The single-image path at least logs the URL.
   *
   * A record with six photos leaked six blobs, with no log line and no way to
   * enumerate them later.
   */
  async function seedRecordWithImages(count: number): Promise<{ recordId: string }> {
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

    for (let index = 0; index < count; index += 1) {
      const form = new FormData();
      form.set('file', new File([JPEG_BYTES as BlobPart], `sleeve-${index}.jpg`, {
        type: 'image/jpeg',
      }));
      await uploadImage(
        new Request(`http://test/api/records/${recordId}/images`, { method: 'POST', body: form }),
        { params: Promise.resolve({ id: recordId }) },
      );
    }

    return { recordId };
  }

  const removeRecord = async (id: string) => {
    const { DELETE } = await import('@/app/api/records/[id]/route');
    return DELETE(new Request(`http://test/api/records/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
  };

  it('deletes every image blob when the record is deleted', async () => {
    const { recordId } = await seedRecordWithImages(3);

    const response = await removeRecord(recordId);

    expect(response.status).toBe(200);
    expect(delSpy, 'one blob delete per image row that cascaded').toHaveBeenCalledTimes(3);
  });

  it('still deletes the record when a blob delete fails', async () => {
    /**
     * Same precedence as the single-image path: the user asked for the record
     * to be gone. A storage failure must not leave it on screen with no way to
     * remove it — the leak is the cheap wreckage and it is LOGGED, never
     * swallowed, because an orphan nobody can find is how a bill grows without
     * explanation.
     */
    const errors = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { recordId } = await seedRecordWithImages(1);
    delSpy.mockRejectedValueOnce(new Error('storage unreachable'));

    const response = await removeRecord(recordId);

    expect(response.status, 'the delete still succeeds').toBe(200);
    expect(errors, 'and the orphan is named in the log').toHaveBeenCalled();
    expect(String(errors.mock.calls[0]?.[1]), 'with the URL, so it can be found').toContain(
      STORED_URL,
    );
  });

  it('deletes a record with no images without touching storage', async () => {
    // The ordinary case must not pay for the feature: no images means no blob
    // calls at all, not a call with an empty list.
    const artist = await (
      await import('@/lib/db/queries/artists')
    ).createArtist({ name: 'Discharge' });
    const created = await createRecord(
      new Request('http://test/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Why', artistId: artist.id }),
      }),
    );

    await removeRecord((await created.json()).id);

    expect(delSpy).not.toHaveBeenCalled();
  });
});
