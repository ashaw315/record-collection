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
});
