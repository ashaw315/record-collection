import 'server-only';
import { newestCoverFor } from '@/lib/db/queries/images';
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
