import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { POST as ask } from '@/app/api/ask/route';
import { storeEmbedding } from '@/lib/db/queries/embeddings';
import { aboutHash } from '@/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '@/lib/openai/embeddings';
import { closeTestDb, getTestDb, truncateAll } from '../../helpers/db';

/**
 * **Q22's ask: `POST /api/ask` ranks the pool by nearness of each ABOUT's stored vector to the phrase's (§P.2 as it
 * stands; the coordinator, 11 Nov).** The phrase is embedded at request time with the same model, mocked here at
 * fetch, never live. A phrase that is a record's title by §T.4's name key asks from that record's vector and leaves it
 * out; a re-ask leaves out the last answer's records while enough remain; a pool with no ABOUT is unanswerable, not
 * empty by accident; an absent key refuses with a named server log and a 503 in the reader's terms, not an empty answer.
 *
 * The cases: happy path, validation, not configured, unanswerable. Not found does not apply to a ranking over a pool:
 * an id in the pool that no record holds is simply not among the answers. Unauthenticated is the middleware's and is
 * held by `e2e/tags-auth.spec.ts`'s shape, as every route's is (see tags.test.ts).
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeTestDb();
});

const request = (body: unknown) => new Request('https://x.test/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function record(title: string, about: string | null, vector?: number[]): Promise<string> {
  const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES (${`Artist ${title}`}) RETURNING id`)).rows;
  const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title, snippet) VALUES (${artist.id}, ${title}, ${about}) RETURNING id`)).rows;
  if (about !== null && vector !== undefined) await storeEmbedding({ recordId: row.id, hash: aboutHash(about), model: EMBEDDING_MODEL, vector });
  return row.id;
}

/** The phrase's vector, answered by the mocked endpoint; the request body is kept so the test can read what was asked. */
function phraseEmbeds(vector: number[]) {
  const bodies: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: vector }], model: EMBEDDING_MODEL, usage: { total_tokens: 3 } }), { status: 200 });
  });
  return bodies;
}

async function seedFour() {
  const rain = await record('Rain Dogs', 'Rain on a tin roof, slow and warm.', [1, 0]);
  const drive = await record('The Drive', 'A late-night drive, neon and quiet.', [0.9, 0.1]);
  const sunday = await record('Sunday', 'Sunday morning, coffee and strings.', [0, 1]);
  const silent = await record('Silent', null);
  return { rain, drive, sunday, silent };
}

describe('POST /api/ask', () => {
  it('embeds the phrase and answers with the nearest records in the pool, nearest first, leaving out records with no ABOUT', async () => {
    const { rain, drive, sunday, silent } = await seedFour();
    const bodies = phraseEmbeds([1, 0]);
    const response = await ask(request({ phrase: 'rain on the roof', pool: [rain, drive, sunday, silent], take: 3 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, drive, sunday]);
    expect(body.from).toBe('phrase');
    expect(body.unanswerable).toBe(false);
    expect(bodies).toEqual([{ model: 'text-embedding-3-small', input: ['rain on the roof'] }]);
  });

  it('asks from a record whose title the phrase names by §T.4’s key, without embedding, and leaves it out of its own answers', async () => {
    const { rain, drive, sunday } = await seedFour();
    const bodies = phraseEmbeds([0, 1]);
    /* "the drive" is The Drive by the key: case-insensitive, a leading "The" dropped. Its vector points at Rain Dogs, not at Sunday. */
    const response = await ask(request({ phrase: 'the drive', pool: [rain, drive, sunday], take: 3 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.from).toBe('title');
    expect(body.askedFrom).toBe(drive);
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, sunday]);
    expect(bodies, 'a title ask makes no embedding request').toEqual([]);
  });

  it('leaves out the last answer’s records on a re-ask while enough remain', async () => {
    const { rain, drive, sunday } = await seedFour();
    const extra = await record('Fourth', 'A fourth record.', [0.2, 0.8]);
    phraseEmbeds([1, 0]);
    const response = await ask(request({ phrase: 'again', pool: [rain, drive, sunday, extra], take: 3, exclude: [rain, drive, sunday] }));
    const body = await response.json();
    /* Four with an ABOUT, three excluded: one would remain against three asked for, so the exclusion is ignored and the pool ranked whole. */
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, drive, extra]);
  });

  it('is unanswerable where no record in the pool has an ABOUT, and says so rather than answering with nothing', async () => {
    const { silent } = await seedFour();
    const bodies = phraseEmbeds([1, 0]);
    const response = await ask(request({ phrase: 'anything', pool: [silent], take: 3 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ answers: [], unanswerable: true, from: 'phrase' });
    expect(bodies, 'nothing to rank, nothing embedded').toEqual([]);
  });

  /* Step 180 (§P.2, "Ask field reconciled", 12 Nov): an answer is what is shown, one on the shelf, so a take of one is the shelf's. Fails against the floor of three the first unit set. */
  it('answers a take of one, the shelf’s: the nearest record alone', async () => {
    const { rain, drive, sunday, silent } = await seedFour();
    phraseEmbeds([1, 0]);
    const response = await ask(request({ phrase: 'rain on the roof', pool: [rain, drive, sunday, silent], take: 1 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain]);
  });

  it('rejects an empty phrase, an unknown key, a take outside one to five, and a pool that is not ids, as a 400 naming the field', async () => {
    const { rain } = await seedFour();
    for (const [body, field] of [
      [{ phrase: '   ', pool: [rain], take: 3 }, 'phrase'],
      [{ phrase: 'x', pool: [rain], take: 6 }, 'take'],
      [{ phrase: 'x', pool: [rain], take: 0 }, 'take'],
      [{ phrase: 'x', pool: ['not-a-uuid'], take: 3 }, 'pool'],
      [{ phrase: 'x', pool: [rain], take: 3, extra: 1 }, 'extra'],
    ] as const) {
      const response = await ask(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(json.error.fieldErrors ?? {}).join(','), JSON.stringify(body)).toContain(field);
    }
  });

  it('refuses with 503 in the reader’s terms when the key is absent, before any request, and names the variable in the server log', async () => {
    const { rain } = await seedFour();
    vi.stubEnv('OPENAI_API_KEY', '');
    const bodies = phraseEmbeds([1, 0]);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await ask(request({ phrase: 'rain', pool: [rain], take: 3 }));
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error.code).toBe('NOT_CONFIGURED');
    expect(json.error.message).not.toMatch(/OPENAI_API_KEY/);
    expect(bodies).toEqual([]);
    expect(logged.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/OPENAI_API_KEY is not set/);
  });

  /* §P.6: "the title path, which needs no provider, still answers." Production's state on 13 Nov, the key absent in Vercel. Fails against a key check placed before the title is resolved. */
  it('answers a title ask with the key absent, from the record’s stored vector, with no request', async () => {
    const { rain, drive, sunday } = await seedFour();
    vi.stubEnv('OPENAI_API_KEY', '');
    const bodies = phraseEmbeds([0, 1]);
    const response = await ask(request({ phrase: 'the drive', pool: [rain, drive, sunday], take: 3 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ from: 'title', askedFrom: drive, unanswerable: false });
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, sunday]);
    expect(bodies).toEqual([]);
  });
});

/*
  Step 3, unit 2a (the coordinator, 14 Nov): the route ranks while no record anywhere has matched text, and asks the
  model pick as soon as any record does. One collection-wide condition, never per record, so the pool is one kind of
  text in either state; it flips when Adam stores his first batch, with no deploy. In the pick, a record with no
  matched text is not eligible (§P.6's pattern repointed). The model's reply is stubbed at fetch: these test the route's
  rule, not the model.
*/
describe('POST /api/ask, the pick once any record has matched text', () => {
  const matched = (recordId: string, generated: string | null, edited: string | null = null) =>
    db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at, edited, edited_at)
      VALUES (${recordId}, ${generated}, ${generated === null ? null : 'test-model'}, ${generated === null ? null : sql`now()`}, ${edited}, ${edited === null ? null : sql`now()`})`);

  /* A Responses reply, as the structured-outputs guide shapes it; the request body is kept to read what was sent. */
  function pickReplies(body: unknown) {
    const sent: Array<{ url: string; body: { input: Array<{ role: string; content: string }> } }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }] }), { status: 200 });
    });
    return sent;
  }

  it('ranks, as before, while no record has matched text', async () => {
    const { rain, drive, sunday } = await seedFour();
    phraseEmbeds([1, 0]);
    const body = await (await ask(request({ phrase: 'rain', pool: [rain, drive, sunday], take: 3 }))).json();
    expect(body.mode).toBe('ranking');
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, drive, sunday]);
  });

  it('asks the model once any has, sending only the records with matched text, the edit in place of the generated text, and the run’s named records', async () => {
    const { rain, drive, sunday, silent } = await seedFour();
    await matched(rain, 'Solo piano, slow and sparse.');
    await matched(sunday, 'Strings at a crawl.', 'Strings and coffee, slow.');
    const sent = pickReplies({ verdict: 'answer', picks: [{ id: sunday, reason: 'Slow strings for a morning.', claims: ['Strings and coffee'] }] });
    const response = await ask(request({ phrase: 'something slow', pool: [rain, drive, sunday, silent], take: 5, exclude: [rain] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ mode: 'pick', verdict: 'answer', unanswerable: false });
    expect(body.answers).toEqual([{ recordId: sunday, reason: 'Slow strings for a morning.', claims: ['Strings and coffee'] }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/responses$/);
    const user = sent[0].body.input.find((m) => m.role === 'user')?.content ?? '';
    expect(user, 'the edit, not the generated text').toContain('Strings and coffee, slow.');
    expect(user).not.toContain('Strings at a crawl.');
    expect(user, 'a record with matched text').toContain('Solo piano, slow and sparse.');
    expect(user, 'a record with none is not sent').not.toContain(drive);
    expect(user).not.toContain(silent);
    expect(user).toMatch(new RegExp(`already named[^\\n]*${rain}`, 'i'));
  });

  it('answers a stubbed stand-in as one record flagged with its verdict, and a stubbed run’s end as none', async () => {
    const { rain, sunday } = await seedFour();
    await matched(rain, 'Solo piano, slow and sparse.');
    pickReplies({ verdict: 'nothing-fits', picks: [{ id: rain, reason: 'Not loud at all, but it is what there is.', claims: ['Solo piano'] }] });
    expect(await (await ask(request({ phrase: 'loud', pool: [rain, sunday], take: 5 }))).json()).toMatchObject({ mode: 'pick', verdict: 'nothing-fits', answers: [{ recordId: rain }] });
    vi.restoreAllMocks();
    pickReplies({ verdict: 'run-exhausted', picks: [] });
    expect(await (await ask(request({ phrase: 'loud', pool: [rain, sunday], take: 5, exclude: [rain] }))).json()).toMatchObject({ mode: 'pick', verdict: 'run-exhausted', answers: [] });
  });

  it('is unanswerable with no request where nothing in the pool has matched text, though some record elsewhere does', async () => {
    const { rain, drive, sunday } = await seedFour();
    await matched(rain, 'Solo piano, slow and sparse.');
    const sent = pickReplies({ verdict: 'answer', picks: [] });
    expect(await (await ask(request({ phrase: 'x', pool: [drive, sunday], take: 5 }))).json()).toMatchObject({ mode: 'pick', answers: [], unanswerable: true });
    expect(sent).toEqual([]);
  });

  it('refuses with the 503 when the key is absent, and a failed pick with a 502 in the reader’s terms, the reason in the log', async () => {
    const { rain } = await seedFour();
    await matched(rain, 'Solo piano, slow and sparse.');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await ask(request({ phrase: 'x', pool: [rain], take: 5 }))).status).toBe(503);
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), { status: 200 }));
    const failed = await ask(request({ phrase: 'x', pool: [rain], take: 5 }));
    expect(failed.status).toBe(502);
    const json = await failed.json();
    expect(json.error.code).toBe('PICK_FAILED');
    expect(json.error.message).not.toMatch(/refus/);
    expect(logged.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/the model refused/);
  });
});
