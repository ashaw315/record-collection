/**
 * The free-text unit's backfill (4 Nov): the searchable text of every release the cache already
 * holds, derived once into `discogs_release_text`. Every later write of a payload derives its own
 * rows in `writeCachedRelease`, so this runs once, after migration 0032, by a person:
 *
 *   npm run discogs:backfill-text
 *
 * No Discogs call: the payloads are in the cache, and a stale one is still the release's text. A
 * second run replaces each release's rows with the same rows, so running it twice costs time and
 * changes nothing. Prints how many releases were read and how many rows stand.
 */
import { backfillReleaseText } from '@/lib/discogs/release-text-store';

const done = await backfillReleaseText();
console.log(`backfill-release-text: ${done.releases} cached releases read, ${done.rows} text rows stand`);
process.exit(0);
