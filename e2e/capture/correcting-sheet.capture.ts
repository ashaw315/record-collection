import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../../test/helpers/db';
import { sentencesOf } from '../../src/lib/text/sentences';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor } from '../seed';
import { login } from '../sign-in';

/**
 * **§67's sheet, captured on the four known errors with the wrong sentence open (the step's Capture bullet; 24 Nov).**
 * Smerz's Believer sentence 1, Never Too Much 5, ABBA 3 and The Best Of The Blues Project 8 (Q74), each record seeded
 * with its matched text as production holds it (test/fixtures/sheet-four-known-errors.json, read 24 Nov) under its own
 * artist and title, the ask answered by the test with a reason naming that sentence, the sheet opened from the reason. At
 * 1440 × 900 and 390 × 844, to docs/captures/correcting-sheet/. Seeded records, real texts; covers are absent. Run with
 * CAPTURE=1 --project=capture.
 */
registerCleanup();

type Four = { prefix: string; artist: string; title: string; text: string; wrongSentence: number };
const FOUR = JSON.parse(readFileSync('test/fixtures/sheet-four-known-errors.json', 'utf8')) as Four[];
const OUT = join('docs', 'captures', 'correcting-sheet');
/* At the reason's bound, 188 characters, as the step asks the head captured: not at 91 to 108 alone. */
const REASON = 'Slow and warm, with a full band and strings, released 1981, the sort of record that fills an evening without asking for attention, and the reason the ask gave for it, at its length.Slow a.';

for (const record of FOUR) {
  test(`${record.artist}, ${record.title}: sentence ${record.wrongSentence} open, at 1440 × 900 and 390 × 844`, async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    await login(page);
    mkdirSync(OUT, { recursive: true });
    const db = getTestDb();
    const artist = (await (await page.request.post('/api/artists', { data: { name: `${record.artist} ${Date.now().toString(36)}` } })).json()) as { id: string };
    trackArtist(artist.id);
    const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title) VALUES (${artist.id}::uuid, ${record.title}) RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at) VALUES (${row.id}::uuid, ${record.text}, 'production', now())`);
    const wrong = sentencesOf(record.text)[record.wrongSentence - 1];
    try {
      await page.route('**/api/ask', (route) => route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: [{ recordId: row.id, reason: REASON, claims: [wrong] }], from: 'phrase', askedFrom: null, unanswerable: false } }));
      for (const [width, height] of [[1440, 900], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(`/?view=grid&artistId=${artist.id}`);
        await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        const control = page.locator('[data-pick-control]').filter({ visible: true });
        await control.locator('[data-ask-field]').fill('something');
        await control.getByRole('button', { name: /^ask$/i }).click();
        await page.locator('[data-pick-answer] [data-open-sheet]').filter({ visible: true }).first().click();
        await expect(page.locator('[data-correcting-sheet] [data-sheet-open]')).toHaveValue(wrong, { timeout: 30_000 });
        await page.screenshot({ path: join(OUT, `${record.prefix}-${width}x${height}-sentence-${record.wrongSentence}-open.png`) });
        await page.keyboard.press('Escape');
      }
    } finally {
      await removeRecordsFor(artist.id);
    }
  });
}
