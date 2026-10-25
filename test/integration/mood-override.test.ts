import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, recordMoods, records } from '@/db/schema';
import { overrideMoods } from '@/lib/moods/override';
import { tagRecords } from '@/lib/moods/tag-records';
import type { Tagger } from '@/lib/moods/tagging';

/**
 * SPEC.md §4.5 (A76): a set corrected by hand. `overridden` is true,
 * `tagged_by_model` is NULL because no model wrote it, and a regeneration
 * never rewrites it. Held to §7.12's rules like a model's set.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRecord(title = 'The Hurdy Gurdy Man'): Promise<string> {
  const [artist] = await db.insert(artists).values({ name: 'Donovan' }).returning();
  const [record] = await db.insert(records).values({ title, artistId: artist.id }).returning();
  return record.id;
}

const rowFor = async (recordId: string) =>
  (await db.select().from(recordMoods).where(eq(recordMoods.recordId, recordId)))[0];

const modelSet = (recordId: string, moods: string[]) =>
  db.insert(recordMoods).values({ recordId, moods, taggedAt: new Date('2026-10-25T00:37:16Z'), taggedByModel: 'claude-opus-5-5' });

describe('a hand override', () => {
  it('replaces a model’s set, marking it overridden and written by no model', async () => {
    const id = await seedRecord();
    await modelSet(id, ['zone out', 'loud and dirty']);

    const result = await overrideMoods({ recordId: id, moods: ['zone out', 'sleepy', 'sunny'] });

    expect(result).toEqual({ ok: true, before: ['zone out', 'loud and dirty'], after: ['zone out', 'sleepy', 'sunny'] });
    const row = await rowFor(id);
    expect(row).toMatchObject({ moods: ['zone out', 'sleepy', 'sunny'], overridden: true, taggedByModel: null });
    expect(row.taggedAt.getTime()).toBeGreaterThan(new Date('2026-10-25T00:37:16Z').getTime());
  });

  /** No row means not yet looked at; a hand set is a look, so it writes one. */
  it('writes a row for a record no run has tagged', async () => {
    const id = await seedRecord();

    const result = await overrideMoods({ recordId: id, moods: ['sleepy'] });

    expect(result).toEqual({ ok: true, before: null, after: ['sleepy'] });
    expect(await rowFor(id)).toMatchObject({ moods: ['sleepy'], overridden: true, taggedByModel: null });
  });

  it('survives a regeneration', async () => {
    const id = await seedRecord();
    await overrideMoods({ recordId: id, moods: ['sleepy', 'sunny'] });
    const asked: string[] = [];
    const tagger: Tagger = {
      model: 'claude-opus-5-5',
      tag: async (record) => {
        asked.push(record.title);
        return { ok: true, payload: { moods: ['loud and dirty'] } };
      },
    };

    await tagRecords({ tagger, regenerate: true });

    expect(asked).toEqual([]);
    expect(await rowFor(id)).toMatchObject({ moods: ['sleepy', 'sunny'], overridden: true });
  });
});

describe('a hand override is held to §7.12', () => {
  it('refuses a mood outside the list, naming it, and writes nothing', async () => {
    const id = await seedRecord();
    await modelSet(id, ['zone out']);

    expect(await overrideMoods({ recordId: id, moods: ['zone out', 'melancholy'] })).toEqual({ ok: false, reason: 'not a mood: melancholy' });
    expect(await rowFor(id)).toMatchObject({ moods: ['zone out'], overridden: false });
  });

  it('refuses no moods and refuses five', async () => {
    const id = await seedRecord();

    expect(await overrideMoods({ recordId: id, moods: [] })).toEqual({ ok: false, reason: 'no moods' });
    expect(
      await overrideMoods({ recordId: id, moods: ['sleepy', 'sunny', 'smooth', 'zone out', 'dancing'] }),
    ).toEqual({ ok: false, reason: '5 moods, more than 4' });
    expect(await rowFor(id)).toBeUndefined();
  });

  it('refuses a record that does not exist, rather than failing on the foreign key', async () => {
    expect(await overrideMoods({ recordId: '00000000-0000-4000-8000-000000000000', moods: ['sleepy'] })).toEqual({
      ok: false,
      reason: 'no record 00000000-0000-4000-8000-000000000000',
    });
  });
});
