import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { getTestDb } from '../test/helpers/db';

/**
 * Step 157b, target §P.2: "The moods toggle, and a separate ASK asks."
 * "The ask leans; it does not filter": the pick is drawn from the records
 * carrying the most of the selected moods, and one carrying none is never
 * drawn. "The same record is not served twice in a row while another
 * remains." Nothing goes to the address, and a navigation clears the moods
 * and the answer. §P.5: ASK is inert while no mood is selected.
 *
 * Each test seeds its own artist and tags its records straight into the
 * database (`record_moods` is the tagging script's to write; there is no
 * route), so the pool and every record's set are known.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

type Fixture = { artistId: string; byTitle: Map<string, string>; sets: Map<string, string[]> };

/** Four records where no record carries all of sleepy, smooth, sunny and dancing, and only one carries three of them. */
const SETS: Record<string, string[]> = {
  A: ['sleepy'],
  B: ['sleepy', 'smooth'],
  C: ['dancing', 'sunny', 'loud and dirty'],
  D: ['sleepy', 'smooth', 'sunny'],
};
const FOUR = ['sleepy', 'smooth', 'sunny', 'dancing'];

async function fixture(page: Page): Promise<Fixture> {
  const suffix = `pm157${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Moods-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  for (const key of Object.keys(SETS)) await seedRecords(artist.id, `Mood ${key}`, suffix, 1);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string; title: string }> };
  const byTitle = new Map(listed.data.map((row) => [row.title.slice(5, 6), row.id]));
  const db = getTestDb();
  const sets = new Map<string, string[]>();
  for (const [key, moods] of Object.entries(SETS)) {
    const id = byTitle.get(key);
    if (id === undefined) throw new Error(`no record ${key}`);
    await db.execute(sql`INSERT INTO record_moods (record_id, moods, tagged_at, tagged_by_model) VALUES (${id}, ARRAY[${sql.join(moods.map((m) => sql`${m}`), sql`, `)}]::text[], now(), 'test')`);
    sets.set(id, moods);
  }
  return { artistId: artist.id, byTitle, sets };
}

async function openGrid(page: Page, artistId: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?view=grid&artistId=${artistId}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
}
const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const mood = (page: Page, name: string) => control(page).locator(`button[data-mood="${name}"]`);
const ask = (page: Page) => control(page).getByRole('button', { name: /^ask$/i });
const surprise = (page: Page) => control(page).getByRole('button', { name: /surprise me/i });
const cellTitle = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const cells = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn);
    return cells.length === 0 ? null : (cells[0].querySelector('[data-grid-title]')?.textContent ?? '');
  });
const key = (title: string | null) => (title === null ? null : title.slice(5, 6));

test('ASK is inert with no mood selected; a mood press toggles it and asks nothing; ASK then answers', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId);
    await expect(ask(page)).toBeDisabled();
    await mood(page, 'sleepy').click();
    await expect(mood(page, 'sleepy')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    expect(await cellTitle(page), 'a mood asks nothing').toBeNull();
    await expect(ask(page)).toBeEnabled();
    await mood(page, 'sleepy').click();
    await expect(mood(page, 'sleepy')).toHaveAttribute('aria-pressed', 'false');
    await expect(ask(page), 'inert again with none selected').toBeDisabled();
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('the ask leans: four moods return a record where requiring all four returns none, and it is the one carrying the most', async ({ page }) => {
  const { artistId } = await fixture(page);
  expect(Object.values(SETS).filter((set) => FOUR.every((m) => set.includes(m))), 'the precondition: no record carries all four').toEqual([]);
  try {
    await openGrid(page, artistId);
    for (const m of FOUR) await mood(page, m).click();
    await ask(page).click();
    await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
    expect(key(await cellTitle(page)), 'D carries three of the four; nothing else carries more than two').toBe('D');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a one-record tier re-serves it, the cell does not change, and the slot says "The only one."', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId);
    await mood(page, 'dancing').click();
    await ask(page).click();
    await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
    expect(key(await cellTitle(page)), 'only C carries dancing').toBe('C');
    await expect(control(page).locator('[data-pick-slot]')).toHaveText('');
    await ask(page).click();
    await expect(control(page).locator('[data-pick-slot]')).toHaveText('The only one.');
    expect(key(await cellTitle(page))).toBe('C');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a record carrying none of the selected moods is never drawn: a mood nothing carries answers nothing', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId);
    await mood(page, 'jacked up').click();
    await ask(page).click();
    await page.waitForTimeout(500);
    expect(await cellTitle(page)).toBeNull();
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('SURPRISE ME ignores the moods and leaves them selected, under the same last-served rule', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId);
    await mood(page, 'dancing').click();
    /* The draw pinned to the pool's first record, which carries no dancing: a surprise that honoured the moods could not serve it. */
    await page.evaluate(() => { Math.random = () => 0; });
    await surprise(page).click();
    await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
    expect(key(await cellTitle(page))).not.toBe('C');
    await expect(mood(page, 'dancing')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('nothing goes to the address, and a navigation clears the moods and the answer', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId);
    const before = page.url();
    await mood(page, 'sleepy').click();
    await ask(page).click();
    await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
    expect(page.url(), 'the address is untouched by a mood and an ask').toBe(before);
    await page.locator('[data-collection-band]').filter({ visible: true }).getByRole('link', { name: /^table$/i }).click();
    await expect(page).toHaveURL(/view=table/);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
    await expect(mood(page, 'sleepy')).toHaveAttribute('aria-pressed', 'false');
    expect(await cellTitle(page), 'the table starts with no answer').toBeNull();
    await expect(ask(page)).toBeDisabled();
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('on the near view the ask’s answer is the pull, from the tier: the record pulled carries the selected mood', async ({ page }) => {
  const { artistId, byTitle } = await fixture(page);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await mood(page, 'dancing').click();
    await ask(page).click();
    await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
    expect(await page.locator('[data-pulled]').getAttribute('data-pulled'), 'C is the only record carrying dancing').toBe(byTitle.get('C'));
    expect(await cellTitle(page), 'no cell on the near view').toBeNull();
  } finally {
    await removeRecordsFor(artistId);
  }
});
