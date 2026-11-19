import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';

/**
 * **The layout's capacity for a reason, in characters and lines (the coordinator, 19 Nov).** With the control above
 * the heading and the count line where it is ruled, the first cell's reason is grown word by word through real reasons
 * the model wrote, and the cell's bottom read against the window after each word: the longest reason whose cell still
 * stands wholly in view is the schema maximum, and the longest whose cell clears with one line to spare is the prompt
 * target. Measured at 390 × 844 and 1440 × 900 in the grid's host, seeded and stubbed as ask-fold is; the control's
 * node is moved in the page, the browser laying it out again. Written to `docs/captures/ask-fold-capacity/`.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture ask-fold-capacity
 */
const OUT = join('docs', 'captures', 'ask-fold-capacity');
registerCleanup();
test.describe.configure({ mode: 'serial' });

/* Real reasons the model wrote on 19 Nov (scripts/measure-reason-lengths.mts), joined, so the words are the model's words. */
const WORDS = [
  'Go straight to the extended blues jam on side two for a long run of saxophone, organ, bass and drum solos to sink into rather than the sung horn-rock elsewhere.',
  'Smooth electric piano, soft drums and close-stacked harmonies offer a slow-to-mid-tempo soundtrack for tonight, with a few brisker or grittier grooves before the weary closing slowdown.',
  'The patient guitar, spacious echoes and subdued pulse could sit behind your reading, but it does not meet your no-vocals requirement: voices remain low in the mix as texture.',
].join(' ').split(' ');
const TITLE_PREFIX = 'Selections From The Long Evening Programme And Other Favourites Vol';
const ARTIST_PREFIX = 'The Reason Orchestra And Its Chorus';

type Row = { id: string; title: string };
async function seed(page: Page): Promise<{ artistId: string; records: Row[] }> {
  const suffix = `cc${Date.now().toString(36)}`;
  const created = (await (await page.request.post('/api/artists', { data: { name: `${ARTIST_PREFIX} ${suffix}` } })).json()) as { id: string };
  trackArtist(created.id);
  await seedRecords(created.id, TITLE_PREFIX, suffix, 5);
  const listed = (await (await page.request.get(`/api/records?artistId=${created.id}&pageSize=100`)).json()) as { data: Row[] };
  return { artistId: created.id, records: [...listed.data].sort((x, y) => x.title.localeCompare(y.title)) };
}
const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const askFor = async (page: Page) => {
  await control(page).locator('[data-ask-field]').fill('something slow for tonight');
  await control(page).getByRole('button', { name: /^ask$/i }).click();
};
const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
const reasonsDrawn = (page: Page, count: number) => page.locator('[data-grid-reason]').nth(count - 1).waitFor({ timeout: 30_000 });
const replyWith = (records: Row[], reason: string) => ({ mode: 'pick', verdict: 'answer', answers: records.map((r) => ({ recordId: r.id, reason, claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false });

type Step = { words: number; chars: number; lines: number; cellBottom: number; margin: number };
type Capacity = { window: number; lineHeight: number; cellWidth: number; steps: Step[]; whole: Step | null; spare: Step | null };

/* Grows the first cell's reason one word at a time and reads the cell after each; the two thresholds are the last step inside each bound. */
const grow = (page: Page, words: string[]) =>
  page.evaluate((ws) => {
    const drawn = (el: Element) => el.getClientRects().length > 0;
    const cell = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-answer]')).find(drawn);
    const reason = cell?.querySelector<HTMLElement>('[data-grid-reason]') ?? null;
    if (cell === undefined || reason === null) throw new Error('no drawn first cell with a reason');
    const lineHeight = Number.parseFloat(getComputedStyle(reason).lineHeight);
    const y = window.scrollY;
    const steps: Step[] = [];
    for (let n = 1; n <= ws.length; n += 1) {
      const text = ws.slice(0, n).join(' ');
      reason.textContent = text;
      const r = reason.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const bottom = Math.round((c.bottom + y) * 10) / 10;
      steps.push({ words: n, chars: [...text].length, lines: Math.round(r.height / lineHeight), cellBottom: bottom, margin: Math.round((window.innerHeight - bottom) * 10) / 10 });
    }
    const whole = [...steps].reverse().find((s) => s.margin >= 0) ?? null;
    const spare = [...steps].reverse().find((s) => s.margin >= lineHeight) ?? null;
    return { window: window.innerHeight, lineHeight, cellWidth: Math.round(cell.getBoundingClientRect().width * 10) / 10, steps, whole, spare } as Capacity;
  }, words);

const move = (page: Page, before: string) => page.evaluate((sel) => {
  const control = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control]')).find((el) => el.getClientRects().length > 0);
  const target = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => el.getClientRects().length > 0);
  if (control === undefined || target === undefined || target.parentElement === null) throw new Error(`cannot move the control before ${sel}`);
  target.parentElement.insertBefore(control, target);
}, before);

type Line = { host: string; window: string; c: Capacity };
const results: Line[] = [];

async function host(page: Page, name: string, url: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await filtersReady(page);
  await askFor(page);
  await reasonsDrawn(page, 5);
  await move(page, '[data-collection-heading]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  const c = await grow(page, WORDS);
  results.push({ host: name, window: `${width} × ${height}`, c });
}

const fmt = (s: Step | null) => (s === null ? '—' : `${s.chars} characters, ${s.lines} lines, the cell's bottom at ${s.cellBottom}, ${s.margin} to spare`);

function readme(): string {
  const lines = [
    `# ask-fold-capacity · the layout's capacity for a reason above the heading, in characters and lines (the coordinator, 19 Nov), captured ${new Date().toISOString().slice(0, 10)}`,
    '',
    '**Seeded and stubbed as ask-fold is; the control\'s node moved above the heading in the page; the count line where it is ruled.** The first cell\'s reason is grown',
    'one word at a time through three reasons the model wrote on 19 Nov, and the cell\'s bottom is read against the window after each word. "Wholly in view" is the',
    'longest reason whose cell\'s bottom is inside the window: the schema maximum. "One line to spare" is the longest whose cell clears by at least one line of reason:',
    'the prompt target. Characters are the model\'s words as they wrap in the cell at its width, so a different sentence of the same count can take one line more or',
    'fewer; the line counts are the firm figures. From the production build locally (E2E_SERVER=build).',
    '',
    '| host | window | cell width | line height | wholly in view (schema maximum) | one line to spare (prompt target) |',
    '|---|---|---|---|---|---|',
    ...results.map((l) => `| ${l.host} | ${l.window} | ${l.c.cellWidth} | ${l.c.lineHeight} | ${fmt(l.c.whole)} | ${fmt(l.c.spare)} |`),
    '',
  ];
  for (const l of results) {
    lines.push(`## ${l.host}, ${l.window}: every word`, '', '| words | characters | lines | cell bottom | margin |', '|---|---|---|---|---|');
    for (const s of l.c.steps) lines.push(`| ${s.words} | ${s.chars} | ${s.lines} | ${s.cellBottom} | ${s.margin} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the grid’s sidebar at 1440 × 900', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    await page.route('**/api/ask', (route) => route.fulfill({ json: replyWith(records, WORDS.slice(0, 20).join(' ')) }));
    try {
      await host(page, 'the grid’s sidebar, the control above the heading', `/?view=grid&artistId=${artistId}`, 1440, 900);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the grid’s band at 390 × 844, and the README', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    await page.route('**/api/ask', (route) => route.fulfill({ json: replyWith(records, WORDS.slice(0, 20).join(' ')) }));
    try {
      await host(page, 'the grid’s band, the control above the heading', `/?view=grid&artistId=${artistId}`, 390, 844);
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'README.md'), readme());
    for (const l of results) console.log(`CAPACITY ${l.host} ${l.window}: cell ${l.c.cellWidth} wide, line ${l.c.lineHeight}; wholly in view: ${fmt(l.c.whole)}; one line to spare: ${fmt(l.c.spare)}`);
  });
});
