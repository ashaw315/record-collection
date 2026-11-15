import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { POST as ask } from '@/app/api/ask/route';
import { storeEmbedding } from '@/lib/db/queries/embeddings';
import { countNotDescribed, pickEngaged, pickLive } from '@/lib/db/queries/ask';
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
  Step 3, unit 2a, as corrected (the coordinator, 14 Nov). The pick engages when every record that has an ABOUT also
  has matched text, coverage complete, and from then on it never returns to ranking: a one-way latch, so record 56
  arriving without matched text joins §P.6's ineligible count rather than flipping the collection back. One record
  described among 53 is not a pick over one record; it is still the ranking. Whether a run has run out is the app's to
  say from the run's named records, never the model's. The model's reply is stubbed at fetch: these test the route's
  rule, not the model.
*/
describe('POST /api/ask, the pick once coverage is complete, latched', () => {
  const matched = (recordId: string, generated: string | null, edited: string | null = null) =>
    db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at, edited, edited_at)
      VALUES (${recordId}, ${generated}, ${generated === null ? null : 'test-model'}, ${generated === null ? null : sql`now()`}, ${edited}, ${edited === null ? null : sql`now()`})`);
  /* Every record with an ABOUT in seedFour (rain, drive, sunday; silent has none) given matched text. */
  const coverAll = async (f: { rain: string; drive: string; sunday: string }) => {
    await matched(f.rain, 'Rain on a tin roof. Slow and warm.');
    await matched(f.drive, 'Neon and quiet. A late drive.');
    await matched(f.sunday, 'Strings at a crawl.', 'Strings and coffee, slow.');
  };

  /* A Responses reply, as the structured-outputs guide shapes it; the request body is kept to read what was sent. */
  function pickReplies(body: unknown) {
    const sent: Array<{ url: string; body: { input: Array<{ role: string; content: string }> } }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }] }), { status: 200 });
    });
    return sent;
  }

  it('ranks while any record with an ABOUT has no matched text: one described among several is still the ranking', async () => {
    const { rain, drive, sunday } = await seedFour();
    await matched(rain, 'Rain on a tin roof. Slow and warm.');
    phraseEmbeds([1, 0]);
    const body = await (await ask(request({ phrase: 'rain', pool: [rain, drive, sunday], take: 3 }))).json();
    expect(body.mode).toBe('ranking');
    expect(body.answers.map((a: { recordId: string }) => a.recordId)).toEqual([rain, drive, sunday]);
  });

  it('engages the pick when every record with an ABOUT has matched text, and stays engaged when a new record arrives without', async () => {
    const f = await seedFour();
    await coverAll(f);
    pickReplies({ verdict: 'answer', picks: [{ id: f.sunday, reason: 'Slow strings for a morning.', claims: ['Strings and coffee, slow.'] }] });
    expect((await (await ask(request({ phrase: 'slow', pool: [f.rain, f.sunday], take: 5 }))).json()).mode).toBe('pick');
    const late = await record('Fifth', 'A new record with an ABOUT and nothing written for the pick.');
    vi.restoreAllMocks();
    const sent = pickReplies({ verdict: 'answer', picks: [{ id: f.rain, reason: 'Rain and warmth.', claims: ['Slow and warm.'] }] });
    const body = await (await ask(request({ phrase: 'slow', pool: [f.rain, late], take: 5 }))).json();
    expect(body.mode, 'latched: one record without matched text does not flip it back').toBe('pick');
    expect(sent[0].body.input.find((m) => m.role === 'user')?.content ?? '', 'and that record is not sent').not.toContain(late);
  });

  /* Not vacuous (the coordinator, 14 Nov): with no ABOUT and no matched text anywhere, "every record with an ABOUT has matched text" is true of nothing, and a latch thrown there would pick over an empty pool for ever. */
  it('does not latch where no record has matched text, though no record has an ABOUT either', async () => {
    const lone = await record('Untold', null);
    phraseEmbeds([1, 0]);
    expect((await (await ask(request({ phrase: 'x', pool: [lone], take: 3 }))).json()).mode).toBe('ranking');
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM app_latches`)).rows[0]).toEqual({ n: 0 });
  });

  /* Two asks together both find coverage complete: the write is insert-if-absent, and a write that fails anyway does not fail the ask, which answers in the pick; the next ask sets the latch. */
  it('answers in the pick when the latch’s write fails, logging it, and sets the latch on the next ask', async () => {
    const f = await seedFour();
    await coverAll(f);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await pickEngaged({ write: () => Promise.reject(new Error('could not write')) }), 'this ask still picks').toBe(true);
    expect(logged.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/the pick's latch was not written: could not write/);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM app_latches`)).rows[0], 'nothing written').toEqual({ n: 0 });
    expect(await pickEngaged()).toBe(true);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM app_latches`)).rows[0], 'written by the next').toEqual({ n: 1 });
  });

  /*
    §P.6 as "Matched by role and count line" rules it (14 Nov): the line counts records with no text to be matched by,
    ABOUTs while the ask ranks and matched text once the pick is live. Read without writing, since a page render is no
    place to throw the latch; the route throws it.
  */
  it('counts records with no ABOUT while the ask ranks, and with no matched text once the pick is live, reading the latch without writing it', async () => {
    const f = await seedFour();
    await matched(f.rain, 'Rain on a tin roof. Slow and warm.');
    expect(await pickLive()).toBe(false);
    expect(await countNotDescribed(), 'ranking: silent has no ABOUT').toBe(1);
    await matched(f.drive, 'Neon and quiet. A late drive.');
    await matched(f.sunday, 'Strings at a crawl.');
    expect(await pickLive(), 'coverage complete').toBe(true);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM app_latches`)).rows[0], 'read, not written').toEqual({ n: 0 });
    expect(await countNotDescribed(), 'the pick: silent has no matched text').toBe(1);
    await record('Fifth', 'A new record with an ABOUT and nothing written for the pick.');
    await db.execute(sql`INSERT INTO app_latches (name) VALUES ('ask_pick')`);
    expect(await pickLive(), 'latched').toBe(true);
    expect(await countNotDescribed(), 'silent and the new record').toBe(2);
  });

  /* "Matched by role and count line" (14 Nov): a title ask while the model picks sends the record's matched text as the phrase, leaves the record out, and sends no title. */
  it('asks from a title by sending its record’s matched text as the phrase, leaving the record out, and sending no title', async () => {
    const f = await seedFour();
    await coverAll(f);
    const sent = pickReplies({ verdict: 'answer', picks: [{ id: f.rain, reason: 'Rain and warmth.', claims: ['Slow and warm.'] }] });
    const body = await (await ask(request({ phrase: 'the drive', pool: [f.rain, f.drive, f.sunday], take: 5 }))).json();
    expect(body).toMatchObject({ mode: 'pick', from: 'title', askedFrom: f.drive });
    const user = sent[0].body.input.find((m) => m.role === 'user')?.content ?? '';
    expect(user, 'the record’s matched text as the phrase').toMatch(/What they want to play: Neon and quiet\. A late drive\./);
    expect(user, 'no title').not.toMatch(/the drive/i);
    expect(user, 'the record left out of the records sent').not.toContain(`[${f.drive}]`);
  });

  it('sends only the pool’s records with matched text, the edit in place of the generated text, and the run’s shown records as named', async () => {
    const f = await seedFour();
    await coverAll(f);
    const sent = pickReplies({ verdict: 'answer', picks: [{ id: f.sunday, reason: 'Slow strings for a morning.', claims: ['Strings and coffee, slow.'] }] });
    const response = await ask(request({ phrase: 'something slow', pool: [f.rain, f.sunday, f.silent], take: 5, exclude: [f.rain] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'pick', verdict: 'answer', unanswerable: false, answers: [{ recordId: f.sunday, reason: 'Slow strings for a morning.', claims: ['Strings and coffee, slow.'] }] });
    const user = sent[0].body.input.find((m) => m.role === 'user')?.content ?? '';
    expect(user, 'the edit, not the generated text').toContain('Strings and coffee, slow.');
    expect(user).not.toContain('Strings at a crawl.');
    expect(user, 'not in the pool, not sent').not.toContain(f.drive);
    expect(user, 'no matched text, not sent').not.toContain(f.silent);
    expect(user).toMatch(new RegExp(`already named[^\\n]*${f.rain}`, 'i'));
  });

  it('decides a run’s end itself: nothing suitable with nothing named is nothing fits, with something named it is no more for this run', async () => {
    const f = await seedFour();
    await coverAll(f);
    pickReplies({ verdict: 'nothing-fits', picks: [{ id: f.rain, reason: 'Not loud at all, but it is what there is.', claims: ['Slow and warm.'] }] });
    expect(await (await ask(request({ phrase: 'loud', pool: [f.rain, f.sunday], take: 5 }))).json()).toMatchObject({ mode: 'pick', verdict: 'nothing-fits', answers: [{ recordId: f.rain }] });
    vi.restoreAllMocks();
    pickReplies({ verdict: 'nothing-fits', picks: [{ id: f.sunday, reason: 'Not loud.', claims: ['Strings and coffee, slow.'] }] });
    expect(await (await ask(request({ phrase: 'loud', pool: [f.rain, f.sunday], take: 5, exclude: [f.rain] }))).json()).toMatchObject({ mode: 'pick', verdict: 'run-exhausted', answers: [] });
  });

  it('is unanswerable with no request where nothing in the pool has matched text', async () => {
    const f = await seedFour();
    await coverAll(f);
    const sent = pickReplies({ verdict: 'answer', picks: [] });
    expect(await (await ask(request({ phrase: 'x', pool: [f.silent], take: 5 }))).json()).toMatchObject({ mode: 'pick', answers: [], unanswerable: true });
    expect(sent).toEqual([]);
  });

  it('refuses with the 503 when the key is absent, and a failed pick with a 502 in the reader’s terms, the reason in the log', async () => {
    const f = await seedFour();
    await coverAll(f);
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await ask(request({ phrase: 'x', pool: [f.rain], take: 5 }))).status).toBe(503);
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), { status: 200 }));
    const failed = await ask(request({ phrase: 'x', pool: [f.rain], take: 5 }));
    expect(failed.status).toBe(502);
    const json = await failed.json();
    expect(json.error.code).toBe('PICK_FAILED');
    expect(json.error.message).not.toMatch(/refus/);
    expect(logged.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/the model refused/);
  });
});
