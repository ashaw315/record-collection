import 'server-only';
import { newestCoverFor, type ImageType } from '@/lib/db/queries/images';
import { setSpineColour } from '@/lib/db/queries/records';
import { averageColour } from './spine-colour';

/**
 * §61 (step 72): "its spine colour is derived from the cover it shows, so a
 * new cover re-colours the record... Deleting that cover falls back to the
 * next newest and re-derives again; a record with no cover left is §54's."
 *
 * One function for every event that can change the displayed cover: an
 * upload typed cover (its bytes are in hand), a cover deleted (the next
 * newest is read back from its stored URL), and the Discogs import's
 * attachment. The newest cover row decides; `bytes` is a shortcut for the
 * caller that already holds them, never a different source.
 */
export async function rederiveSpineColour(recordId: string, options: { bytes?: ArrayBuffer | Buffer } = {}): Promise<string | null> {
  const newest = await newestCoverFor(recordId);
  if (newest === undefined) {
    await setSpineColour(recordId, null);
    return null;
  }
  const bytes = options.bytes ?? (await fetchBytes(newest.url));
  const colour = bytes === null ? null : await averageColour(bytes);
  await setSpineColour(recordId, colour);
  return colour;
}

/** The stored cover's pixels, read back from its public URL; null when the store does not answer, which leaves the colour at §54's null rather than a stale one. */
async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * **What a stored image changes beyond its own row: one function, so nothing can call half of it (the coordinator,
 * 8 Nov).** The upload route calls it once its row exists, and the capture tools call it after seeding a row
 * (`scripts/after-image-stored.mts`), so a capture shows the state a real upload leaves. On 8 Nov a capture seeded
 * covers straight into the table, skipped the colour, and Design reviewed a page no real record can show. Anything
 * the route comes to do after storing an image belongs here, where both reach it.
 *
 * Today that is §61's colour, for a cover only: a cover is the newest the moment its row exists. `bytes` is the
 * upload's shortcut; without it the newest cover is read back from its stored URL.
 */
export async function afterImageStored(recordId: string, image: { imageType: ImageType | null; bytes?: ArrayBuffer | Buffer }): Promise<void> {
  if (image.imageType === 'cover') await rederiveSpineColour(recordId, { bytes: image.bytes });
}
