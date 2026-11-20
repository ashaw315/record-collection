import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { clickSpine } from './wall-ready';
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

/** Settled out: the gesture landed with one record out, which is its id. */
async function settledOut(page: Page): Promise<string> {
  await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
  await expect.poll(() => page.locator('[data-pulled]').count(), { timeout: 30_000 }).toBe(1);
  return (await page.locator('[data-pulled]').getAttribute('data-pulled')) ?? '';
}
const panelReason = (page: Page) => page.locator('[data-testid="record-panel"] [data-testid="panel-reason"]');

test('on the shelf, the pulled record’s facts carry the ask’s reason, the walk carries the next, and a spine pull carries none', async ({ page }) => {
  test.setTimeout(120_000);
  const { artistId, records } = await fixture(page, 3);
  try {
    await stubAnswers(page, records);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await ask(page);
    expect(await settledOut(page), 'the first answer is pulled').toBe(records[0].id);
    await expect(panelReason(page), 'its reason stands in the pulled record’s facts').toHaveText(REASONS[0]);
    /* The walk: the next answer of the same reply, pulled with no request, carries its own reason. */
    await control(page).getByRole('button', { name: /^ask$/i }).click();
    await expect.poll(() => settledOut(page), { timeout: 30_000 }).toBe(records[1].id);
    await expect(panelReason(page)).toHaveText(REASONS[1]);
    /* Put back, then a spine pull: a record the reader pulled has no reason to show. */
    await page.getByTestId('action-put').click();
    await expect.poll(() => page.locator('[data-pulled]').count(), { timeout: 30_000 }).toBe(0);
    await clickSpine(page, page.locator(`a[data-seat="${records[2].id}"] [data-spine]`));
    expect(await settledOut(page)).toBe(records[2].id);
    await expect(page.getByTestId('record-panel')).toBeVisible();
    await expect(panelReason(page), 'a spine pull carries no reason').toHaveCount(0);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/*
  §P.2: "The nothing-fits answer is the message that nothing fits; a record beside it is a consolation, drawn only where
  one is close in feel, labelled as the closest available, and never required." A requirement unmet is the same one
  record, its reason naming the requirement. The run's end says that was all that fit and names none.
*/
const CONSOLATION = 'Slow and warm, though sung throughout where no vocals were asked for; the closest in feel.';
const standIn = (verdict: 'nothing-fits' | 'requirement-unmet', records: Row[]) => ({ mode: 'pick', verdict, answers: records.map((r) => ({ recordId: r.id, reason: CONSOLATION, claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false });
const consolations = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('[data-pick-answer]')).filter((el) => (el as HTMLElement).getClientRects().length > 0).map((cell) => ({ label: cell.querySelector('[data-grid-consolation]')?.textContent ?? null, reason: cell.querySelector('[data-grid-reason]')?.textContent ?? null })));

test('in the grid, a stand-in is drawn labelled "Closest available" beside the message, none is drawn where none was given, and the run’s end says that was all that fits', async ({ page }) => {
  const { artistId, records } = await fixture(page, 2);
  try {
    let reply: Record<string, unknown> = standIn('nothing-fits', records.slice(0, 1));
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?view=grid&artistId=${artistId}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
    const slot = control(page).locator('[data-pick-slot]');
    const press = () => control(page).getByRole('button', { name: /^ask$/i }).click();
    await ask(page);
    await expect(slot, 'the message is the answer').toHaveText('Nothing fits.');
    await expect.poll(() => consolations(page), { timeout: 30_000 }).toEqual([{ label: 'Closest available', reason: CONSOLATION }]);
    reply = standIn('requirement-unmet', records.slice(1, 2));
    await press();
    await expect.poll(() => consolations(page), { timeout: 30_000, message: 'a requirement unmet: the same one labelled record, its reason naming the requirement' }).toEqual([{ label: 'Closest available', reason: CONSOLATION }]);
    /* §P.2 (Design, 19 Nov): the requirement-unmet slot has its own words, above its stand-in; until then it read "Nothing fits.", 3a's "same words for both", withdrawn with the ruling. */
    await expect(slot).toHaveText('None has all of it.');
    expect(await slot.evaluate((el) => el.getBoundingClientRect().bottom), 'drawn above its stand-in').toBeLessThanOrEqual(await page.locator('[data-pick-answer]').filter({ visible: true }).first().evaluate((el) => el.getBoundingClientRect().top));
    reply = standIn('nothing-fits', []);
    await press();
    await expect(slot).toHaveText('Nothing fits.');
    await expect.poll(() => consolations(page), { timeout: 30_000, message: 'never required: none drawn where none was given' }).toEqual([]);
    reply = { mode: 'pick', verdict: 'run-exhausted', answers: [], from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false };
    await press();
    await expect(slot).toHaveText('That’s all that fits.');
    expect(await consolations(page), 'the run’s end names none').toEqual([]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/*
  Adam's phone (19 Nov, the coordinator's check): a requirement unmet on production drew the Closest available card and
  its reason, and he reported no slot message above it. The slot's words shipped the same evening (9dae803d). This is
  that scene at 390 × 844, the far view's band host: the message stands in the slot, above the stand-in's cell, drawn.
  Fails against a slot that is empty or cleared after the stand-in draws, and against one drawn beneath the cell.
*/
test('on the phone at 390 × 844, a requirement unmet draws "None has all of it." in the slot above its stand-in', async ({ page }) => {
  const { artistId, records } = await fixture(page, 2);
  try {
    await page.route('**/api/ask', (route) => route.fulfill({ json: standIn('requirement-unmet', records.slice(0, 1)) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await ask(page);
    const slot = control(page).locator('[data-pick-slot]');
    await expect(slot).toHaveText('None has all of it.');
    await expect.poll(() => consolations(page), { timeout: 30_000 }).toEqual([{ label: 'Closest available', reason: CONSOLATION }]);
    const drawn = await slot.evaluate((el) => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, height: r.height, visible: el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0' }; });
    expect(drawn.visible, 'the slot is drawn, not hidden').toBe(true);
    expect(drawn.height, 'one line, not collapsed').toBeGreaterThan(10);
    const cellTop = await page.locator('[data-pick-answer]').filter({ visible: true }).first().evaluate((el) => el.getBoundingClientRect().top);
    expect(drawn.bottom, 'above its stand-in').toBeLessThanOrEqual(cellTop);
    await expect(slot, 'and still there once the stand-in has drawn').toHaveText('None has all of it.');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('on the shelf, a stand-in is pulled, with the message in the slot and the label and reason in its facts', async ({ page }) => {
  const { artistId, records } = await fixture(page, 2);
  try {
    await page.route('**/api/ask', (route) => route.fulfill({ json: standIn('nothing-fits', records.slice(0, 1)) }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await ask(page);
    expect(await settledOut(page), 'the stand-in is the pull').toBe(records[0].id);
    await expect(control(page).locator('[data-pick-slot]')).toHaveText('Nothing fits.');
    await expect(page.locator('[data-testid="record-panel"] [data-testid="panel-consolation"]')).toHaveText('Closest available');
    await expect(panelReason(page)).toHaveText(CONSOLATION);
  } finally {
    await removeRecordsFor(artistId);
  }
});

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
