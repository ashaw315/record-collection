import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import replies from '../fixtures/moods/replies.json';
import { artists, recordMoods, records } from '@/db/schema';
import { tagRecords } from '@/lib/moods/tag-records';
import { writeMoodSets } from '@/lib/db/queries/record-moods';
import type { Tagger } from '@/lib/moods/tagging';

/**
 * SPEC.md §4.5 and §7.12 (A76): what a tagging run writes, against the real
 * database, with the model stubbed (§11).
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

type Scenario = Exclude<keyof typeof replies, '_about'>;

/** Answers from one fixture scenario by title, and counts what it was asked. */
function fixtureTagger(scenario: Scenario) {
  const answers: Record<string, unknown> = replies[scenario];
  const asked: string[] = [];
  const tagger: Tagger = {
    model: 'claude-opus-5-5',
    tag: async (record) => {
      asked.push(record.title);
      return { ok: true, payload: answers[record.title] };
    },
  };
  return { tagger, asked };
}

async function seed(titles = ['Kind of Blue', 'London Calling', 'Remain in Light']) {
  const [artist] = await db.insert(artists).values({ name: 'Various' }).returning();
  const rows = await db
    .insert(records)
    .values(titles.map((title) => ({ title, artistId: artist.id })))
    .returning();
  return Object.fromEntries(rows.map((r) => [r.title, r.id]));
}

async function stored() {
  const rows = await db
    .select({ title: records.title, moods: recordMoods.moods, overridden: recordMoods.overridden, model: recordMoods.taggedByModel })
    .from(recordMoods)
    .innerJoin(records, eq(records.id, recordMoods.recordId))
    .orderBy(asc(records.title));
  return rows;
}

describe('a refused run', () => {
  /** Nothing is kept from a flat run: every set in it is suspect, not one. */
  it('writes nothing when every record received the same count', async () => {
    await seed();

    const run = await tagRecords({ tagger: fixtureTagger('flat').tagger });

    expect(run.verdict).toBe('refused-flat');
    expect(run.written).toBe(0);
    expect(await stored()).toEqual([]);
  });

  /**
   * The failed record gets no row, so the next run retries it; the others are
   * kept, or one record the model cannot answer would block every run.
   */
  it('writes no row for a record left with no mood, and keeps the rest', async () => {
    await seed();

    const run = await tagRecords({ tagger: fixtureTagger('one-empty').tagger });

    expect(run.verdict).toBe('refused-missing');
    expect(run.failed.map((f) => f.record.title)).toEqual(['London Calling']);
    expect((await stored()).map((r) => r.title)).toEqual(['Kind of Blue', 'Remain in Light']);
  });
});

describe('a run that is not refused', () => {
  it('stores four moods as four, recording the model', async () => {
    await seed();

    const run = await tagRecords({ tagger: fixtureTagger('varied').tagger });

    expect(run.verdict).toBe('ok');
    expect(run.written).toBe(3);
    expect(await stored()).toEqual([
      { title: 'Kind of Blue', moods: ['smooth', 'zone out', 'sleepy'], overridden: false, model: 'claude-opus-5-5' },
      { title: 'London Calling', moods: ['loud and dirty', 'jacked up'], overridden: false, model: 'claude-opus-5-5' },
      { title: 'Remain in Light', moods: ['dancing', 'jacked up', 'showing off', 'zone out'], overridden: false, model: 'claude-opus-5-5' },
    ]);
  });

  /** One run backfills, picks up new records and retries failures: it asks about records with no row. */
  it('asks only about records with no row', async () => {
    await seed();
    await tagRecords({ tagger: fixtureTagger('one-empty').tagger });

    const second = fixtureTagger('varied');
    await tagRecords({ tagger: second.tagger });

    expect(second.asked).toEqual(['London Calling']);
    expect((await stored()).map((r) => r.title)).toEqual(['Kind of Blue', 'London Calling', 'Remain in Light']);
  });
});

describe('a regeneration', () => {
  it('rewrites every set that is not overridden, and leaves an overridden one alone', async () => {
    const ids = await seed();
    await tagRecords({ tagger: fixtureTagger('varied').tagger });
    await db
      .update(recordMoods)
      .set({ moods: ['sunny'], overridden: true, taggedByModel: null })
      .where(eq(recordMoods.recordId, ids['Kind of Blue']));

    const again = fixtureTagger('as-written');
    const run = await tagRecords({ tagger: again.tagger, regenerate: true });

    expect(run.verdict).toBe('ok');
    expect(again.asked.sort()).toEqual(['London Calling', 'Remain in Light']);
    expect(await stored()).toEqual([
      { title: 'Kind of Blue', moods: ['sunny'], overridden: true, model: null },
      { title: 'London Calling', moods: ['loud and dirty', 'jacked up'], overridden: false, model: 'claude-opus-5-5' },
      { title: 'Remain in Light', moods: ['dancing', 'jacked up', 'zone out'], overridden: false, model: 'claude-opus-5-5' },
    ]);
  });

  /**
   * The write's own guard, apart from the read's: a set corrected by hand
   * after the run read its records must still survive the write.
   */
  it('never writes over an overridden set, even one handed to the write', async () => {
    const ids = await seed(['Kind of Blue']);
    await db.insert(recordMoods).values({ recordId: ids['Kind of Blue'], moods: ['sunny'], taggedAt: new Date(), overridden: true });

    const written = await writeMoodSets([{ recordId: ids['Kind of Blue'], moods: ['smooth', 'zone out'] }], 'claude-opus-5-5');

    expect(written).toBe(0);
    expect(await stored()).toEqual([{ title: 'Kind of Blue', moods: ['sunny'], overridden: true, model: null }]);
  });
});
