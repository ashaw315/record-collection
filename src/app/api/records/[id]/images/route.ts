import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, isUuid, notConfigured, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { createImage } from '@/lib/db/queries/images';
import { findRecordById, setSpineColourIfUnset } from '@/lib/db/queries/records';
import { averageColour } from '@/lib/images/spine-colour';
import { getBlobStorage, isBlobConfigured, storageKeyFor } from '@/lib/storage/blob';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImageType } from '@/lib/storage/image-type';

/**
 * SPEC.md §5.9 `POST /api/records/:id/images` — "Multipart upload → Vercel Blob
 * → creates `images` row. Max 10MB, accept jpeg/png/webp only."
 *
 * The order of operations is the load-bearing part:
 *
 *   1. validate the id and confirm the record EXISTS — a 404 that has already
 *      uploaded costs a blob nothing will ever delete;
 *   2. read the bytes and check size and true type — before anything leaves
 *      this process;
 *   3. store;
 *   4. write the row.
 *
 * Row last, because a row written before a successful upload points at a URL
 * that does not exist and renders as a permanently broken image indistinguishable
 * from a real one. The reverse — a stored blob with no row — leaks storage that
 * is invisible and costs pennies. That asymmetry decides the order here and the
 * opposite order in DELETE.
 */

/** §4.2's enum, restated at the boundary so an unknown value is a 400 not a 500. */
const metadataSchema = z
  .object({
    // §4.2 as extended by §10b. Kept in step with `imageType` in db/schema.ts
    // and IMAGE_TYPE_ORDER in gallery-order.ts — three lists, one enum.
    imageType: z.enum(['cover', 'back', 'gatefold', 'label', 'matrix', 'other']).optional(),
    caption: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const POST = withErrorHandling(
  'POST /api/records/:id/images',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid record id.', 'INVALID_ID');
    }


    const record = await findRecordById(id);
    if (record === undefined) {
      return notFound('That record does not exist.');
    }

    /**
     * Before the body is read, deliberately.
     *
     * The answer is knowable without a single byte of the upload, and a 10MB
     * photo on a phone connection should not be transferred in full only to be
     * told the server was never able to store it.
     */
    if (!isBlobConfigured()) {
      return notConfigured(
        'Image uploads are not configured. Add a Vercel Blob store to enable them.',
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest('Expected a multipart upload.', 'INVALID_FORM');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return badRequest('No file was uploaded.', 'NO_FILE');
    }

    const parsed = metadataSchema.safeParse({
      ...(form.get('imageType') === null ? {} : { imageType: String(form.get('imageType')) }),
      ...(form.get('caption') === null ? {} : { caption: String(form.get('caption')) }),
    });
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    /**
     * Size checked from the buffer, not `file.size`.
     *
     * `size` is metadata the client supplies with the part; the bytes are the
     * fact. Same reason the type is sniffed rather than read from
     * `Content-Type` — an assertion about a payload is not the payload.
     */
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return badRequest(
        `That image is larger than the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit.`,
        'IMAGE_TOO_LARGE',
      );
    }

    const contentType = sniffImageType(bytes);
    if (contentType === null) {
      return badRequest(
        `Only ${ACCEPTED_IMAGE_TYPES.join(', ')} images are accepted.`,
        'UNSUPPORTED_IMAGE_TYPE',
      );
    }

    const storage = getBlobStorage();
    const { url } = await storage.put(storageKeyFor(id, file.name), buffer, contentType);

    const row = await createImage({
      recordId: id,
      url,
      imageType: parsed.data.imageType ?? null,
      caption: parsed.data.caption ?? null,
    });

    /**
     * §10b's spine colour — for a COVER only, and that restriction is the point.
     *
     * The spine is the average of the front sleeve. A photograph of the dead
     * wax is mostly black vinyl and a centre label is mostly one colour that is
     * not the sleeve; either would give a spine matching no part of the record
     * as it sits on a shelf. An untyped upload is not a claim to be the front
     * either (§4.2 makes the column nullable).
     *
     * `setSpineColourIfUnset` is gap-fill (§7.8), so a second cover does not
     * replace the first one's colour, and `averageColour` returns null rather
     * than throwing — an unreadable image still uploads, it simply yields no
     * spine.
     */
    if (parsed.data.imageType === 'cover') {
      const colour = await averageColour(buffer);
      if (colour !== null) await setSpineColourIfUnset(id, colour);
    }

    return NextResponse.json(row, { status: 201 });
  },
);
