import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { images } from '@/db/schema';
import { createImage } from '@/lib/db/queries/images';
import { describeError } from '@/lib/errors/describe';
import { logger } from '@/lib/logger';
import { getBlobStorage, storageKeyFor } from '@/lib/storage/blob';
import type { DiscogsClient } from './client';

/**
 * Carries a Discogs release's cover onto a saved record (SPEC.md §5.7, §5.9).
 *
 * **Fetched server-side and stored, never hot-linked.** The URL is chosen by
 * whichever contributor edited the release; rendering it directly would point
 * every visitor's browser at a host a stranger picked. Storing it also means the
 * image survives Discogs reorganising its CDN, which it does.
 *
 * **This function never throws.** It runs after the record row exists, and a
 * record lost to a failed image fetch is the worst trade available — the record
 * is what the user typed, the cover is a convenience. Every failure returns a
 * reason the caller can show instead.
 *
 * Called on SAVE rather than when the form opens: `images.record_id` is NOT
 * NULL, so there is no valid row before the record exists, and fetching at
 * form-open would leave an orphaned blob whenever a form is abandoned — the
 * debris `loadDiscogsPrefill` deliberately avoids for artists and labels.
 */

export type CoverOutcome =
  | { attached: true }
  | { attached: false; reason: 'none' | 'already-has-cover' | 'failed' };

export async function attachDiscogsCover(input: {
  recordId: string;
  images: Array<{ url: string; type: 'primary' | 'secondary' }>;
  client: DiscogsClient;
}): Promise<CoverOutcome> {
  // The PRIMARY, not merely the first: Discogs orders images but the type is
  // what identifies the front sleeve. Falling back to the first keeps a release
  // whose contributor never set a primary from silently having no cover.
  const chosen = input.images.find((image) => image.type === 'primary') ?? input.images[0];
  if (chosen === undefined) {
    return { attached: false, reason: 'none' };
  }

  try {
    /**
     * §7.8: never overwrite user-entered data with external data. Someone who
     * photographed their own sleeve has the better picture of THEIR copy, and a
     * re-import must not bury it under a stock scan.
     */
    const db = getDb();
    const existing = await db
      .select({ id: images.id })
      .from(images)
      .where(and(eq(images.recordId, input.recordId), eq(images.imageType, 'cover')))
      .limit(1);

    if (existing.length > 0) {
      return { attached: false, reason: 'already-has-cover' };
    }

    // Rate-limited on the shared bucket, size-capped mid-stream, and sniffed —
    // all inside the client, because the image host is a different host from
    // the API and a separate path would not be limited at all.
    const { bytes, contentType } = await input.client.fetchImage(chosen.url);

    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const { url } = await getBlobStorage().put(
      storageKeyFor(input.recordId, `discogs-cover.${extension}`),
      bytes,
      contentType,
    );

    await createImage({
      recordId: input.recordId,
      url,
      imageType: 'cover',
      caption: null,
    });

    return { attached: true };
  } catch (cause) {
    /**
     * Caught, not rethrown — and the try starts BEFORE the first await so a
     * synchronous throw from the client is caught too. A `.catch()` on the
     * promise alone would let that escape into a save handler whose record is
     * already written.
     *
     * `warn`, not `error`: nothing is broken, a convenience did not arrive.
     */
    /**
     * `describeError`, not `cause.message`.
     *
     * A real failure logged only "The image could not be stored." — our own
     * wrapper's sentence. The SDK's reason was attached as `cause` and nothing
     * read it, so the log named no cause and gave the operator nothing to
     * check, at exactly the point where the cause was the only thing that could
     * explain the failure.
     */
    logger.warn(
      'attachDiscogsCover',
      `Cover not attached for record ${input.recordId}: ${describeError(cause)}`,
    );

    return { attached: false, reason: 'failed' };
  }
}
