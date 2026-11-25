import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { getTestDb } from '../../test/helpers/db';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor } from '../seed';
import { login } from '../sign-in';

/**
 * **§24 and §67: the sheet from the record page, captured (Q90's Capture bullet, 24 Nov).** Smerz's Believer, Never Too
 * Much and The Best Of The Blues Project, each seeded with its matched text as production holds it
 * (test/fixtures/sheet-four-known-errors.json) under its own artist and title. At 1440 × 900 and 390 × 844: the record
 * page with Matched text, Edit and Delete record in the slot, named by the header's height (53 in line, 97 with the slot
 * on its own row), then the sheet the verb opens, no sentence open and no reason at its head. To
 * docs/captures/sheet-from-record-page/. Seeded records, real texts; covers are absent. Run with CAPTURE=1
 * --project=capture.
 */
registerCleanup();

type Four = { prefix: string; artist: string; title: string; text: string; wrongSentence: number };
const THREE = (JSON.parse(readFileSync('test/fixtures/sheet-four-known-errors.json', 'utf8')) as Four[]).filter((r) => r.artist !== 'ABBA');
const OUT = join('docs', 'captures', 'sheet-from-record-page');

for (const record of THREE) {
  test(`${record.artist}, ${record.title}: the slot's three verbs and the sheet they open, at 1440 × 900 and 390 × 844`, async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    await login(page);
    mkdirSync(OUT, { recursive: true });
    const db = getTestDb();
    const artist = (await (await page.request.post('/api/artists', { data: { name: `${record.artist} ${Date.now().toString(36)}` } })).json()) as { id: string };
    trackArtist(artist.id);
    const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title) VALUES (${artist.id}::uuid, ${record.title}) RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at) VALUES (${row.id}::uuid, ${record.text}, 'production', now())`);
    try {
      for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(`/records/${row.id}`);
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        const slot = page.locator('[data-slot="actions"]');
        await expect(slot.locator('[data-control]')).toHaveCount(3, { timeout: 30_000 });
        const header = Math.round((await page.locator('header').first().boundingBox())?.height ?? 0);
        await page.screenshot({ path: join(OUT, `${record.prefix}-${width}x${height}-header-${header}.png`) });
        await slot.locator('[data-control="matched-text"]').click();
        const sheet = page.locator('[data-correcting-sheet]');
        await expect(sheet.locator('[data-sheet-sentence]').first()).toBeVisible({ timeout: 30_000 });
        await expect(sheet.locator('[data-sheet-open]')).toHaveCount(0);
        await page.screenshot({ path: join(OUT, `${record.prefix}-${width}x${height}-sheet-none-open.png`) });
        await page.keyboard.press('Escape');
      }
    } finally {
      await removeRecordsFor(artist.id);
    }
  });
}
