import { describe, expect, it } from 'vitest';
import { createDiscogsClient } from './client';
import { fetchCollection, normalizeCollectionItem } from './collection';

/**
 * Step 18 unit A (SPEC §5 `POST /api/discogs/import-collection`, §6): the
 * token owner's own collection, read through the one client every Discogs
 * call routes through. Synthetic responses for the mechanics, as the client's
 * own tests use; the SHAPE of a real item is tested against the captured
 * fixtures once `scripts/capture-discogs-fixtures.mjs` has taken them, by a
 * person. Nothing here reaches the network: a fake `fetch` answers every call.
 */
const item = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  instance_id: id * 10,
  folder_id: 1,
  rating: 0,
  date_added: '2026-10-27T14:03:57-07:00',
  notes: [
    { field_id: 1, value: 'Mint (M)' },
    { field_id: 2, value: 'Very Good Plus (VG+)' },
  ],
  basic_information: { id, master_id: id + 1, title: `Title ${id}`, year: 2024, artists: [{ name: 'Artist', id: 7 }], labels: [], formats: [], genres: [], styles: [] },
  ...over,
});

const page = (items: unknown[], pageNo: number, pages: number) => ({ pagination: { page: pageNo, pages, per_page: 100, items: items.length * pages }, releases: items });

function fakeFetch(answers: Record<string, unknown>, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const key = `${url.pathname}${url.search}`;
    calls.push(key);
    const body = answers[key] ?? answers[url.pathname];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const client = (answers: Record<string, unknown>, calls: string[] = []) =>
  createDiscogsClient({ token: 't', userAgent: 'RecordCollection/0.1 +https://example.test', fetch: fakeFetch(answers, calls), sleep: async () => undefined });

describe('fetchCollection', () => {
  it('asks who the token belongs to, then reads that user’s folder 0, a page of 100 at a time, until the last page', async () => {
    const calls: string[] = [];
    const c = client(
      {
        '/oauth/identity': { username: 'someone', consumer_name: 'someone' },
        '/users/someone/collection/folders/0/releases?per_page=100&page=1': page([item(1), item(2)], 1, 2),
        '/users/someone/collection/folders/0/releases?per_page=100&page=2': page([item(3)], 2, 2),
      },
      calls,
    );
    const got = await fetchCollection(c);
    expect(got.username).toBe('someone');
    expect(got.items.map((i) => i.releaseId)).toEqual([1, 2, 3]);
    /* Discogs' own count of the collection, carried as its page gives it and never recounted here: the report's four lines are checked against it (§T.6). */
    expect(got.total).toBe(4);
    expect(calls).toEqual(['/oauth/identity', '/users/someone/collection/folders/0/releases?per_page=100&page=1', '/users/someone/collection/folders/0/releases?per_page=100&page=2']);
  });

  it('reads an empty collection as no items and one page', async () => {
    const c = client({ '/oauth/identity': { username: 'u' }, '/users/u/collection/folders/0/releases?per_page=100&page=1': page([], 1, 1) });
    expect((await fetchCollection(c)).items).toEqual([]);
  });

  it('refuses an identity answer with no username rather than reading someone’s collection by accident', async () => {
    const c = client({ '/oauth/identity': { consumer_name: 'app-only' } });
    await expect(fetchCollection(c)).rejects.toThrow(/username/);
  });
});

describe('normalizeCollectionItem', () => {
  it('keeps the release id, the instance id, the date added, and the conditions from the notes’ fields 1 and 2 as their grades', () => {
    /* The title and the artist from the page's basic information, so a release that fails before its detail is fetched is still named (§T.6's failed line). */
    expect(normalizeCollectionItem(item(5))).toEqual({ releaseId: 5, instanceId: 50, dateAdded: '2026-10-27T14:03:57-07:00', conditionMedia: 'M', conditionSleeve: 'VG+', title: 'Title 5', artist: 'Artist' });
    expect(normalizeCollectionItem(item(5, { basic_information: undefined }))).toMatchObject({ title: null, artist: null });
  });

  it('leaves a condition null when its note is absent, as the one item without a sleeve note was', () => {
    expect(normalizeCollectionItem(item(5, { notes: [{ field_id: 1, value: 'Mint (M)' }] }))).toMatchObject({ conditionMedia: 'M', conditionSleeve: null });
    expect(normalizeCollectionItem(item(5, { notes: undefined }))).toMatchObject({ conditionMedia: null, conditionSleeve: null });
  });

  it('keeps a note that is not a Discogs grade as written, since the field is free text there', () => {
    expect(normalizeCollectionItem(item(5, { notes: [{ field_id: 1, value: 'plays fine' }] })).conditionMedia).toBe('plays fine');
  });

  it('refuses an item with no release id', () => {
    expect(() => normalizeCollectionItem({ ...item(5), id: undefined })).toThrow(/release id/);
  });
});
