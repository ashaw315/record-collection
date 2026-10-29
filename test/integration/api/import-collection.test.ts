import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import * as clientModule from '@/lib/discogs/client';
import * as taggerModule from '@/lib/llm/mood-tagger-client';
import { POST } from '@/app/api/discogs/import-collection/route';

/**
 * SPEC.md §5 `POST /api/discogs/import-collection`, session-only, no body,
 * returning the report. Three of the four cases per handler; the fourth,
 * unauthenticated, is the middleware's (SPEC §3) and asserting a 401 from a
 * directly-invoked handler would pass whether or not the route were
 * protected, so it is documented here and held by the middleware's own tests.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

const fixture = (name: string): unknown => JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));
const PAGE = fixture('collection-page-1') as { releases: Array<{ id: number }> };

function spyClient(identity: unknown = fixture('collection-identity')) {
  const answers: Record<string, unknown> = {
    '/oauth/identity': identity,
    '/users/AdamPseudo/collection/folders/0/releases': PAGE,
    ...Object.fromEntries(PAGE.releases.map((r) => [`/releases/${r.id}`, fixture(`collection-release-${r.id}`)])),
  };
  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: async <T,>(path: string): Promise<T> => {
      if (!(path in answers)) throw new Error(`no answer for ${path}`);
      return answers[path] as T;
    },
    fetchImage: vi.fn(async () => { throw new Error('no images'); }) as unknown as clientModule.DiscogsClient['fetchImage'],
  });
}

const post = (body?: string) => POST(new Request('https://x.test/api/discogs/import-collection', { method: 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body }));

describe('POST /api/discogs/import-collection', () => {
  it('imports the token owner’s collection and answers with the report', async () => {
    spyClient();
    const res = await post();
    expect(res.status).toBe(200);
    /* Step 159 (§T.6): the answer is the run, the report with when it finished, as Manage draws it on return. */
    const run = (await res.json()) as { report: { username: string; total: number; imported: Array<{ releaseId: number }>; skipped: unknown[]; failed: unknown[] }; finishedAt: string };
    expect(run.report.username).toBe('AdamPseudo');
    expect(run.report.imported.length).toBe(9);
    expect(run.report.total).toBe(9);
    expect(Number.isNaN(new Date(run.finishedAt).getTime())).toBe(false);
    expect((await db.execute(`SELECT count(*)::int AS n FROM records`)).rows[0]).toEqual({ n: 9 });
    expect((await db.execute(`SELECT count(*)::int AS n FROM discogs_import_runs`)).rows[0], 'the run is kept').toEqual({ n: 1 });
  });

  /* The route tags what it imported through the app's tagger; the test's tagger is a fake, since the real one refuses a live call by name. */
  it('tags the imported records through the app’s tagger after the run', async () => {
    spyClient();
    let n = 0;
    const sets = [['sunny'], ['sleepy', 'dancing'], ['smooth', 'zone out', 'loud and dirty']];
    vi.spyOn(taggerModule, 'getMoodTagger').mockReturnValue({ model: 'fake-route-tagger', async tag() { n += 1; return { ok: true, payload: { moods: sets[n % 3] } }; } });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await db.execute(`SELECT count(DISTINCT record_id)::int AS n FROM record_moods`)).rows[0]).toEqual({ n: 9 });
  });

  it('takes an empty object as its body and nothing else: an unknown key is a validation failure', async () => {
    spyClient();
    expect((await post('{}')).status).toBe(200);
    const res = await post('{"username":"someone-else"}');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('answers malformed JSON with 400', async () => {
    spyClient();
    expect((await post('{nope')).status).toBe(400);
  });

  it('answers a token with no username as a bad gateway with a code, importing nothing', async () => {
    spyClient({ consumer_name: 'app-only' });
    const res = await post();
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('DISCOGS_NO_USERNAME');
    expect((await db.execute(`SELECT count(*)::int AS n FROM records`)).rows[0]).toEqual({ n: 0 });
  });

  /* Unauthenticated: the middleware answers 401 for every /api/ path (SPEC §3) before this handler runs; see the note above. */
});
