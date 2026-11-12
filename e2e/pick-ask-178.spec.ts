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
import { nearViewMinWidth } from '../src/app/wall/view-fork';

/**
 * **Step 178, Q22's control (§P.2, §P.4, §P.5, §P.6; Design's "Ask field" and "the rest of the moods", 10 and 11
 * Nov).** "The reader writes what they want in the ask field, a phrase for a feeling or an occasion, and a separate
 * ASK asks." The ask ranks the pool by nearness of each ABOUT's stored vector to the phrase's and answers with the
 * nearest three to five; a re-ask leaves out the last answer's records while enough remain; a title asks from that
 * record and leaves it out; a pool with no ABOUT is unanswerable, and the slot says so. On the table, the grid and
 * the far view the covers draw in rank order beneath the control; on the shelf the first answer is pulled.
 *
 * Each test seeds its own artist, writes the records' ABOUTs and their stored vectors straight into the database
 * (the embedding script's job in production), with the test environment's stub model (`stubEmbedding`, a bag of
 * words), which the e2e server also answers the phrase with (`OPENAI_BASE_URL`), so which records are nearest is
 * known by construction. Each test fails against the control before this step, which drew the moods and no field.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

/** Ten records with an ABOUT: five about jazz at night, five about punk, and one with none. */
const ABOUTS: Record<string, string | null> = {
  J1: 'A late night jazz record, warm and slow.',
  J2: 'Jazz for a late night, horns low.',
  J3: 'Late night jazz, a quartet at ease.',
  J4: 'Night jazz from a small club, late.',
  J5: 'A jazz record for late at night.',
  P1: 'Loud fast hardcore punk from the first wave.',
  P2: 'Punk, loud and fast, pressed thin.',
  P3: 'Fast loud punk singles.',
  P4: 'Hardcore punk, fast and loud.',
  P5: 'Loud punk, fast songs.',
  N: null,
};

type Fixture = { artistId: string; byKey: Map<string, string>; keyOf: (id: string | null) => string | null; titleOf: (key: string) => string };

async function fixture(page: Page, keys: readonly string[] = Object.keys(ABOUTS)): Promise<Fixture> {
  const suffix = `pa178${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Ask-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  for (const key of keys) await seedRecords(artist.id, `Ask ${key}`, suffix, 1);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string; title: string }> };
  const byKey = new Map(listed.data.map((row) => [row.title.split(' ')[1], row.id]));
  const titles = new Map(listed.data.map((row) => [row.title.split(' ')[1], row.title]));
  const db = getTestDb();
  for (const key of keys) {
    const id = byKey.get(key);
    const about = ABOUTS[key];
    if (id === undefined) throw new Error(`no record ${key}`);
    if (about === null) continue;
    await db.execute(sql`UPDATE records SET snippet = ${about} WHERE id = ${id}::uuid`);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  const ids = new Map([...byKey.entries()].map(([k, v]) => [v, k]));
  return { artistId: artist.id, byKey, keyOf: (id) => (id === null ? null : (ids.get(id) ?? null)), titleOf: (key) => titles.get(key) ?? '' };
}

async function openGrid(page: Page, artistId: string, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=grid&artistId=${artistId}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
}
const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');
const ask = (page: Page) => control(page).getByRole('button', { name: /^ask$/i });
const surprise = (page: Page) => control(page).getByRole('button', { name: /surprise me/i });
const slot = (page: Page) => control(page).locator('[data-pick-slot]');
/** The drawn answers' record ids, in rank order. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    return Array.from(document.querySelectorAll('[data-pick-answer]')).filter(visible).sort((a, b) => Number(a.getAttribute('data-rank')) - Number(b.getAttribute('data-rank'))).map((el) => el.querySelector('a[href^="/records/"]')?.getAttribute('href')?.replace('/records/', '') ?? '');
  });
const askFor = async (page: Page, phrase: string) => {
  await field(page).fill(phrase);
  await ask(page).click();
};

test('ASK is inert on an empty field, in the label colour, a Tab stop named unavailable with its reason; it takes ink once there is text', async ({ page }) => {
  const { artistId } = await fixture(page, ['J1']);
  try {
    await openGrid(page, artistId);
    await expect(control(page).locator('[data-mood]'), 'the moods retire').toHaveCount(0);
    await expect(ask(page)).toHaveAttribute('aria-disabled', 'true');
    expect(await ask(page).evaluate((el) => (el as HTMLElement).tabIndex), 'still a Tab stop').toBeGreaterThanOrEqual(0);
    await expect(ask(page)).toHaveAccessibleDescription('write what you want first');
    const inert = await ask(page).evaluate((el) => getComputedStyle(el).color);
    await field(page).fill('late night jazz');
    await expect(ask(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await ask(page).evaluate((el) => getComputedStyle(el).color), 'ink once there is text').not.toBe(inert);
    /* Nothing asked yet: the field alone draws no answer. */
    expect(await drawn(page)).toEqual([]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('an ask on the grid draws the nearest five covers in rank order beneath the control, a record with no ABOUT never among them; a re-ask leaves the last answer out while enough remain', async ({ page }) => {
  const { artistId, keyOf } = await fixture(page);
  try {
    await openGrid(page, artistId);
    const before = page.url();
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    const first = (await drawn(page)).map(keyOf);
    expect(new Set(first), 'the five jazz records, nearest by the words they share').toEqual(new Set(['J1', 'J2', 'J3', 'J4', 'J5']));
    expect(page.url(), 'nothing goes to the address').toBe(before);
    /* The re-ask: the five jazz records are left out, and the five punk records are exactly enough to answer. */
    await ask(page).click();
    await expect.poll(async () => new Set((await drawn(page)).map(keyOf)), { timeout: 15_000 }).toEqual(new Set(['P1', 'P2', 'P3', 'P4', 'P5']));
    /* A third ask: only one record would be left of the ten, fewer than five, so the pool is ranked whole again. */
    await ask(page).click();
    await expect.poll(async () => new Set((await drawn(page)).map(keyOf)), { timeout: 15_000 }).toEqual(new Set(['J1', 'J2', 'J3', 'J4', 'J5']));
    expect((await drawn(page)).map(keyOf), 'N, with no ABOUT, is never an answer').not.toContain('N');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a record’s title asks from that record and leaves it out of its own answers', async ({ page }) => {
  const { artistId, keyOf, titleOf } = await fixture(page);
  try {
    await openGrid(page, artistId);
    await askFor(page, titleOf('J1'));
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    const keys = (await drawn(page)).map(keyOf);
    expect(keys, 'never itself').not.toContain('J1');
    expect(keys.slice(0, 4), 'its nearest are the other jazz records').toEqual(expect.arrayContaining(['J2', 'J3', 'J4', 'J5']));
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a pool with no ABOUT is unanswerable: no cover, and the slot says so; the count line counts the collection, not the pool', async ({ page }) => {
  const { artistId } = await fixture(page, ['N']);
  try {
    await openGrid(page, artistId);
    const line = control(page).locator('[data-without-about]');
    await expect(line).toHaveText(/^\d+ have no About\.$/);
    expect(Number((await line.textContent())?.split(' ')[0]), 'at least the seeded record without one').toBeGreaterThanOrEqual(1);
    await askFor(page, 'late night jazz');
    await expect(slot(page)).toHaveText('No About yet.', { timeout: 15_000 });
    expect(await drawn(page)).toEqual([]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('SURPRISE ME ignores the field and leaves its text, drawing one record from the whole pool, ABOUT or not', async ({ page }) => {
  const { artistId, keyOf } = await fixture(page, ['N']);
  try {
    await openGrid(page, artistId);
    await field(page).fill('late night jazz');
    await surprise(page).click();
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(1);
    expect((await drawn(page)).map(keyOf)).toEqual(['N']);
    await expect(field(page), 'the field keeps its text').toHaveValue('late night jazz');
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a navigation clears the field and the answer', async ({ page }) => {
  const { artistId } = await fixture(page, ['J1', 'J2', 'J3']);
  try {
    await openGrid(page, artistId);
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(3);
    await page.locator('[data-collection-band]').filter({ visible: true }).getByRole('link', { name: /^table$/i }).click();
    await expect(page).toHaveURL(/view=table/);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
    await expect(field(page)).toHaveValue('');
    expect(await drawn(page), 'the table starts with no answer').toEqual([]);
    await expect(ask(page)).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await removeRecordsFor(artistId);
  }
});

/*
  Step 182 (§P.2, §P.4, §P.5, §P.6; Design's "Ask field captures read", 12 Nov): the answer's count is keyed to its
  form, one where it is a pull and five where it is cells, never to the view's name, so the far view's band host draws
  five; ASK and SURPRISE ME have a gap between them in the sidebar; at 390 the answer ends with the control's closing
  hairline before the list; the field's label and the count line each take one line at the rail's width. Each fails
  against the build before 182: one cover in the far band (the shelf's one reached it), "ASKSURPRISE ME", five covers
  running into the grid, and the old wordings on two lines.
*/
test('the far view’s band host answers with five cells, the count keyed to the answer’s form and not the view’s name', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    const asks: Array<{ take: number }> = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/ask')) asks.push(request.postDataJSON() as { take: number });
    });
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    expect(asks[0]?.take, 'asked for five, since the far view cannot pull').toBe(5);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('ASK and SURPRISE ME stand apart in the sidebar at 1440 and in the band at 390', async ({ page }) => {
  const { artistId } = await fixture(page, ['J1']);
  try {
    for (const width of [1440, 390]) {
      await openGrid(page, artistId, width);
      const gap = await page.evaluate(() => {
        const control = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control]')).find((el) => el.getClientRects().length > 0);
        const buttons = Array.from(control?.querySelectorAll('button') ?? []);
        const askBox = buttons.find((b) => /^ask$/i.test(b.textContent ?? ''))?.getBoundingClientRect();
        const surpriseBox = buttons.find((b) => /surprise me/i.test(b.textContent ?? ''))?.getBoundingClientRect();
        return askBox && surpriseBox ? surpriseBox.left - askBox.right : null;
      });
      expect(gap, `at ${width}: the band host's 18 between ASK's right and SURPRISE ME's left`).toBeGreaterThanOrEqual(18);
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('at 390 the answer ends with the control’s closing hairline before the list, so five covers do not run into the grid', async ({ page }) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId, 390);
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    type Rule = { drawn: true; answersBottom: number; ruleTop: number; listTop: number; ruleHeight: number } | { drawn: false; answers: boolean; hr: boolean; list: boolean };
    const rule = await page.evaluate((): Rule => {
      const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
      const answers = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-answers]')).find(visible);
      const hr = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-close-rule]')).find(visible);
      const list = Array.from(document.querySelectorAll<HTMLElement>('[data-collection-content] a[href^="/records/"]')).find(visible);
      if (!answers || !hr || !list) return { drawn: false, answers: !!answers, hr: !!hr, list: !!list };
      return { drawn: true, answersBottom: answers.getBoundingClientRect().bottom, ruleTop: hr.getBoundingClientRect().top, listTop: list.getBoundingClientRect().top, ruleHeight: hr.getBoundingClientRect().height };
    });
    if (!rule.drawn) throw new Error(`not all drawn: ${JSON.stringify(rule)}`);
    expect(rule.ruleTop, 'the hairline below the answer').toBeGreaterThanOrEqual(rule.answersBottom);
    expect(rule.ruleTop, 'and above the list').toBeLessThanOrEqual(rule.listTop);
    expect(rule.ruleHeight, 'a hairline').toBeLessThanOrEqual(1.5);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('the field’s label and the count line each take one line at the rail’s width, and the count line at 320 and 1280', async ({ page }) => {
  const { artistId } = await fixture(page, ['N']);
  try {
    const oneLine = async (selector: string, what: string, reportOnly = false) => {
      const m = await page.evaluate((sel) => {
        const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.getClientRects().length > 0);
        if (!el) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        /* Lines, not rects: the count line is two text nodes (the number, the words), so a range gives two rects on one line; a line is a distinct top. */
        const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
        return { lines, height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight), width: el.getBoundingClientRect().width, text: el.textContent ?? '' };
      }, selector);
      if (m === null) throw new Error(`${what} not drawn`);
      test.info().annotations.push({ type: what, description: `"${m.text}": ${m.lines} line(s) in ${m.width.toFixed(1)} wide, the box ${m.height.toFixed(1)} tall against a line of ${m.lineHeight.toFixed(1)}` });
      if (reportOnly) return;
      expect(m.lines, `${what} "${m.text}": one line`).toBe(1);
      expect(m.height / m.lineHeight, `${what}: the box holds one line`).toBeLessThan(2);
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await oneLine('[data-pick-control] label', 'the label in the rail');
    await oneLine('[data-without-about] span', 'the count line in the rail');
    await openGrid(page, artistId, 320);
    await oneLine('[data-without-about] span', 'the count line at 320');
    await openGrid(page, artistId, 1280);
    await oneLine('[data-without-about] span', 'the count line at 1280');
  } finally {
    await removeRecordsFor(artistId);
  }
});

/* Design's open question (12 Nov): the count column's free height at 1440 × 900 and 768, and whether five cells at 160, two across and three down, fit beneath the count without the page scrolling. Reported, not asserted: Design rules once it has the figure. */
test('182, report: the count column’s free height on the far view at 1440 × 900 and 768', { tag: '@report-only' }, async ({ page }, testInfo) => {
  const { artistId } = await fixture(page);
  try {
    for (const height of [900, 768]) {
      await page.setViewportSize({ width: 1440, height });
      await page.goto(`/?artistId=${artistId}`);
      await wallMeasured(page);
      await page.getByTestId('wall-zoom-out').click();
      await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
      await page.getByTestId('wall-count-far').waitFor({ timeout: 30_000 });
      const m = await page.evaluate(() => {
        const count = document.querySelector<HTMLElement>('[data-testid="wall-count-far"]');
        const column = count?.parentElement ?? null;
        if (!count || !column) return null;
        const lines = Array.from(column.children).filter((el) => !el.hasAttribute('data-pick-answer'));
        const last = lines[lines.length - 1];
        const lastLine: number = last === undefined ? count.getBoundingClientRect().bottom : last.getBoundingClientRect().bottom;
        const columnBox = column.getBoundingClientRect();
        return { columnWidth: columnBox.width, lastLineBottom: lastLine, columnBottom: columnBox.bottom, window: window.innerHeight, page: document.documentElement.scrollHeight };
      });
      if (m === null) throw new Error('no count column');
      const free = m.window - m.lastLineBottom - 24;
      const fiveTall = 3 * 160 + 2 * 18 + 3 * 44;
      testInfo.annotations.push({ type: `count column at 1440 × ${height}`, description: `${m.columnWidth.toFixed(0)} wide; its last line ends at ${m.lastLineBottom.toFixed(1)}, so ${free.toFixed(1)} is free beneath it and the 24 to the window's foot (the column's box ends at ${m.columnBottom.toFixed(1)}; the page ${m.page} tall in a ${m.window} window); five cells at 160 two across and three down, with their captions, need about ${fiveTall}, so they ${fiveTall <= free ? 'fit' : `run past by ${(fiveTall - free).toFixed(0)}`} without scrolling` });
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

/* §P.4, the second proposal (the coordinator, 12 Nov): a column where the control draws as a column, a wrapped row where it draws as a band. */
test('the covers stand in a column in the sidebar and in a wrapped row in the band, and the column’s height against the sidebar is reported', async ({ page }, testInfo) => {
  const { artistId } = await fixture(page);
  try {
    await openGrid(page, artistId, 1280);
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    const column = await page.evaluate(() => {
      const list = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-answers]')).find((el) => el.getClientRects().length > 0);
      const sidebar = document.querySelector<HTMLElement>('[data-collection-sidebar]');
      const controls = document.querySelector<HTMLElement>('[data-collection-controls]');
      if (list === undefined || sidebar === null || controls === null) return null;
      const tops = Array.from(list.children).map((li) => Math.round(li.getBoundingClientRect().top));
      return { direction: getComputedStyle(list).flexDirection, rows: new Set(tops).size, height: list.getBoundingClientRect().height, sidebarWidth: sidebar.getBoundingClientRect().width, controlsBottom: controls.getBoundingClientRect().bottom, sidebarBottom: sidebar.getBoundingClientRect().bottom, page: document.documentElement.scrollHeight, window: window.innerHeight };
    });
    if (column === null) throw new Error('the sidebar’s answers are not drawn');
    expect(column.direction, 'a column in the sidebar').toBe('column');
    expect(column.rows, 'five cells on five rows').toBe(5);
    testInfo.annotations.push({ type: 'sidebar column', description: `five cells ${column.height.toFixed(1)} tall in a ${column.sidebarWidth.toFixed(0)} sidebar; the controls end at ${column.controlsBottom.toFixed(1)} and the sidebar at ${column.sidebarBottom.toFixed(1)} in a ${column.window} window; the page ${column.page} tall` });
    await openGrid(page, artistId, 390);
    await askFor(page, 'late night jazz');
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toHaveLength(5);
    const band = await page.evaluate(() => {
      const list = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-answers]')).find((el) => el.getClientRects().length > 0);
      if (list === undefined) return null;
      const tops = Array.from(list.children).map((li) => Math.round(li.getBoundingClientRect().top));
      return { direction: getComputedStyle(list).flexDirection, wrap: getComputedStyle(list).flexWrap, rows: new Set(tops).size };
    });
    if (band === null) throw new Error('the band’s answers are not drawn');
    expect(band.direction, 'a row in the band').toBe('row');
    expect(band.wrap).toBe('wrap');
    expect(band.rows, 'wrapped: fewer rows than cells at 390').toBeLessThan(5);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/*
  §P.2 (step 180, "Ask field reconciled", 12 Nov): "An answer is the records the reader is shown: on the shelf one, the
  pull, and elsewhere five." The shelf asks for one, and a re-roll pulls the next nearest: the re-ask leaves out only
  what was shown, so no record the reader never saw is lost from the next ask. Fails against the shelf asking for three
  (step 178's first build), which the request's body shows.
*/
test('on the near view the ask asks for one and pulls it, no cover is drawn, and a re-ask leaves out only the record shown and pulls the next nearest', async ({ page }) => {
  const { artistId, keyOf } = await fixture(page);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    const asks: Array<{ take: number; exclude?: string[] }> = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/ask')) asks.push(request.postDataJSON() as { take: number; exclude?: string[] });
    });
    await askFor(page, 'late night jazz');
    await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
    const first = await page.locator('[data-pulled]').getAttribute('data-pulled');
    expect(keyOf(first), 'the nearest is a jazz record').toMatch(/^J/);
    expect(await drawn(page), 'no cover on the near view').toEqual([]);
    expect(asks[0], 'the shelf asks for one, the pull').toMatchObject({ take: 1 });
    expect(asks[0]?.exclude, 'and leaves nothing out of a first ask').toBeUndefined();
    /* The re-ask: only the record shown is left out, and the next nearest is pulled. */
    await ask(page).click();
    await expect.poll(() => page.locator('[data-pulled]').getAttribute('data-pulled'), { timeout: 30_000 }).not.toBe(first);
    expect(asks[1]?.exclude, 'the re-ask leaves out the one record shown and no record it did not show').toEqual([first]);
    expect(asks[1]?.take).toBe(1);
    expect(keyOf(await page.locator('[data-pulled]').getAttribute('data-pulled')), 'the next nearest is a jazz record too').toMatch(/^J/);
  } finally {
    await removeRecordsFor(artistId);
  }
});
