import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { getTestDb } from '../test/helpers/db';

/**
 * **§67's correcting sheet, opened from an answer's reason (step 3, the sheet's second commit, 24 Nov).** The ask's
 * route is answered by the test with a reason and the stored sentence it rests on; the record's matched text is seeded.
 * Pressing the reason opens the sheet over the ask with the reason as its head and that sentence open; editing it and
 * saving writes the whole text with only that sentence changed, through §5.2's PATCH, which marks it read; Clear asks
 * first and returns the generated text; a close with a change unsaved asks first; on the shelf a save discards the queue.
 * Fails against a reason that opens nothing, a sheet that opens no sentence or the wrong one, a save that rewrites more
 * than the sentence, a clear or close that does not ask, and a queue walked after a correction.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const TEXT = 'Taped for Vol. 2 in 2019 and shelved. Side one is slow and warm, a quartet at ease. Side two is louder.';
const CLAIM = 'Side one is slow and warm, a quartet at ease.';
const REASON = 'Slow and warm, for a grey afternoon.';

async function seeded(page: Page, count = 3): Promise<{ artistId: string; ids: string[] }> {
  const suffix = `cs${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Sheet-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Sheet', suffix, count);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=10`)).json()) as { data: Array<{ id: string }> };
  const ids = listed.data.map((r) => r.id);
  const db = getTestDb();
  for (const id of ids) await db.execute(sql`INSERT INTO record_matched_text (record_id, generated, generated_model, generated_at) VALUES (${id}::uuid, ${TEXT}, 'test', now())`);
  return { artistId: artist.id, ids };
}
const stored = async (id: string) => (await getTestDb().execute<{ generated: string | null; edited: string | null; reviewed: boolean }>(sql`SELECT generated, edited, reviewed_at IS NOT NULL AS reviewed FROM record_matched_text WHERE record_id = ${id}::uuid`)).rows[0];
async function answerWith(page: Page, ids: string[], calls: { n: number } = { n: 0 }) {
  await page.route('**/api/ask', (route) => {
    calls.n += 1;
    return route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: ids.map((recordId) => ({ recordId, reason: REASON, claims: [CLAIM] })), from: 'phrase', askedFrom: null, unanswerable: false } });
  });
}
const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const sheet = (page: Page) => page.locator('[data-correcting-sheet]');
/* The sheet opens at once and its text arrives with the route's answer, which a cold dev server compiles on its first call. */
const loaded = (page: Page) => expect(sheet(page).locator('[data-sheet-sentence]').first()).toBeVisible({ timeout: 30_000 });
async function ask(page: Page) {
  await control(page).locator('[data-ask-field]').fill('something warm');
  await control(page).getByRole('button', { name: /^ask$/i }).click();
}
async function openGrid(page: Page, artistId: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=grid&artistId=${artistId}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
  /* The dev server's floating badge sits over the sheet's foot, where Save is; the other specs hide it the same way. */
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

test('the grid at 1440: the reason opens the sheet, headed by the reason, the sentence it rests on open; saving one corrected sentence writes the whole text with only that sentence changed, and marks it read', async ({ page }) => {
  const { artistId, ids } = await seeded(page, 1);
  try {
    await answerWith(page, ids);
    await openGrid(page, artistId, 1440);
    await ask(page);
    await control(page).locator('[data-open-sheet]').first().click();
    await expect(sheet(page)).toBeVisible();
    await loaded(page);
    await expect(sheet(page).locator('[data-sheet-reason]')).toHaveText(REASON);
    await expect(sheet(page).locator('[data-sheet-open]'), 'the sentence the reason rests on, open').toHaveValue(CLAIM);
    await expect(sheet(page).locator('[data-sheet-sentence]'), 'set out a sentence at a time, "Vol. 2" not a break').toHaveCount(3);
    await expect(sheet(page).locator('[data-sheet-clear]'), 'Clear only where an edit exists').toHaveCount(0);
    await sheet(page).locator('[data-sheet-open]').fill('Side one is slow and warm, a trio at ease.');
    await sheet(page).locator('[data-sheet-save]').click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await stored(ids[0])).toEqual({ generated: TEXT, edited: 'Taped for Vol. 2 in 2019 and shelved. Side one is slow and warm, a trio at ease. Side two is louder.', reviewed: true });
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('Clear is drawn where an edit exists, asks first, and returns the generated text; a close with a change unsaved asks first and keeps editing on no', async ({ page }) => {
  const { artistId, ids } = await seeded(page, 1);
  try {
    await getTestDb().execute(sql`UPDATE record_matched_text SET edited = 'An edit. Of two sentences.', edited_at = now() WHERE record_id = ${ids[0]}::uuid`);
    await answerWith(page, ids);
    await openGrid(page, artistId, 1440);
    await ask(page);
    await control(page).locator('[data-open-sheet]').first().click();
    await loaded(page);
    await expect(sheet(page).locator('[data-sheet-open]'), 'no sentence of the edit is named, so none opens').toHaveCount(0);
    await sheet(page).locator('[data-sheet-sentence-button]').first().click();
    await sheet(page).locator('[data-sheet-open]').fill('An edit changed.');
    await sheet(page).locator('[data-sheet-close]').click();
    await expect(sheet(page).locator('[data-sheet-asking]')).toContainText('Close without saving?');
    await sheet(page).locator('[data-sheet-answer="no"]').click();
    await expect(sheet(page).locator('[data-sheet-open]'), 'still editing').toHaveValue('An edit changed.');
    await sheet(page).locator('[data-sheet-clear]').click();
    await expect(sheet(page).locator('[data-sheet-asking]')).toContainText('Clear the edit and return to the generated text?');
    await sheet(page).locator('[data-sheet-answer="yes"]').click();
    await expect.poll(async () => (await stored(ids[0])).edited).toBeNull();
    await expect(sheet(page).locator('[data-sheet-sentence]'), 'the generated text, back').toHaveCount(3);
    await expect(sheet(page).locator('[data-sheet-open]'), 'and its named sentence open').toHaveValue(CLAIM);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('the band at 390: the reason opens the sheet there too', async ({ page }) => {
  const { artistId, ids } = await seeded(page, 1);
  try {
    await answerWith(page, ids);
    await openGrid(page, artistId, 390, 844);
    await ask(page);
    await page.locator('[data-pick-answer] [data-open-sheet]').filter({ visible: true }).first().click();
    await expect(sheet(page)).toBeVisible();
    await loaded(page);
    await expect(sheet(page).locator('[data-sheet-open]')).toHaveValue(CLAIM);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('the shelf at 1440: the pulled record’s reason opens the sheet, and a save discards the queue so the next press asks again', async ({ page }) => {
  const { artistId, ids } = await seeded(page, 3);
  try {
    const calls = { n: 0 };
    await answerWith(page, ids, calls);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await control(page).waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(800);
    await ask(page);
    const reason = page.locator('[data-testid="panel-reason"] [data-open-sheet]').filter({ visible: true });
    await reason.waitFor({ timeout: 20_000 });
    expect(calls.n).toBe(1);
    await reason.click();
    await loaded(page);
    await sheet(page).locator('[data-sheet-open]').fill('Side one is slow and warm, a trio at ease.');
    await sheet(page).locator('[data-sheet-save]').click();
    await expect(sheet(page)).toHaveCount(0);
    /* Without the save the next press walks the queue with no request; after it, the queue is gone and the press asks. */
    await control(page).getByRole('button', { name: /^ask$/i }).click();
    await expect.poll(() => calls.n, { message: 'the queue was discarded: the press asked again' }).toBe(2);
  } finally {
    await removeRecordsFor(artistId);
  }
});
