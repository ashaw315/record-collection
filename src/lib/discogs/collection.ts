import { z } from 'zod';
import type { DiscogsClient } from './client';

/**
 * Step 18 unit A (SPEC §5 `POST /api/discogs/import-collection`, §6): the
 * token owner's own Discogs collection, read through the one client every
 * Discogs call routes through, so the token bucket, the User-Agent and the
 * 429 handling are the app's and not this module's.
 *
 * Whose collection is never assumed: `/oauth/identity` says whose token this
 * is, and the folder read is that user's. Folder 0 is Discogs' "All", which
 * every item is in whatever folder it was filed under. Pages are 100, the
 * most Discogs serves, so a collection costs one request per hundred items.
 *
 * Nothing here maps a release into the app's fields: that is unit B's, pure.
 * This keeps what the collection endpoint carries and a release does not:
 * the instance, the date added, and the owner's conditions, which Discogs
 * holds as free-text notes in its two default fields.
 */
const PAGE_SIZE = 100;

const identitySchema = z.object({ username: z.string().min(1).optional(), consumer_name: z.string().optional() }).passthrough();

const noteSchema = z.object({ field_id: z.number().int(), value: z.string() }).passthrough();

const itemSchema = z
  .object({
    id: z.number().int().positive(),
    instance_id: z.number().int().optional(),
    date_added: z.string().optional(),
    notes: z.array(noteSchema).optional(),
    /* The page's own summary of the release, so an item is named even when its detail is never fetched (§T.6's failed line). */
    basic_information: z.object({ title: z.string().optional(), artists: z.array(z.object({ name: z.string() }).passthrough()).optional() }).passthrough().optional(),
  })
  .passthrough();

const pageSchema = z
  .object({
    pagination: z.object({ page: z.number().int(), pages: z.number().int(), items: z.number().int().optional() }).passthrough(),
    releases: z.array(z.unknown()),
  })
  .passthrough();

export type CollectionItem = {
  releaseId: number;
  instanceId: number | null;
  dateAdded: string | null;
  /** Discogs' default field 1, the media condition: the grade in brackets where the note is a grade, else the note as written. */
  conditionMedia: string | null;
  /** Field 2, the sleeve, read the same way. */
  conditionSleeve: string | null;
  /** From the page's basic information: what the report calls the release when its detail was never fetched. */
  title: string | null;
  artist: string | null;
};

/** `total` is Discogs' own count of the collection, from its page, never recounted here: the report's lines are checked against it (§T.6). */
export type Collection = { username: string; total: number; items: CollectionItem[] };

/** "Mint (M)" → "M"; "Very Good Plus (VG+)" → "VG+"; a note that is not a grade stays as written. */
function grade(note: string | undefined): string | null {
  if (note === undefined) return null;
  const m = /\(([A-Z]+\+?-?)\)\s*$/.exec(note.trim());
  return m === null ? note : m[1];
}

export function normalizeCollectionItem(raw: unknown): CollectionItem {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`a collection item with no release id cannot be imported: ${parsed.error.issues[0]?.message ?? 'unreadable'}`);
  const item = parsed.data;
  const note = (field: number) => item.notes?.find((n) => n.field_id === field)?.value;
  return {
    releaseId: item.id,
    instanceId: item.instance_id ?? null,
    dateAdded: item.date_added ?? null,
    conditionMedia: grade(note(1)),
    conditionSleeve: grade(note(2)),
    title: item.basic_information?.title ?? null,
    artist: item.basic_information?.artists?.[0]?.name ?? null,
  };
}

export async function fetchCollection(client: DiscogsClient): Promise<Collection> {
  const identity = identitySchema.parse(await client.get('/oauth/identity'));
  if (identity.username === undefined) throw new Error('the Discogs token carries no username, so there is no collection to read: it is not a personal access token');
  const username = identity.username;
  const items: CollectionItem[] = [];
  let total: number | null = null;
  for (let pageNo = 1; ; pageNo += 1) {
    const page = pageSchema.parse(await client.get(`/users/${encodeURIComponent(username)}/collection/folders/0/releases`, { per_page: PAGE_SIZE, page: pageNo }));
    if (total === null) total = page.pagination.items ?? null;
    for (const raw of page.releases) items.push(normalizeCollectionItem(raw));
    if (pageNo >= page.pagination.pages) break;
  }
  /* A page without Discogs' count is not seen in practice; the parsed count stands in, and the report then checks against itself, which is said here and nowhere hidden. */
  return { username, total: total ?? items.length, items };
}
