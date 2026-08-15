import { NextResponse } from 'next/server';
import { badRequest, isUuid, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { deleteImage, findImageById } from '@/lib/db/queries/images';
import { logger } from '@/lib/logger';
import { getBlobStorage, isBlobConfigured } from '@/lib/storage/blob';

/**
 * SPEC.md §5.9 `DELETE /api/images/:id` — "Deletes blob and row."
 *
 * **Row first, blob second and best-effort.**
 *
 * Blob storage and Postgres cannot share a transaction, so either can fail
 * alone and no order is atomic. The choice is which wreckage to live with, and
 * the two are not equally bad:
 *
 *   - blob with no row — invisible, costs pennies, nothing renders it;
 *   - row with no blob — a permanently broken image on the detail screen,
 *     indistinguishable from a real one until it fails to load.
 *
 * So the survivable failure is the one this order produces. The upload path
 * takes the opposite order for the same reason — store, then write the row —
 * and both fall toward a leaked blob rather than a broken reference.
 *
 * The leak is LOGGED, never swallowed: an invisible failure nobody can find
 * later is how a storage bill grows without explanation.
 */
export const DELETE = withErrorHandling(
  'DELETE /api/images/:id',
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid image id.', 'INVALID_ID');
    }

    const image = await findImageById(id);
    if (image === undefined) {
      return notFound('That image does not exist.');
    }

    await deleteImage(id);

    /**
     * **Skipped when this deployment has no storage token.** Without the guard
     * the SDK throws, the catch below logs an ERROR naming a "leaked" blob —
     * and the operator goes looking for a storage bill that cannot exist,
     * because a deployment with no token never stored anything.
     *
     * The row is still deleted, which is what the user asked for. There is
     * simply no blob to remove.
     */
    if (!isBlobConfigured()) {
      return new NextResponse(null, { status: 204 });
    }

    try {
      await getBlobStorage().delete(image.url);
    } catch (cause) {
      // Deliberately not rethrown. The user asked for the image to be gone and
      // it is; failing the request would leave it on screen with no way to
      // remove it, which is a worse outcome than an orphaned blob.
      logger.error(
        'DELETE /api/images/:id',
        `Row deleted but the blob was not: ${image.url} — ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    return new NextResponse(null, { status: 204 });
  },
);
