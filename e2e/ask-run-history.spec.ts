import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { getTestDb } from '../test/helpers/db';
import { aboutHash } from '../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../src/lib/openai/embeddings';
import { stubEmbedding } from '../src/lib/openai/stub-embedding';

/**
 * **Step 3, unit 2b: the run's shown set (Design's "a run leaves out its history", §P.2; the coordinator, 14 Nov).**
 * A run is asks with the same phrase. Every record the run displays joins its named set, by ASK, SURPRISE ME or a pull,
 * and each ask leaves the whole set out while enough others remain; the set clears when the phrase changes, on a
 * navigation, and when the run starts again. The cases below on the real route rank by stub vectors; the cases on the
 * model pick stub /api/ask's reply, since the pick's latch is the whole collection's and a test database shared by every
 * spec is no place to throw it.
 *
 * **A phrase change starts a new run: what the last phrase was answered with is not left out of the next phrase's
 * answer (the coordinator, 13 Nov, settling two of Adam's six production asks that came back past rank 1).** The
 * test asks B on a fresh page, then on another page asks A, changes the field to B and asks again; B's answer must be
 * the same both times. Fails while the control keeps its last answer across an edit of the field
 * (`PickControl.tsx`, `lastAnswer`, set by `show` and read by `ask`, untouched by `setPhrase`).
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const ABOUTS = [
  'A late night jazz record, warm and slow.',
  'Jazz for a late night, horns low.',
  'Late night jazz, a quartet at ease.',
  'Night jazz from a small club, late.',
  'A jazz record for late at night.',
  'Loud fast hardcore punk from the first wave.',
  'Punk, loud and fast, pressed thin.',
  'Fast loud punk singles.',
  'Hardcore punk, fast and loud.',
  'Loud punk, fast songs.',
];
const A = 'late night jazz';
const B = 'late night jazz records';

async function fixture(page: Page, count = ABOUTS.length): Promise<string> {
  const suffix = `arh${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Run-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Run', suffix, count);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
  const db = getTestDb();
  for (const [i, row] of listed.data.entries()) {
    const about = ABOUTS[i];
    await db.execute(sql`UPDATE records SET snippet = ${about} WHERE id = ${row.id}::uuid`);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  return artist.id;
}

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const askFor = async (page: Page, phrase: string) => {
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/ask'));
  await control(page).locator('[data-ask-field]').fill(phrase);
  await control(page).getByRole('button', { name: /^ask$/i }).click();
  await answered;
};

test('in the grid (five answers), B asked after A is answered as B asked fresh', async ({ page }) => {
  const artistId = await fixture(page);
  const cells = async () => {
    await page.locator('[data-pick-answer]').first().waitFor();
    return page.locator('[data-pick-answer] a[href^="/records/"]').evaluateAll((as) => as.filter((a) => (a as HTMLElement).getClientRects().length > 0).map((a) => a.getAttribute('href')));
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const open = async () => { await page.goto(`/?view=grid&artistId=${artistId}`); await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 }); };
    await open();
    await askFor(page, B);
    const fresh = await cells();
    await open();
    await askFor(page, A);
    const afterA = await cells();
    await askFor(page, B);
    await expect.poll(cells, { message: `B fresh ${fresh.join(' ')}; A ${afterA.join(' ')}` }).toEqual(fresh);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/*
  The shelf's "B after A" case was deleted on 15 Nov (the coordinator): it passed against the control before 2b, which
  carried the last answer across a phrase change, and passed again with 2b's clearing staged out, so it could not fail.
  The clearing is one rule for every host (the control's ask), and the grid's case above pins it, failing when it is
  removed. Why the shelf never showed the carry-over was not explained; it is recorded in NOTES, not guarded here.
*/

const pulled = (page: Page) => page.locator('[data-pulled]').getAttribute('data-pulled', { timeout: 30_000 });
/* A press while the wall moves does nothing (§P.3), so each press waits for the last pull to land, as pick-ask-178's re-ask does. */
const landed = (page: Page) => expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
const openShelf = async (page: Page, artistId: string) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); };
const openGrid = async (page: Page, artistId: string) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/?view=grid&artistId=${artistId}`); await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 }); };
const cells = (page: Page) => page.locator('[data-pick-answer] a[href^="/records/"]').evaluateAll((as) => as.filter((a) => (a as HTMLElement).getClientRects().length > 0).map((a) => a.getAttribute('href') ?? ''));
const slotText = (page: Page) => control(page).locator('[data-pick-slot]');

test('on the shelf, five presses of one phrase pull five different records, and a sixth on a pool of five starts again at the first', async ({ page }) => {
  test.setTimeout(120_000);
  const artistId = await fixture(page, 5);
  try {
    await openShelf(page, artistId);
    const seen: string[] = [];
    for (let press = 0; press < 6; press += 1) {
      await askFor(page, A);
      await expect.poll(() => pulled(page), { timeout: 30_000 }).not.toBe(seen.at(-1) ?? null);
      await landed(page);
      seen.push((await pulled(page)) ?? '');
    }
    expect(new Set(seen.slice(0, 5)).size, `five different: ${seen.join(' ')}`).toBe(5);
    expect(seen[5], 'the sixth, the pool spent, starts the run again at the first').toBe(seen[0]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('in the grid, a second press of one phrase draws five covers none of the first five', async ({ page }) => {
  const artistId = await fixture(page);
  try {
    await openGrid(page, artistId);
    await askFor(page, A);
    await expect.poll(async () => (await cells(page)).length).toBe(5);
    const first = await cells(page);
    await askFor(page, A);
    await expect.poll(async () => (await cells(page)).join(' ')).not.toBe(first.join(' '));
    const second = await cells(page);
    expect(second.filter((h) => first.includes(h)), `first ${first.join(' ')}; second ${second.join(' ')}`).toEqual([]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/* The model pick's replies, stubbed: what the control does with them, never what the model would answer. */
test.describe('the control with the model pick’s replies (stubbed /api/ask)', () => {
  const ids = async (page: Page, artistId: string) =>
    [...((await (await page.request.get(`/api/records?artistId=${artistId}&pageSize=100`)).json()) as { data: Array<{ id: string; title: string }> }).data].sort((x, y) => x.title.localeCompare(y.title));

  test('on the shelf, one reply of three is walked one per press with no request, then asked again with all three named', async ({ page }) => {
    test.setTimeout(120_000);
    const artistId = await fixture(page, 6);
    try {
      const records = await ids(page, artistId);
      const bodies: Array<{ exclude?: string[] }> = [];
      await page.route('**/api/ask', async (route) => {
        bodies.push(route.request().postDataJSON() as { exclude?: string[] });
        const answers = bodies.length === 1 ? records.slice(0, 3) : records.slice(3, 4);
        await route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: answers.map((r) => ({ recordId: r.id, reason: 'r', claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false } });
      });
      await openShelf(page, artistId);
      for (let press = 0; press < 3; press += 1) {
        if (press === 0) await askFor(page, A);
        else await control(page).getByRole('button', { name: /^ask$/i }).click();
        await expect.poll(() => pulled(page), { timeout: 30_000 }).toBe(records[press].id);
        await landed(page);
      }
      expect(bodies, 'three presses, one request').toHaveLength(1);
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      await expect.poll(() => bodies.length).toBe(2);
      expect([...(bodies[1].exclude ?? [])].sort(), 'the batch walked, all three named').toEqual(records.slice(0, 3).map((r) => r.id).sort());
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  test('says nothing fits, that the run has ended, and names a title not described yet beside its answer', async ({ page }) => {
    const artistId = await fixture(page, 3);
    try {
      const records = await ids(page, artistId);
      let reply: Record<string, unknown> = {};
      await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
      await openGrid(page, artistId);
      reply = { mode: 'pick', verdict: 'nothing-fits', answers: [], from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false };
      await control(page).locator('[data-ask-field]').fill('loud');
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      await expect(slotText(page)).toHaveText('Nothing fits.');
      reply = { mode: 'pick', verdict: 'run-exhausted', answers: [], from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false };
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      /* §P.2 (unit 3a): the run's end keeps "fit" or its sense; "That was all." read as the whole shelf seen. */
      await expect(slotText(page)).toHaveText('That’s all that fits.');
      reply = { mode: 'pick', verdict: 'answer', answers: [{ recordId: records[0].id, reason: 'r', claims: ['c'] }], from: 'phrase', askedFrom: null, undescribed: records[1].id, unanswerable: false };
      await control(page).locator('[data-ask-field]').fill(records[1].title);
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      await expect(slotText(page)).toHaveText(`${records[1].title}: not described yet.`);
      await expect.poll(async () => (await cells(page)).length, { message: 'its answer drawn beside the message' }).toBe(1);
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  test('ignores a reply to a phrase since changed, and takes no second press while a request is in flight (interim)', async ({ page }) => {
    const artistId = await fixture(page, 3);
    try {
      const records = await ids(page, artistId);
      let calls = 0;
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route('**/api/ask', async (route) => {
        calls += 1;
        await held;
        await route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: [{ recordId: records[0].id, reason: 'r', claims: ['c'] }], from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false } });
      });
      await openGrid(page, artistId);
      await control(page).locator('[data-ask-field]').fill(A);
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      expect(calls, 'the second press, the first in flight, sends nothing').toBe(1);
      await control(page).locator('[data-ask-field]').fill(B);
      release();
      await page.waitForTimeout(500);
      expect(await cells(page), 'the reply to A, landing under B, draws nothing').toEqual([]);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});
