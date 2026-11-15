import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { storeGeneratedMatchedText } from '@/lib/db/queries/matched-text';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';

/**
 * **SPEC §4.6: a regeneration writes `generated`, its model and its time, and nothing else, so Adam's edit outlives it.**
 * The edit and the generated text are apart, and the store is the only writer of the generated half. A blank is NULL.
 */
const db = getTestDb();
beforeEach(async () => truncateAll());
afterAll(async () => closeTestDb());

async function aRecord(): Promise<string> {
  const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Store') RETURNING id`)).rows;
  const [record] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title) VALUES (${artist.id}, 'Stored') RETURNING id`)).rows;
  return record.id;
}
const row = async (id: string) =>
  (await db.execute<{ generated: string | null; generated_model: string | null; generated_at: string | null; edited: string | null; edited_at: string | null }>(sql`
    SELECT generated, generated_model, generated_at::text, edited, edited_at::text FROM record_matched_text WHERE record_id = ${id}`)).rows[0];

describe('storeGeneratedMatchedText', () => {
  it('writes the generated text with its model and time where there was no row', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Solo piano, slow and sparse.', 'model-a');
    expect(await row(id)).toMatchObject({ generated: 'Solo piano, slow and sparse.', generated_model: 'model-a', edited: null, edited_at: null });
    expect((await row(id)).generated_at).not.toBeNull();
  });

  it('replaces the generated text and never touches Adam’s edit', async () => {
    const id = await aRecord();
    await db.execute(sql`INSERT INTO record_matched_text (record_id, edited, edited_at) VALUES (${id}, 'Adam’s words.', '2026-11-01T00:00:00Z')`);
    await storeGeneratedMatchedText(id, 'First draft.', 'model-a');
    await storeGeneratedMatchedText(id, 'Second draft.', 'model-b');
    const r = await row(id);
    expect(r).toMatchObject({ generated: 'Second draft.', generated_model: 'model-b', edited: 'Adam’s words.' });
    expect(r.edited_at, 'the edit’s time unchanged').toMatch(/^2026-11-01/);
  });

  it('stores a blank as NULL, never as an empty text', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, '   ', 'model-a');
    expect(await row(id)).toMatchObject({ generated: null, generated_model: null, generated_at: null });
  });
});
