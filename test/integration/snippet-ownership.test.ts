import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, records } from '@/db/schema';
import {
  deleteSnippet,
  editSnippet,
  storeGeneratedSnippet,
  readSnippet,
} from '@/lib/db/queries/snippet';

/**
 * SPEC.md §7.8's ownership rule for §10b's snippet, as pure state.
 *
 * **This is the half of 13c where being wrong is permanent.** Every other
 * failure in the feature is recoverable — a bad snippet is regenerated, a 500 is
 * retried. Silently overwriting text the user wrote destroys it, and nothing
 * afterwards knows it existed. That is why unit 1 is judged on its own, with no
 * LLM anywhere near it: a rule about who owns a piece of text is pure state, and
 * proving it that way is stronger than proving it through a generation flow.
 *
 * No mock, no fixture, no injected client appears in this file, deliberately.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRecord() {
  const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [record] = await db
    .insert(records)
    .values({ title: 'Hear Nothing See Nothing Say Nothing', artistId: artist.id })
    .returning();
  return record;
}

const row = async (id: string) =>
  (await db.select().from(records).where(eq(records.id, id)))[0];

describe('a snippet that has never been edited', () => {
  /**
   * Fails against: a writer that does not store, or that sets
   * `snippet_edited_at` on a GENERATED write.
   *
   * The timestamp means "the user owns this". Setting it when the app wrote the
   * text would lock the record against the very regeneration §10b offers, and
   * the lock would be invisible — the next regeneration would refuse for a
   * reason nobody could see.
   */
  it('is stored with no edit timestamp', async () => {
    const record = await seedRecord();

    await storeGeneratedSnippet(record.id, 'A 1982 hardcore record.');

    const stored = await row(record.id);
    expect(stored.snippet).toBe('A 1982 hardcore record.');
    expect(stored.snippetEditedAt).toBeNull();
  });

  /**
   * Fails against: a regeneration that refuses when it should proceed.
   *
   * §10b (A31a): with `snippet_edited_at` null the text is as generated, so
   * regeneration replaces it without asking. No user work is at stake, and
   * confirming every regeneration would train the user to dismiss the one that
   * matters.
   */
  it('may be replaced by a regeneration without confirmation', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'First attempt.');

    const result = await storeGeneratedSnippet(record.id, 'Second attempt.');

    expect(result.ok).toBe(true);
    expect((await row(record.id)).snippet).toBe('Second attempt.');
  });
});

describe('a snippet the user has edited', () => {
  /**
   * Fails against: an edit that does not record ownership.
   *
   * Without the timestamp every later regeneration would silently overwrite the
   * user's text — the permanent failure this unit exists to prevent.
   */
  it('records that the user now owns it', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');

    await editSnippet(record.id, 'What the user actually thinks.');

    const stored = await row(record.id);
    expect(stored.snippet).toBe('What the user actually thinks.');
    expect(stored.snippetEditedAt).toBeInstanceOf(Date);
  });

  /**
   * **THE test for this unit.** Fails against a regeneration that overwrites
   * user-owned text.
   *
   * §4.2 and §7.8: non-null `snippet_edited_at` means a regeneration must refuse
   * rather than overwrite. Both halves are asserted — the refusal is reported
   * AND the text is unchanged — because a function could return a refusal and
   * still have written, and the write is what does the damage.
   */
  it('is NOT overwritten by a regeneration without confirmation', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');
    await editSnippet(record.id, 'Mine.');

    const result = await storeGeneratedSnippet(record.id, 'A new generation.');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('user_owns_snippet');
    // The damage test: the text must be untouched.
    expect((await row(record.id)).snippet).toBe('Mine.');
  });

  /**
   * Fails against: a confirmation that is ignored, and against one that is not
   * required.
   *
   * §10b (A31a) takes the third shape of "refuse": the affordance is OFFERED
   * with the consequence named, not hidden. §7.8 forbids overwriting user data
   * with EXTERNAL data — the app acting unasked — and §7.3 already draws that
   * line for an identical case: "an explicit user delete of an acquired item is
   * permitted. Mistakes happen, this is a personal tool." A user who typed the
   * text, can see it, and is asking to replace it is not the threat the rule
   * protects against.
   */
  it('IS replaced when the user confirms', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');
    await editSnippet(record.id, 'Mine.');

    const result = await storeGeneratedSnippet(record.id, 'A new generation.', {
      confirmReplace: true,
    });

    expect(result.ok).toBe(true);
    expect((await row(record.id)).snippet).toBe('A new generation.');
  });

  /**
   * Fails against: a confirmed regeneration that leaves the edit timestamp set.
   *
   * After a confirmed replace the text is the APP's again, so ownership returns
   * to the app and the next regeneration needs no confirmation. Leaving the
   * timestamp would make the record permanently sticky — every future
   * regeneration prompting about an edit that no longer exists, which is a
   * confirmation the user cannot make true by any action.
   */
  it('returns ownership to the app once replaced', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');

    await storeGeneratedSnippet(record.id, 'Regenerated.', { confirmReplace: true });

    expect((await row(record.id)).snippetEditedAt).toBeNull();
  });
});

describe('deleting a snippet', () => {
  /**
   * Fails against: a delete that also clears `snippet_edited_at`.
   *
   * §4.2 is explicit: "Deleting a snippet sets `snippet` to null and leaves
   * `snippet_edited_at` alone — a deliberate deletion is an edit." The user
   * owns the ABSENCE too, so a regeneration after a delete must still ask.
   */
  it('clears the text and keeps the edit timestamp', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');
    await editSnippet(record.id, 'Mine.');

    await deleteSnippet(record.id);

    const stored = await row(record.id);
    expect(stored.snippet).toBeNull();
    expect(stored.snippetEditedAt).toBeInstanceOf(Date);
  });

  /**
   * Fails against: a delete that leaves the record open to silent regeneration.
   *
   * The consequence of the rule above, asserted as behaviour rather than as a
   * column value. A user who deleted a snippet chose to have none, and a
   * regeneration filling it back in unasked would overrule that choice.
   */
  it('a deliberate deletion still counts as an edit', async () => {
    const record = await seedRecord();
    await editSnippet(record.id, 'Mine.');
    await deleteSnippet(record.id);

    const result = await storeGeneratedSnippet(record.id, 'Unasked-for text.');

    expect(result.ok).toBe(false);
    expect((await row(record.id)).snippet).toBeNull();
  });

  /**
   * Fails against: a delete on a never-edited snippet that sets the timestamp.
   *
   * Deleting text the APP wrote is not the user asserting authorship of
   * anything — it is discarding a generated draft. §4.2's rule is about
   * preserving a deletion the user made to THEIR OWN text; extending it here
   * would lock a record on the strength of a discarded generation.
   */
  it('deleting a generated snippet does not claim ownership', async () => {
    const record = await seedRecord();
    await storeGeneratedSnippet(record.id, 'Generated.');

    await deleteSnippet(record.id);

    const stored = await row(record.id);
    expect(stored.snippet).toBeNull();
    expect(stored.snippetEditedAt).toBeNull();
  });
});

describe('reading a snippet', () => {
  /**
   * Fails against: a reader that cannot distinguish "no snippet" from "no
   * record".
   *
   * The absent-versus-unknown line this project keeps meeting. §10b says
   * absence is normal, so a record with no snippet is a successful read of
   * nothing — and a record that does not exist is a different answer the caller
   * must be able to give a 404 for.
   */
  it('distinguishes an absent snippet from an absent record', async () => {
    const record = await seedRecord();

    const empty = await readSnippet(record.id);
    expect(empty).toEqual({ snippet: null, snippetEditedAt: null });

    const missing = await readSnippet(MISSING);
    expect(missing).toBeNull();
  });
});

describe('a record that does not exist', () => {
  /**
   * Fails against: a writer that reports success for a record it never wrote.
   *
   * Every one of these takes a record id from a URL. An id that matches nothing
   * must not read as a stored snippet, or the route would return 200 for a
   * write that went nowhere.
   */
  it.each([
    ['storeGeneratedSnippet', () => storeGeneratedSnippet(MISSING, 'text')],
    ['editSnippet', () => editSnippet(MISSING, 'text')],
    ['deleteSnippet', () => deleteSnippet(MISSING)],
  ])('%s reports not-found rather than success', async (_name, call) => {
    const result = await call();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('not_found');
  });
});

/**
 * A well-formed v4 uuid that matches no row.
 *
 * NOT the nil uuid `00000000-...`: `isUuid` correctly rejects that as malformed
 * — the pattern requires a version digit and a variant nibble — so it exercises
 * the 400 path and never reaches the 404 one. Caught by this test failing with
 * `expected 400 to be 404`, which is the test being wrong rather than the code.
 */
const MISSING = '62e4e7db-951d-441c-acf0-11be68ab4daf';
