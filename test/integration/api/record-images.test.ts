import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as uploadImage } from '@/app/api/records/[id]/images/route';
import { POST as createRecord } from '@/app/api/records/route';
import { GET as getRecord } from '@/app/api/records/[id]/route';
import { images } from '@/db/schema';
import * as storage from '@/lib/storage/blob';

/**
 * SPEC.md §5.9: `POST /api/records/:id/images` — "Multipart upload → Vercel
 * Blob → creates `images` row. Max 10MB, accept jpeg/png/webp only."
 *
 * **The blob SDK is mocked; the database is real.** CLAUDE.md §2 on both
 * counts: never a live external call, never a mocked database. What is being
 * tested here is the ROUTE's decisions — what it accepts, what it rejects, and
 * what it writes — so the storage seam returns a fixed URL and the assertions
 * are about the row and the status.
 */

const db = getTestDb();

/** JPEG SOI, the smallest thing the sniffer accepts. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const STORED_URL = 'https://blob.example/records/abc/stored.jpg';

let putSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await truncateAll();

  /**
   * The suite runs with no `BLOB_READ_WRITE_TOKEN` — correct, since a test must
   * never reach a real store. But the route now refuses to start an upload
   * without one, so the default here is CONFIGURED and the two tests that care
   * about its absence override it.
   *
   * Stubbed rather than setting the env var: a fake token in `process.env` is
   * one edit away from being mistaken for a real one, and this states the
   * intent directly.
   */
  vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);

  putSpy = vi.fn().mockResolvedValue({ url: STORED_URL });
  vi.spyOn(storage, 'getBlobStorage').mockReturnValue({
    put: putSpy as unknown as storage.BlobStorage['put'],
    delete: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

async function seedRecord(): Promise<string> {
  const artist = await (
    await import('@/lib/db/queries/artists')
  ).createArtist({ name: 'Discharge' });

  const response = await createRecord(
    new Request('http://test/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hear Nothing', artistId: artist.id }),
    }),
  );
  const body = await response.json();
  return body.id;
}

function upload(recordId: string, form: FormData): Promise<Response> {
  return uploadImage(
    new Request(`http://test/api/records/${recordId}/images`, { method: 'POST', body: form }),
    { params: Promise.resolve({ id: recordId }) },
  );
}

function fileForm(bytes: Uint8Array, name: string, type: string, extra?: Record<string, string>) {
  const form = new FormData();
  form.set('file', new File([bytes as BlobPart], name, { type }));
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return form;
}

describe('POST /api/records/:id/images', () => {
  it('stores the file and creates the row (happy path)', async () => {
    const recordId = await seedRecord();

    const response = await upload(recordId, fileForm(JPEG_BYTES, 'sleeve.jpg', 'image/jpeg'));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.url).toBe(STORED_URL);
    expect(body.recordId).toBe(recordId);

    const rows = await db.select().from(images);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(STORED_URL);
  });

  it('accepts the image_type and caption from §4.2', async () => {
    const recordId = await seedRecord();

    const response = await upload(
      recordId,
      fileForm(JPEG_BYTES, 'wax.jpg', 'image/jpeg', {
        imageType: 'matrix',
        caption: 'A-side runout',
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.imageType).toBe('matrix');
    expect(body.caption).toBe('A-side runout');
  });

  it('accepts gatefold, §10b\'s third sleeve state', async () => {
    /**
     * **The round trip is the point.** `image_type` is enumerated in THREE
     * independent places — the Postgres type, Drizzle's `pgEnum`, and the
     * route's `z.enum` — and any two of them can agree while the third does
     * not. A unit test of the schema list would pass with the migration
     * unapplied; a migration test would pass with the `z.enum` unchanged. Only
     * a real upload landing a real row exercises all three.
     *
     * §10b adds this state because a gatefold OPENS rather than turns: front →
     * turn → back is rotation, front → open → inner spread is a hinge. This
     * unit makes the value storable; the affordance that reads it comes with
     * the shelf, and appears only where an inner image exists.
     */
    const recordId = await seedRecord();

    const response = await upload(
      recordId,
      fileForm(JPEG_BYTES, 'inner.jpg', 'image/jpeg', {
        imageType: 'gatefold',
        caption: 'Inner spread',
      }),
    );

    expect(response.status, 'the z.enum must accept it').toBe(201);
    expect((await response.json()).imageType).toBe('gatefold');

    const [row] = await db.select().from(images);
    expect(row.imageType, 'and the Postgres enum must hold it').toBe('gatefold');
  });

  it('rejects an image_type outside §4.2’s enum (validation failure)', async () => {
    const recordId = await seedRecord();

    const response = await upload(
      recordId,
      fileForm(JPEG_BYTES, 'x.jpg', 'image/jpeg', { imageType: 'front-cover' }),
    );

    expect(response.status).toBe(400);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('404s for a record that does not exist (not found)', async () => {
    const response = await upload(UNUSED_UUID, fileForm(JPEG_BYTES, 'x.jpg', 'image/jpeg'));

    expect(response.status).toBe(404);
    // And nothing was uploaded — the existence check must precede the store,
    // or a 404 still costs a blob nothing will ever delete.
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects a file whose BYTES are not an accepted image, whatever it claims', async () => {
    /**
     * The discriminating case for §5.9's allow-list. The part declares
     * `image/jpeg` — a client can declare anything — and the bytes are HTML.
     * A route trusting the declared type stores an HTML file under an image
     * URL, which is served back to browsers from our own origin.
     */
    const recordId = await seedRecord();
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

    const response = await upload(recordId, fileForm(html, 'evil.jpg', 'image/jpeg'));

    expect(response.status).toBe(400);
    expect(putSpy, 'nothing may be stored before the bytes are checked').not.toHaveBeenCalled();
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('rejects a GIF, which is a real image and not on the list', async () => {
    const recordId = await seedRecord();
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);

    const response = await upload(recordId, fileForm(gif, 'anim.gif', 'image/gif'));

    expect(response.status).toBe(400);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('rejects a file over §5.9’s 10MB cap', async () => {
    const recordId = await seedRecord();
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    // A valid JPEG signature, so SIZE is the only reason it can be refused.
    huge.set(JPEG_BYTES, 0);

    const response = await upload(recordId, fileForm(huge, 'huge.jpg', 'image/jpeg'));

    expect(response.status).toBe(400);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the cap', async () => {
    // The boundary in the other direction: 10MB is "max", so it is allowed.
    const recordId = await seedRecord();
    const atLimit = new Uint8Array(10 * 1024 * 1024);
    atLimit.set(JPEG_BYTES, 0);

    const response = await upload(recordId, fileForm(atLimit, 'big.jpg', 'image/jpeg'));

    expect(response.status).toBe(201);
  });

  it('400s when no file was sent at all', async () => {
    const recordId = await seedRecord();

    const response = await upload(recordId, new FormData());

    expect(response.status).toBe(400);
  });

  it('says image uploads are not configured, rather than 500ing', async () => {
    /**
     * QA finding at the close of step 8: with no `BLOB_READ_WRITE_TOKEN` every
     * upload returned "Internal server error", which blames the APP for a
     * deployment problem and sends whoever hit it to read application logs.
     *
     * The token stays OPTIONAL — §10's in-store case wants the app usable
     * without every integration configured, and a developer running it locally
     * has the same claim. So the upload path detects the absence and says so.
     *
     * 503, not 500: the server is working; a dependency it needs is absent.
     */
    const recordId = await seedRecord();
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    const response = await upload(recordId, fileForm(JPEG_BYTES, 'x.jpg', 'image/jpeg'));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(body.error.message, 'actionable, and about images specifically').toMatch(
      /image uploads are not configured/i,
    );

    expect(putSpy, 'nothing is attempted against a store we cannot reach').not.toHaveBeenCalled();
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('checks configuration BEFORE reading the upload body', async () => {
    /**
     * A 10MB photo on a phone connection should not be transferred in full only
     * to be told the server was never able to store it. The answer is knowable
     * before a single byte arrives.
     *
     * **Observed by watching the body BE read**, not inferred from the status.
     * A first version sent a bad payload and asserted 503 — which passes with
     * the check placed anywhere before payload validation, so it constrained
     * nothing. A mutation moving the check after `file.arrayBuffer()` failed
     * zero tests. The request's own `formData` is instrumented instead.
     */
    const recordId = await seedRecord();
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    const form = new FormData();
    form.set('file', new File([JPEG_BYTES as BlobPart], 'x.jpg', { type: 'image/jpeg' }));

    let bodyWasRead = false;
    const request = new Request(`http://test/api/records/${recordId}/images`, {
      method: 'POST',
      body: form,
    });
    const instrumented = new Proxy(request, {
      get(target, property, receiver) {
        if (property === 'formData') {
          return async () => {
            bodyWasRead = true;
            return target.formData();
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const response = await uploadImage(instrumented, {
      params: Promise.resolve({ id: recordId }),
    });

    expect(response.status).toBe(503);
    expect(bodyWasRead, 'the upload body must never be read at all').toBe(false);
  });

  it('writes no row when the blob store fails', async () => {
    /**
     * The order that matters: store first, then write the row. A row written
     * before a failed upload points at a URL that does not exist, and renders
     * as a permanently broken image with no way to tell it from a real one.
     */
    const recordId = await seedRecord();
    putSpy.mockRejectedValue(new Error('blob store unreachable'));

    const response = await upload(recordId, fileForm(JPEG_BYTES, 'x.jpg', 'image/jpeg'));

    expect(response.status).toBe(500);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('appears in the record’s hydrated read', async () => {
    // §5.2's GET returns images, and the query layer already orders them. This
    // is the round trip a client actually performs: upload, then open the
    // record and expect to see it.
    const recordId = await seedRecord();
    await upload(recordId, fileForm(JPEG_BYTES, 'sleeve.jpg', 'image/jpeg'));

    const response = await getRecord(new Request(`http://test/api/records/${recordId}`), {
      params: Promise.resolve({ id: recordId }),
    });
    const body = await response.json();

    expect(body.images).toHaveLength(1);
    expect(body.images[0].url).toBe(STORED_URL);
  });

  it('400s on a malformed record id rather than treating it as missing', async () => {
    const response = await upload('not-a-uuid', fileForm(JPEG_BYTES, 'x.jpg', 'image/jpeg'));

    expect(response.status).toBe(400);
  });
});

describe('spine colour on a manually uploaded cover (§10b)', () => {
  const solidPng = async (r: number, g: number, b: number) =>
    (await import('sharp')).default({
      create: { width: 24, height: 24, channels: 3, background: { r, g, b } },
    })
      .png()
      .toBuffer();

  const spineColourOf = async (recordId: string) => {
    const { records } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select({ c: records.spineColour })
      .from(records)
      .where(eq(records.id, recordId));
    return row?.c ?? null;
  };

  it('computes the colour when the upload IS a cover', async () => {
    const recordId = await seedRecord();
    const png = await solidPng(0x33, 0x66, 0x99);

    const response = await upload(
      recordId,
      fileForm(png, 'sleeve.png', 'image/png', { imageType: 'cover' }),
    );

    expect(response.status).toBe(201);
    expect(await spineColourOf(recordId)).toBe('#336699');
  });

  it('does NOT compute a colour for a non-cover image', async () => {
    /**
     * **The discriminating case, and the reason this is not simply "on every
     * upload".** §10b says the spine is the average of the COVER. A photograph
     * of the dead wax is mostly black vinyl; a centre label is mostly one
     * colour that is not the sleeve. Either would give a spine that matches no
     * part of the record as it sits on a shelf.
     */
    const recordId = await seedRecord();
    const png = await solidPng(0x33, 0x66, 0x99);

    await upload(recordId, fileForm(png, 'wax.png', 'image/png', { imageType: 'matrix' }));

    expect(await spineColourOf(recordId)).toBeNull();
  });

  it('does not compute a colour for an untyped upload', async () => {
    // `image_type` is nullable and an upload with no type chosen is legal
    // (§4.2). It is not a claim that the image is the front sleeve.
    const recordId = await seedRecord();
    const png = await solidPng(0x33, 0x66, 0x99);

    await upload(recordId, fileForm(png, 'unknown.png', 'image/png'));

    expect(await spineColourOf(recordId)).toBeNull();
  });

  it('leaves an existing colour alone when a second cover is uploaded', async () => {
    // §7.8: gap-fill, never overwrite. The first cover decided the spine.
    const recordId = await seedRecord();

    await upload(
      recordId,
      fileForm(await solidPng(0xa7, 0x19, 0x1d), 'first.png', 'image/png', { imageType: 'cover' }),
    );
    await upload(
      recordId,
      fileForm(await solidPng(0x33, 0x66, 0x99), 'second.png', 'image/png', { imageType: 'cover' }),
    );

    expect(await spineColourOf(recordId)).toBe('#a7191d');
  });

  it('still stores the image when the bytes cannot be averaged', async () => {
    /**
     * The upload path sniffs the type, so bytes reaching storage are a real
     * image — but a truncated or exotic file can still defeat the decoder.
     * §10b's absence is honest: the image row lands, the colour stays null, and
     * the request succeeds.
     */
    const recordId = await seedRecord();

    const response = await upload(
      recordId,
      fileForm(JPEG_BYTES, 'stub.jpg', 'image/jpeg', { imageType: 'cover' }),
    );

    expect(response.status, 'the upload is not failed by an unreadable average').toBe(201);
    expect(await db.select().from(images)).toHaveLength(1);
    expect(await spineColourOf(recordId)).toBeNull();
  });
});
