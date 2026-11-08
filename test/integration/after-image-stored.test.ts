import { execFileSync } from 'node:child_process';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';
import { images, records } from '@/db/schema';
import { createArtist } from '@/lib/db/queries/artists';
import { afterImageStored } from '@/lib/images/follow-cover';

/*
  The work an upload does once its row exists, as one function (the coordinator, 8 Nov). The upload route calls it,
  and so does the capture tool after seeding a row, so a capture shows the state a real upload leaves. On 8 Nov the
  covers-group capture seeded three covers straight into the table, skipped the route's colour, and Design reviewed
  a page no real record can show. Here the rows are written as the seed writes them, a data URL and no bytes in hand.
*/
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const solid = async (r: number, g: number, b: number) =>
  `data:image/png;base64,${(await sharp({ create: { width: 24, height: 24, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString('base64')}`;

async function recordWith(rows: Array<{ imageType: 'cover' | 'back'; url: string }>): Promise<string> {
  const artist = await createArtist({ name: 'Discharge' });
  const [record] = await db.insert(records).values({ title: 'Hear Nothing', artistId: artist.id }).returning({ id: records.id });
  for (const row of rows) await db.insert(images).values({ recordId: record.id, imageType: row.imageType, url: row.url });
  return record.id;
}

const colourOf = async (recordId: string) =>
  (await db.select({ c: records.spineColour }).from(records).where(eq(records.id, recordId)))[0]?.c ?? null;

describe('afterImageStored: what a stored image changes beyond its own row', () => {
  it('a cover stored without its bytes in hand colours the record from the newest stored cover, as an upload does', async () => {
    const recordId = await recordWith([
      { imageType: 'cover', url: await solid(200, 40, 40) },
      { imageType: 'cover', url: await solid(40, 60, 200) },
    ]);
    expect(await colourOf(recordId), 'the seed’s precondition: a cover row and no colour').toBeNull();

    await afterImageStored(recordId, { imageType: 'cover' });

    expect(await colourOf(recordId)).toBe('#283cc8');
  });

  it('an image that is not a cover leaves the colour alone, even where a cover is stored and uncoloured', async () => {
    const recordId = await recordWith([
      { imageType: 'cover', url: await solid(40, 60, 200) },
      { imageType: 'back', url: await solid(200, 40, 40) },
    ]);

    await afterImageStored(recordId, { imageType: 'back' });

    expect(await colourOf(recordId)).toBeNull();
  });
});

describe('scripts/after-image-stored.mts, the capture’s way in', () => {
  it('colours a seeded record against the local test database, as the route would have', async () => {
    const recordId = await recordWith([{ imageType: 'cover', url: await solid(40, 160, 60) }]);

    const out = execFileSync(
      process.execPath,
      ['--conditions=react-server', '--import', 'tsx', 'scripts/after-image-stored.mts', recordId, 'cover'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL }, encoding: 'utf8' },
    );

    expect(await colourOf(recordId)).toBe('#28a03c');
    expect(out).toContain(recordId);
  });

  it('refuses a database that is not local, before it touches one', () => {
    const run = () =>
      execFileSync(
        process.execPath,
        ['--conditions=react-server', '--import', 'tsx', 'scripts/after-image-stored.mts', '00000000-0000-4000-8000-000000000000', 'cover'],
        { env: { ...process.env, NODE_ENV: 'production', TEST_DATABASE_URL: '', DATABASE_URL: 'postgres://u:p@db.example.com:5432/prod' }, encoding: 'utf8', stdio: 'pipe' },
      );
    expect(run).toThrow(/after-image-stored: refusing, the database is not the local test database/);
  });
});
