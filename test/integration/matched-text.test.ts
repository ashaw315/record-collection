import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { clearMatchedTextEdit, collectionTitles, editMatchedText, markMatchedTextReviewed, readMatchedText, recordsToDraft, rejectMatchedText, storeGeneratedMatchedText, unreviewedTexts } from '@/lib/db/queries/matched-text';
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

/*
  The drafting script's selection, run against the database (the coordinator, 15 Nov). Its first real run failed here
  before any model call: `= ANY((…))` is a row constructor, not an array (42809). Only the selection touches the
  database before the store, and nothing ran it; these do.
*/
describe('recordsToDraft and collectionTitles', () => {
  const three = async () => [await aRecord(), await aRecord(), await aRecord()];

  it('selects by short id prefix, one or several', async () => {
    const [a, b, c] = await three();
    expect((await recordsToDraft({ prefixes: [a.slice(0, 8)] })).map((r) => r.id)).toEqual([a]);
    expect((await recordsToDraft({ prefixes: [a.slice(0, 8), c.slice(0, 8)] })).map((r) => r.id).sort()).toEqual([a, c].sort());
    expect(b).toBeDefined();
  });

  it('selects every record with no matched text for --all, leaving out one with a generated text or an edit', async () => {
    const [a, b, c] = await three();
    await storeGeneratedMatchedText(a, 'Described.', 'model-a');
    await db.execute(sql`INSERT INTO record_matched_text (record_id, edited, edited_at) VALUES (${b}, 'Edited.', now())`);
    expect((await recordsToDraft('all')).map((r) => r.id)).toEqual([c]);
  });

  it('carries what the prompt needs: artist, title, year, the ABOUT, and the cached payload or null', async () => {
    const [a] = await three();
    await db.execute(sql`UPDATE records SET snippet = 'An ABOUT.' WHERE id = ${a}`);
    expect(await recordsToDraft({ prefixes: [a.slice(0, 8)] })).toEqual([{ id: a, artist: 'Store', title: 'Stored', year: null, about: 'An ABOUT.', payload: null }]);
  });

  it('reads every record’s id, title and artist for the diagnostic', async () => {
    const [a, b, c] = await three();
    expect((await collectionTitles()).map((r) => r.id).sort()).toEqual([a, b, c].sort());
    expect((await collectionTitles())[0]).toMatchObject({ title: 'Stored', artist: 'Store' });
  });
});

/*
  §5.2's matched-text resource (the coordinator, 17 Nov): the read, the edit and its clearing, the only writer of `edited`.
  Two absences kept apart, as the snippet's are: a record with no row is a state of the record, a record that does not
  exist is not found. The edit's upsert is proved here against Postgres, not assumed: a row with `edited` set and
  `generated` NULL passes §4.6's two CHECKs, since each is on one column, which is why no migration precedes the route.
*/
const MISSING = '62e4e7db-951d-441c-acf0-11be68ab4daf';

describe('readMatchedText', () => {
  it('is null for a record that does not exist, and every field null for a record with no row', async () => {
    expect(await readMatchedText(MISSING)).toBeNull();
    const id = await aRecord();
    expect(await readMatchedText(id)).toEqual({ generated: null, generatedModel: null, generatedAt: null, edited: null, editedAt: null });
  });

  it('reads both halves of a row', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Generated.', 'model-a');
    await editMatchedText(id, 'Edited.');
    const state = await readMatchedText(id);
    expect(state).toMatchObject({ generated: 'Generated.', generatedModel: 'model-a', edited: 'Edited.' });
    expect(state?.generatedAt).toBeInstanceOf(Date);
    expect(state?.editedAt).toBeInstanceOf(Date);
  });
});

describe('editMatchedText', () => {
  it('inserts the row where none exists, with the generated half NULL, and the CHECKs accept it', async () => {
    const id = await aRecord();
    expect(await editMatchedText(id, 'By hand.')).toEqual({ ok: true });
    const r = await row(id);
    expect(r).toMatchObject({ generated: null, generated_model: null, generated_at: null, edited: 'By hand.' });
    expect(r.edited_at).not.toBeNull();
  });

  it('writes edited and edited_at on a row that has a generated text, touching nothing else', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Generated.', 'model-a');
    const before = await row(id);
    await editMatchedText(id, 'Edited.');
    const after = await row(id);
    expect(after).toMatchObject({ generated: 'Generated.', generated_model: 'model-a', generated_at: before.generated_at, edited: 'Edited.' });
    expect(after.edited_at).not.toBeNull();
  });

  it('is not found for a record that does not exist, writing nothing', async () => {
    expect(await editMatchedText(MISSING, 'Nowhere.')).toEqual({ ok: false, reason: 'not_found' });
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM record_matched_text`)).rows[0]).toEqual({ n: 0 });
  });
});

describe('clearMatchedTextEdit', () => {
  it('clears edited and edited_at and leaves the generated half', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Generated.', 'model-a');
    await editMatchedText(id, 'Edited.');
    expect(await clearMatchedTextEdit(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ generated: 'Generated.', generated_model: 'model-a', edited: null, edited_at: null });
  });

  it('is ok on a record with no row, creating none, and not found for a record that does not exist', async () => {
    const id = await aRecord();
    expect(await clearMatchedTextEdit(id)).toEqual({ ok: true });
    expect(await row(id)).toBeUndefined();
    expect(await clearMatchedTextEdit(MISSING)).toEqual({ ok: false, reason: 'not_found' });
  });
});

/**
 * **The unreviewed mark (the coordinator, 22 Nov; Design's two requirements).** From unit two a text can enter the pool
 * with nobody having read it, so the data says which texts Adam has read: `reviewed_at`, null until he marks, corrects
 * or edits. The mechanical checks travel with the draft in `checks`, never the drafting model's own basis marks (§67;
 * Q75). Fails against a store that marks its own output reviewed, a mark that touches the text, an edit that does not
 * count as a read, a rejection that leaves the record in the pool, and a listing that shows a reviewed text or hides an
 * unread ABOUT.
 */
const reviewed = async (id: string) =>
  (await db.execute<{ reviewed_at: string | null; checks: unknown }>(sql`SELECT reviewed_at::text, checks FROM record_matched_text WHERE record_id = ${id}`)).rows[0];
const CHECKS = { dropped: ['A sentence about the material.'], disagreements: [{ a: 1, b: 3, why: 'exclusivity beside a name' }], numbered: [2] };

describe('reviewed_at and checks', () => {
  it('a store leaves reviewed_at null, carries the mechanical checks, and a re-store makes the text unread again', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Solo piano, slow and sparse.', 'model-a', { checks: CHECKS });
    expect(await reviewed(id)).toEqual({ reviewed_at: null, checks: CHECKS });
    await markMatchedTextReviewed(id);
    expect((await reviewed(id)).reviewed_at).not.toBeNull();
    await storeGeneratedMatchedText(id, 'Redrafted.', 'model-a');
    expect(await reviewed(id), 'a regeneration is a new text nobody has read').toEqual({ reviewed_at: null, checks: null });
  });

  it('a mark sets reviewed_at and nothing else; a mark with a corrected text writes it as Adam’s edit', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Solo piano, slow and sparse.', 'model-a');
    expect(await markMatchedTextReviewed(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ generated: 'Solo piano, slow and sparse.', edited: null, edited_at: null });
    expect((await reviewed(id)).reviewed_at).not.toBeNull();

    const other = await aRecord();
    await storeGeneratedMatchedText(other, 'Solo piano.', 'model-a');
    expect(await markMatchedTextReviewed(other, { text: '  Solo piano, and tape hiss.  ' })).toEqual({ ok: true });
    expect(await row(other)).toMatchObject({ generated: 'Solo piano.', edited: 'Solo piano, and tape hiss.' });
    expect((await row(other)).edited_at).not.toBeNull();
    expect((await reviewed(other)).reviewed_at).not.toBeNull();
    expect(await markMatchedTextReviewed('62e4e7db-951d-441c-acf0-11be68ab4daf')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('an edit is a read: editMatchedText sets reviewed_at', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Solo piano.', 'model-a');
    await editMatchedText(id, 'Solo piano, slower.');
    expect((await reviewed(id)).reviewed_at).not.toBeNull();
  });

  it('a rejection removes the row, so the record leaves the pool and is drafted again by --all', async () => {
    const id = await aRecord();
    await storeGeneratedMatchedText(id, 'Wrong in every sentence.', 'model-a');
    expect((await recordsToDraft('all')).map((r) => r.id)).not.toContain(id);
    expect(await rejectMatchedText(id)).toEqual({ ok: true });
    expect(await row(id)).toBeUndefined();
    expect((await recordsToDraft('all')).map((r) => r.id)).toContain(id);
    expect(await rejectMatchedText('62e4e7db-951d-441c-acf0-11be68ab4daf')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('unreviewedTexts lists each record with an unread matched text or an unread ABOUT, with both texts and which is unread', async () => {
    const unreadBoth = await aRecord();
    await db.execute(sql`UPDATE records SET snippet = 'An ABOUT nobody read.' WHERE id = ${unreadBoth}`);
    await storeGeneratedMatchedText(unreadBoth, 'A text nobody read.', 'model-a', { checks: CHECKS });
    const readBoth = await aRecord();
    await db.execute(sql`UPDATE records SET snippet = 'A read ABOUT.', snippet_reviewed_at = now() WHERE id = ${readBoth}`);
    await storeGeneratedMatchedText(readBoth, 'A read text.', 'model-a');
    await markMatchedTextReviewed(readBoth);
    const aboutOnly = await aRecord();
    await db.execute(sql`UPDATE records SET snippet = 'Unread ABOUT, no matched text.' WHERE id = ${aboutOnly}`);
    await aRecord();

    const listed = await unreviewedTexts();
    expect(listed.map((r) => r.id).sort()).toEqual([unreadBoth, aboutOnly].sort());
    expect(listed.find((r) => r.id === unreadBoth)).toMatchObject({ artist: 'Store', title: 'Stored', about: 'An ABOUT nobody read.', aboutUnreviewed: true, matched: 'A text nobody read.', matchedUnreviewed: true, checks: CHECKS });
    expect(listed.find((r) => r.id === aboutOnly)).toMatchObject({ about: 'Unread ABOUT, no matched text.', aboutUnreviewed: true, matched: null, matchedUnreviewed: false, checks: null });
  });
});

describe('unreviewedTexts orders newest first', () => {
  /** Fails against an alphabetical order: the backlog of 55 would stand between Adam and a new import (the coordinator, 22 Nov). */
  it('puts the most recently drafted text first, by the later of its matched text’s time and the record’s update', async () => {
    const older = await aRecord();
    await storeGeneratedMatchedText(older, 'Older.', 'model-a');
    await db.execute(sql`UPDATE record_matched_text SET generated_at = now() - interval '2 days' WHERE record_id = ${older}`);
    const newer = await aRecord();
    await storeGeneratedMatchedText(newer, 'Newer.', 'model-a');
    const listed = await unreviewedTexts();
    expect(listed.map((r) => r.id)).toEqual([newer, older]);
    expect(listed[0].since).toBeTruthy();
  });
});
