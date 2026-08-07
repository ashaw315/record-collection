import 'server-only';
import { listArtists } from '@/lib/db/queries/artists';
import { listLabels } from '@/lib/db/queries/labels';
import { listFormats } from '@/lib/db/queries/formats';
import { listStores } from '@/lib/db/queries/stores';
import { listGenres } from '@/lib/db/queries/genres';
import { listTags } from '@/lib/db/queries/tags';
import type { Offset } from '@/lib/api/query-params';
import type { ReferenceData } from './RecordForm';

/**
 * The reference data the form's selects offer.
 *
 * Read in parallel: six independent queries, and awaiting them in sequence
 * would make the form as slow as their sum.
 *
 * NOTE the 200-row ceiling, which NOTES records as an unfixed limitation on
 * /manage and which applies here too — past 200 artists the newest would not
 * appear in the select. Unit 9b's inline create is the mitigation that matters
 * (you can always add the one you need); a typeahead is the real fix when a
 * collection gets there.
 */
const PAGE = { limit: 200, offset: 0 as Offset };

export async function loadReferenceData(): Promise<ReferenceData> {
  const [artists, labels, formats, stores, genres, tags] = await Promise.all([
    listArtists(PAGE),
    listLabels(PAGE),
    listFormats(PAGE),
    listStores(PAGE),
    listGenres(PAGE),
    listTags(PAGE),
  ]);

  const named = (rows: Array<{ id: string; name: string }>) =>
    rows.map((row) => ({ id: row.id, name: row.name }));

  return {
    artists: named(artists.rows),
    labels: named(labels.rows),
    formats: named(formats.rows),
    stores: named(stores.rows),
    genres: named(genres.rows),
    tags: named(tags.rows),
  };
}
