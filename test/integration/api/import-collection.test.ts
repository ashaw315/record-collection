import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import * as clientModule from '@/lib/discogs/client';
import * as taggerModule from '@/lib/llm/mood-tagger-client';
import { POST } from '@/app/api/discogs/import-collection/route';
import { matchedTextsFor } from '@/lib/db/queries/ask';

/*
  Import fires drafting (22 Nov): the two model clients are faked at their getters, as the snippet route's tests fake
  theirs, and the after-task's scheduler is faked to run inline and hand its promise back, since Next's after() has no
  request scope in a handler called directly. Nothing here reaches a socket.
*/
const aboutWrite = vi.fn();
const matchedWrite = vi.fn();
const pending: Promise<unknown>[] = [];
vi.mock('@/lib/llm/snippet-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/snippet-client')>();
  return { ...actual, getSnippetClient: () => ({ write: aboutWrite }) };
});
vi.mock('@/lib/llm/matched-text-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/matched-text-client')>();
  return { ...actual, getMatchedTextClient: () => ({ write: matchedWrite }) };
});
vi.mock('@/lib/import/after', () => ({ runAfter: (work: () => Promise<unknown>) => { pending.push(work()); } }));
const observed = { stopReason: 'end_turn', inputTokens: 1, outputTokens: 1 };

/**
 * SPEC.md §5 `POST /api/discogs/import-collection`, session-only, no body,
 * returning the report. Three of the four cases per handler; the fourth,
 * unauthenticated, is the middleware's (SPEC §3) and asserting a 401 from a
 * directly-invoked handler would pass whether or not the route were
 * protected, so it is documented here and held by the middleware's own tests.
 */
const db = getTestDb();

beforeEach(async () => {
  /* An earlier test's after-task may still be drafting; let it land before the tables are emptied, or its calls count against the next test. */
  await Promise.allSettled(pending);
  await truncateAll();
  pending.length = 0;
  aboutWrite.mockReset();
  matchedWrite.mockReset();
  aboutWrite.mockResolvedValue({ ok: true, snippet: 'An ABOUT from the import.', ...observed });
  matchedWrite.mockResolvedValue({ ok: true, text: 'Slow piano, sparse.', sentences: [{ text: 'Slow piano, sparse.', basis: 'inferred' }], unknown: [], dropped: [], ...observed });
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

  /*
    The moods are retired (§P.2 withdrew them; Adam, 14 Nov: "get rid of them, I feel like they don't offer
    reliability"), so an import tags nothing. The route tagged every imported record through the mood tagger and wrote
    record_moods until 14 Nov; that case held it and changes with the retirement. record_moods and its rows stay: dropping
    them is Adam's separate yes. Fails against the route passing its tagger to the run.
  */
  it('tags nothing: no call to the mood tagger and no record_moods row, the moods being retired', async () => {
    spyClient();
    let calls = 0;
    vi.spyOn(taggerModule, 'getMoodTagger').mockReturnValue({ model: 'fake-route-tagger', async tag() { calls += 1; return { ok: true, payload: { moods: ['sunny'] } }; } });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await db.execute(`SELECT count(*)::int AS n FROM records`)).rows[0], 'the import itself still runs').toEqual({ n: 9 });
    expect(calls, 'the tagger is never asked').toBe(0);
    expect((await db.execute(`SELECT count(*)::int AS n FROM record_moods`)).rows[0], 'nothing written to record_moods').toEqual({ n: 0 });
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

describe('import fires drafting (Adam, through the coordinator, 22 Nov)', () => {
  const runRow = async () => (await db.execute<{ report: { imported: Array<{ recordId: string }>; drafting?: { searchable: string[]; waiting: string[]; failed: unknown[] } } }>(`SELECT report FROM discogs_import_runs ORDER BY finished_at DESC LIMIT 1`)).rows[0].report;

  /** Fails against: a route that answers without scheduling the drafting, one that drafts before answering (the response would carry it), and an outcome written anywhere but the stored run. */
  it('answers first, then drafts every imported record after the response and writes the outcome onto the stored run; each is in the pool', async () => {
    spyClient();
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { imported: Array<{ recordId: string }>; drafting?: unknown } };
    expect(body.report.drafting, 'the response leaves before a draft starts').toBeUndefined();
    expect(pending.length, 'one after-task scheduled').toBe(1);
    await Promise.all(pending);
    const ids = body.report.imported.map((i) => i.recordId);
    const stored = await runRow();
    expect(stored.drafting?.searchable.slice().sort()).toEqual(ids.slice().sort());
    expect(stored.drafting?.waiting).toEqual([]);
    expect(stored.drafting?.failed).toEqual([]);
    expect(stored.imported.length, 'the rest of the report untouched').toBe(9);
    expect((await matchedTextsFor(ids)).length).toBe(9);
    expect(aboutWrite).toHaveBeenCalledTimes(9);
    expect(matchedWrite).toHaveBeenCalledTimes(9);
    const marks = (await db.execute<{ n: number }>(`SELECT count(*)::int AS n FROM record_matched_text WHERE reviewed_at IS NOT NULL`)).rows[0];
    expect(marks.n, 'stored unread').toBe(0);
  });

  /** Fails against: a drafter that lets a client's failure throw out of the after-task, losing the outcome for every other record. */
  it('a client that fails is a named failure on the run and the response is still 200; an import that stores nothing drafts nothing', async () => {
    spyClient();
    matchedWrite.mockRejectedValue(new Error('ANTHROPIC_API_KEY is not set'));
    const res = await post();
    expect(res.status).toBe(200);
    await Promise.all(pending);
    const stored = await runRow();
    expect(stored.drafting?.searchable).toEqual([]);
    expect(stored.drafting?.failed.length).toBe(9);
    expect(stored.drafting?.failed[0]).toMatchObject({ stage: 'matched', reason: 'ANTHROPIC_API_KEY is not set' });

    pending.length = 0;
    aboutWrite.mockClear();
    matchedWrite.mockResolvedValue({ ok: true, text: 'Drafted on the second press.', sentences: [{ text: 'Drafted on the second press.', basis: 'inferred' }], unknown: [], dropped: [], ...observed });
    const again = await post();
    expect(again.status).toBe(200);
    expect(((await again.json()) as { report: { imported: unknown[] } }).report.imported.length, 'every release already held').toBe(0);
    /*
      The feature's own remedy for the overflow is the next press (the coordinator, 22 Nov): a run that stores nothing
      still drafts the records lacking text. The first build scheduled drafting only when the press had stored something,
      so the press meant to finish the work did nothing; the coordinator's question found it.
    */
    expect(pending.length, 'the press that stored nothing still drafts what lacks text').toBe(1);
    await Promise.all(pending);
    const second = await runRow();
    expect(second.imported.length, 'this press stored none').toBe(0);
    expect(second.drafting?.searchable.length, 'and drafted the nine still lacking text').toBe(9);
    expect(second.drafting?.waiting).toEqual([]);
    expect((await matchedTextsFor(stored.imported.map((i) => i.recordId))).length).toBe(9);
  });

  it('a press with nothing to draft schedules nothing: every release held and every record described', async () => {
    spyClient();
    await post();
    await Promise.all(pending);
    pending.length = 0;
    const again = await post();
    expect(again.status).toBe(200);
    expect(pending.length).toBe(0);
  });
});
