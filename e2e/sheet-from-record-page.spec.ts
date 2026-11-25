import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { sentencesOf } from '../src/lib/text/sentences';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor } from './seed';
import { login } from './sign-in';

/**
 * **§24 and §67: the sheet from the record page (Q90; "Sheet from the record page mended", 24 Nov).** For each of Smerz's
 * Believer, Never Too Much and The Best Of The Blues Project, seeded with its matched text as production holds it
 * (test/fixtures/sheet-four-known-errors.json), the record page's actions slot holds the matched text's verb, then Edit,
 * then Delete record; pressing the verb opens §67's sheet on that record's text with no sentence open and no reason at
 * its head, and no ask is made. Fails against a verb missing or out of order, a sheet that does not open, one opened on
 * another record or headed by a reason, one that opens a sentence, and a route through the ask.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

type Four = { prefix: string; artist: string; title: string; text: string; wrongSentence: number };
const THREE = (JSON.parse(readFileSync('test/fixtures/sheet-four-known-errors.json', 'utf8')) as Four[]).filter((r) => r.artist !== 'ABBA');

test('three records, the record page alone: the verb sits before Edit and Delete record, and opens the sheet on the record’s text with no sentence open, no reason, and no ask', async ({ page }) => {
  expect(THREE.map((r) => r.title).sort(), 'the step’s three').toEqual(['Believer', 'Never Too Much', 'The Best Of The Blues Project']);
  const asks = { n: 0 };
  page.on('request', (r) => { if (r.url().includes('/api/ask')) asks.n += 1; });
  for (const record of THREE) {
    const artist = (await (await page.request.post('/api/artists', { data: { name: `${record.artist} ${Date.now().toString(36)}` } })).json()) as { id: string };
    trackArtist(artist.id);
    const db = getTestDb();
    const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title) VALUES (${artist.id}::uuid, ${record.title}) RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at) VALUES (${row.id}::uuid, ${record.text}, 'production', now())`);
    try {
      await page.goto(`/records/${row.id}`);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const slot = page.locator('[data-slot="actions"]');
      await expect(slot.locator('[data-control]')).toHaveCount(3, { timeout: 30_000 });
      expect(await slot.locator('[data-control]').evaluateAll((els) => els.map((e) => e.getAttribute('data-control'))), `${record.title}: the verbs in order`).toEqual(['matched-text', 'edit', 'delete']);
      await slot.locator('[data-control="matched-text"]').click();
      const sheet = page.locator('[data-correcting-sheet]');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('[data-sheet-sentence]').first()).toBeVisible({ timeout: 30_000 });
      await expect(sheet.locator('[data-sheet-sentence]'), `${record.title}: its own text, a sentence at a time`).toHaveCount(sentencesOf(record.text).length);
      await expect(sheet.locator('[data-sheet-sentence]').nth(record.wrongSentence - 1)).toHaveText(sentencesOf(record.text)[record.wrongSentence - 1]);
      await expect(sheet.locator('[data-sheet-open]'), 'no sentence open').toHaveCount(0);
      await expect(sheet.locator('[data-sheet-reason]'), 'no reason at the head').toHaveCount(0);
      await sheet.locator('[data-sheet-close]').click();
      await expect(sheet).toHaveCount(0);
    } finally {
      await removeRecordsFor(artist.id);
    }
  }
  expect(asks.n, 'no ask made').toBe(0);
});
