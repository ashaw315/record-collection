import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../src/app/wall/view-fork';

/**
 * **Step 3, unit 3a: every answer carries its reason (the Mood Pick target §P.2; the coordinator, 17 Nov).** "Every
 * answer of the ask carries its reason: one sentence, in the reader's terms of sound and occasion, saying why this
 * record answers the phrase ... in the table and the grid beneath each cover's caption." On the far view the answer is
 * the same cell (§P.4), in the band beneath the control and in the column host in the count column, so the reason is
 * drawn there too. The replies are stubbed: the pick's latch is the whole collection's, and this holds what the control
 * does with a reason, never what the model would write.
 *
 * Fails against a control that reads `recordId` alone from an answer (PickControl.tsx, `AskAnswer`) and a cell that
 * draws no reason (GridCell.tsx).
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

/* One sentence each, at the length the drafts run to (the 55's reasons are the model's; these are the test's). */
const REASONS = [
  'Slow and spacious with abrasive peaks, for a late room that wants attention rather than company.',
  'Brisk acoustic songs played close, light enough to sit under conversation on a bright morning.',
  'A long side of one quiet mood, hiss and bare guitar, that rewards a dark room and a still listener.',
  'Dense horn charts at a dance tempo, loud from the first bar, for a room that wants waking up.',
  'Crooned ballads over strings that stay soft all the way through, for the end of an evening.',
];

type Row = { id: string; title: string };
async function fixture(page: Page, count = REASONS.length): Promise<{ artistId: string; records: Row[] }> {
  const suffix = `rsn${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Reason-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Reason', suffix, count);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Row[] };
  return { artistId: artist.id, records: [...listed.data].sort((x, y) => x.title.localeCompare(y.title)) };
}

/** The stub: every record answered, each with its own reason, in the fixture's order. */
async function stubAnswers(page: Page, records: Row[]) {
  await page.route('**/api/ask', (route) =>
    route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: records.map((r, i) => ({ recordId: r.id, reason: REASONS[i], claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false } }),
  );
}

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const ask = async (page: Page) => {
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/ask'));
  await control(page).locator('[data-ask-field]').fill('something for tonight');
  await control(page).getByRole('button', { name: /^ask$/i }).click();
  await answered;
};

/** Each drawn answer: its record, its reason's text, and where the reason stands against the caption and the cell. */
const drawnReasons = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    return Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn).map((cell) => {
      const artist = cell.querySelector('[data-grid-artist]');
      const reason = cell.querySelector('[data-grid-reason]') as HTMLElement | null;
      const href = cell.querySelector('a[href^="/records/"]')?.getAttribute('href') ?? '';
      const c = cell.getBoundingClientRect();
      const a = artist?.getBoundingClientRect();
      const r = reason?.getBoundingClientRect();
      return {
        id: href.replace('/records/', ''),
        reason: reason?.textContent ?? null,
        belowCaption: a !== undefined && r !== undefined && r.top >= a.bottom,
        insideCell: r !== undefined && r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && (reason?.scrollWidth ?? 0) <= (reason?.clientWidth ?? 0),
        cellWidth: c.width,
      };
    });
  });

async function expectReasons(page: Page, records: Row[], count: number) {
  await expect.poll(async () => (await drawnReasons(page)).length, { timeout: 30_000 }).toBe(count);
  const cells = await drawnReasons(page);
  for (const cell of cells) {
    const at = records.findIndex((r) => r.id === cell.id);
    expect(at, `the cell is one of the answers`).toBeGreaterThan(-1);
    expect(cell.reason, 'the reason the reply gave for this record, whole').toBe(REASONS[at]);
    expect(cell.belowCaption, 'beneath the caption: below the artist').toBe(true);
    expect(cell.insideCell, 'wrapped inside the cell, §T.5’s 160, never run past it').toBe(true);
    expect(cell.cellWidth, '§T.5’s 160').toBeCloseTo(160, 0);
  }
}

test('in the grid, each of the five answers carries its own reason beneath its caption', async ({ page }) => {
  const { artistId, records } = await fixture(page);
  try {
    await stubAnswers(page, records);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?view=grid&artistId=${artistId}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
    expect(await page.locator('[data-grid-reason]').count(), 'the grid’s own cells carry no reason').toBe(0);
    await ask(page);
    await expectReasons(page, records, 5);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('in the table, the sidebar’s answers carry their reasons', async ({ page }) => {
  const { artistId, records } = await fixture(page);
  try {
    await stubAnswers(page, records);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?view=table&artistId=${artistId}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
    await ask(page);
    await expectReasons(page, records, 5);
  } finally {
    await removeRecordsFor(artistId);
  }
});

for (const width of [shelfOfferedMinWidth(), nearViewMinWidth() - 1]) {
  test(`on the far view at ${width}×900, the band host’s cells carry their reasons`, async ({ page }) => {
    const { artistId, records } = await fixture(page);
    try {
      await stubAnswers(page, records);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?artistId=${artistId}`);
      await wallMeasured(page);
      await ask(page);
      await expectReasons(page, records, 5);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
}

test('on the far view at 1440×900, the column host’s cell in the count column carries its reason', async ({ page }) => {
  const { artistId, records } = await fixture(page);
  try {
    await stubAnswers(page, records);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?wall=far&artistId=${artistId}`);
    await wallMeasured(page);
    await ask(page);
    /* The column host draws the first answer today; its five are unit 3b's. */
    await expect.poll(async () => (await drawnReasons(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const inColumn = await page.evaluate(() => {
      const count = Array.from(document.querySelectorAll('[data-region="count-far"]')).find((el) => (el as HTMLElement).getClientRects().length > 0) ?? null;
      const cell = count?.querySelector('[data-pick-answer]') ?? null;
      return { cellInColumn: cell !== null, reason: cell?.querySelector('[data-grid-reason]')?.textContent ?? null };
    });
    expect(inColumn.cellInColumn, 'the cell stands in the count column').toBe(true);
    expect(inColumn.reason, 'the first answer’s reason, whole').toBe(REASONS[0]);
    await expectReasons(page, records, (await drawnReasons(page)).length);
  } finally {
    await removeRecordsFor(artistId);
  }
});
