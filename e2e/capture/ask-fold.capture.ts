import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';

/**
 * **What stands above the ask field, measured thing by thing (the coordinator, 19 Nov).** Design read 560 of 844 above
 * the field at 390 from the 3a captures, as one number: search, the view names, the heading, sort, genre, label and
 * "Clear filters". The fix depends on the split: if the filters are most of it, moving the control above them puts the
 * answer in view; if search, the view names and the heading are most of it, moving the control saves little. So this
 * measures, in each host, every drawn element above the field in the field's own column, top and height, on the page,
 * and then the field, the buttons, the slot, the first answer and the count line, against the window. Every record is
 * SEEDED and the reply STUBBED, as in pick-reasons-3a, at the longest approved reason. Read-only: nothing is changed.
 * Written to `docs/captures/ask-fold/`.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture ask-fold
 */
const OUT = join('docs', 'captures', 'ask-fold');
registerCleanup();
test.describe.configure({ mode: 'serial' });

const APPROVED = 'Slow and spacious with abrasive peaks on side two, for a late room that wants attention rather than company.';
const TITLE_PREFIX = 'Selections From The Long Evening Programme And Other Favourites Vol';
const ARTIST_PREFIX = 'The Reason Orchestra And Its Chorus';

type Row = { id: string; title: string };
async function seed(page: Page): Promise<{ artistId: string; records: Row[] }> {
  const suffix = `cf${Date.now().toString(36)}`;
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

type Box = { what: string; top: number; height: number; bottom: number };
type Stack = { window: number; above: Box[]; field: Box; buttons: Box | null; slot: Box | null; firstAnswer: Box | null; countLine: Box | null; lastAnswer: Box | null };

/**
 * Every drawn leaf above the field, in the field's column, named by its tag and text: the split the coordinator asked
 * for, read off the page. A leaf is an element with no drawn element children, or a control; boxes that repeat are
 * reported once. Positions are document positions (viewport plus scroll), so the stack reads from the page's top.
 */
const stack = (page: Page): Promise<Stack> =>
  page.evaluate(() => {
    const field = document.querySelector('[data-ask-field]') as HTMLElement;
    const f = field.getBoundingClientRect();
    const y = window.scrollY;
    const box = (what: string, r: DOMRect): Box => ({ what, top: Math.round((r.top + y) * 10) / 10, height: Math.round(r.height * 10) / 10, bottom: Math.round((r.bottom + y) * 10) / 10 });
    const drawn = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const leaves: Box[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (!drawn(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0 || r.bottom + y > f.top + y + 0.5) continue;
      if (r.right < f.left - 1 || r.left > f.right + 1) continue;
      const isControl = /^(INPUT|BUTTON|SELECT|HR|SVG|IMG)$/.test(el.tagName);
      const hasDrawnChildren = Array.from(el.children).some((c) => drawn(c) && c.getBoundingClientRect().height > 0);
      if (!isControl && hasDrawnChildren) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const what = `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''} ${text}`.trim();
      const key = `${Math.round(r.top)}:${Math.round(r.height)}:${what}`;
      if (seen.has(key)) continue;
      seen.add(key);
      leaves.push(box(what, r));
    }
    leaves.sort((a, b) => a.top - b.top || a.height - b.height);
    const one = (what: string, sel: string): Box | null => { const el = document.querySelector(sel); return el === null || !drawn(el) ? null : box(what, el.getBoundingClientRect()); };
    const answers = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn);
    const count = Array.from(document.querySelectorAll('p, div, span')).find((el) => /\d+ not described\./.test(el.textContent ?? '') && !Array.from(el.children).some((c) => /\d+ not described\./.test(c.textContent ?? '')));
    return {
      window: window.innerHeight,
      above: leaves,
      field: box('the ask field', f),
      buttons: one('ASK and SURPRISE ME', '[data-pick-buttons]'),
      slot: one('the slot', '[data-pick-slot]'),
      firstAnswer: answers.length === 0 ? null : box('the first answer cell', answers[0].getBoundingClientRect()),
      lastAnswer: answers.length === 0 ? null : box('the last answer cell', answers[answers.length - 1].getBoundingClientRect()),
      countLine: count === undefined ? null : box(`the count line: ${(count.textContent ?? '').trim()}`, count.getBoundingClientRect()),
    };
  });

type Line = { host: string; window: string; file: string; s: Stack };
const results: Line[] = [];

async function host(page: Page, name: string, url: string, width: number, height: number, file: string) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await filtersReady(page);
  await askFor(page);
  await reasonsDrawn(page, 5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  const s = await stack(page);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: false });
  results.push({ host: name, window: `${width} × ${height}`, file: `${file}.png`, s });
}

const fmt = (b: Box | null) => (b === null ? '—' : `top ${b.top}, ${b.height} tall, bottom ${b.bottom}`);

function readme(): string {
  const lines = [
    `# ask-fold · what stands above the ask field, thing by thing, in each host (the coordinator, 19 Nov), captured ${new Date().toISOString().slice(0, 10)}`,
    '',
    '**Every record is seeded and the reply is stubbed at the longest approved reason (108 characters); nothing here describes the collection or the model.** Positions are',
    'document positions from the page\'s top, measured on the page with the window scrolled to the top; "in view" means inside the window without scrolling. Each table lists',
    'every drawn leaf above the field in the field\'s column, so the split is read off the page rather than summed from a design. From the production build locally (E2E_SERVER=build).',
    '',
  ];
  for (const l of results) {
    const s = l.s;
    lines.push(`## ${l.host}, ${l.window} (${l.file})`, '', `Window ${s.window} tall. The field's top is at ${s.field.top}: everything above it comes to ${s.field.top} of ${s.window}.`, '', '| above the field | top | height | bottom |', '|---|---|---|---|');
    for (const b of s.above) lines.push(`| ${b.what.replace(/\|/g, '/')} | ${b.top} | ${b.height} | ${b.bottom} |`);
    lines.push('', '| below | position | in view |', '|---|---|---|');
    for (const b of [s.field, s.buttons, s.slot, s.firstAnswer, s.lastAnswer, s.countLine]) if (b !== null) lines.push(`| ${b.what} | ${fmt(b)} | ${b.bottom <= s.window ? 'yes' : `no, ${Math.round(b.bottom - s.window)} past the window`} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the table and the grid sidebars at 1440 × 900', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    await page.route('**/api/ask', (route) => route.fulfill({ json: replyWith(records, APPROVED) }));
    try {
      for (const view of ['table', 'grid'] as const) await host(page, `the ${view}’s sidebar`, `/?view=${view}&artistId=${artistId}`, 1440, 900, `${view}-1440x900`);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid bands at 390 × 844, and the README', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    await page.route('**/api/ask', (route) => route.fulfill({ json: replyWith(records, APPROVED) }));
    try {
      for (const view of ['table', 'grid'] as const) await host(page, `the ${view}’s band`, `/?view=${view}&artistId=${artistId}`, 390, 844, `${view}-390x844`);
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'README.md'), readme());
    for (const l of results) console.log(`ASK-FOLD ${l.host} ${l.window}: field top ${l.s.field.top} of ${l.s.window}; first answer ${fmt(l.s.firstAnswer)}; count line ${fmt(l.s.countLine)}`);
  });
});
