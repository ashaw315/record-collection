import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { spineColoursOf } from '@/lib/db/queries/records';

/**
 * §T.6 (step 110): "the solids are the tints of the first three records
 * the screen shows, in its current order... A record without colour gives
 * no solid." The page knows which records it shows and in what order; this
 * gives each one's stored colour, in the order asked.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

describe('spineColoursOf', () => {
  it('asks nothing of the database for no ids', async () => {
    expect(await spineColoursOf([])).toEqual([]);
  });

  /* Fails against a result in the database's order, or one that drops the record with no colour and so shifts the rest. */
  it('gives each record’s colour in the order asked, null where it has none', async () => {
    const a = await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Colours') RETURNING id`);
    const rows = await db.execute<{ id: string; title: string }>(
      sql`INSERT INTO records (artist_id, title, spine_colour) VALUES
            (${a.rows[0].id}::uuid, 'red', '#aa2211'),
            (${a.rows[0].id}::uuid, 'none', NULL),
            (${a.rows[0].id}::uuid, 'blue', '#1133aa')
          RETURNING id, title`,
    );
    const id = (title: string) => rows.rows.find((r) => r.title === title)?.id ?? '';
    expect(await spineColoursOf([id('blue'), id('none'), id('red')])).toEqual(['#1133aa', null, '#aa2211']);
    expect(await spineColoursOf([id('none'), id('red')])).toEqual([null, '#aa2211']);
  });
});
