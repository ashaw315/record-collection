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
 * Written to `docs/captures/ask-fold-moved/` (the first run, as built at the approved length only, is `ask-fold/`).
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture ask-fold
 */
/* A folder of its own (19 Nov, second run): the first run's four stills in `ask-fold/` are committed evidence and are never rewritten (captures-unchanged). */
const OUT = join('docs', 'captures', 'ask-fold-moved');
registerCleanup();
test.describe.configure({ mode: 'serial' });

const APPROVED = 'Slow and spacious with abrasive peaks on side two, for a late room that wants attention rather than company.';
/*
 * The model's own lengths (scripts/measure-reason-lengths.mts, 19 Nov: 64 reasons from 20 phrases against the 55 held
 * drafts, min 117, median 160, p90 185, max 210, every one over the approved 108): the median and the p90 as the model
 * wrote them, so the cell's height is measured at what the pick draws, not at what the 3a stub drew.
 */
const MEDIAN = 'Go straight to the extended blues jam on side two for a long run of saxophone, organ, bass and drum solos to sink into rather than the sung horn-rock elsewhere.';
const P90 = 'Smooth electric piano, soft drums and close-stacked harmonies offer a slow-to-mid-tempo soundtrack for tonight, with a few brisker or grittier grooves before the weary closing slowdown.';
type State = 'approved' | 'median' | 'p90';
const STATES: Array<[State, string, boolean]> = [['approved', APPROVED, true], ['median', MEDIAN, true], ['p90', P90, false]];
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

type Line = { host: string; window: string; state: State; chars: number; file: string; s: Stack };
const results: Line[] = [];

/*
  The two moved layouts (the coordinator, 19 Nov): the control above the filters, and above the heading, which neither
  side had treated as a candidate. Measured, not computed: the control's node is moved in the page and the browser lays
  the page out again, so the figures are the layout engine's, with the control's own rule and label travelling with it.
  A moved node, not a built variant: the built one is one JSX move once Adam has chosen, and may differ by a margin.
*/
type Variant = 'as built' | 'above the filters' | 'above the heading';
const VARIANTS: Array<[Variant, string | null]> = [['as built', null], ['above the filters', '[data-collection-filters]'], ['above the heading', '[data-collection-heading]']];
const move = (page: Page, before: string) => page.evaluate((sel) => {
  const control = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control]')).find((el) => el.getClientRects().length > 0);
  const target = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => el.getClientRects().length > 0);
  if (control === undefined || target === undefined || target.parentElement === null) throw new Error(`cannot move the control before ${sel}`);
  target.parentElement.insertBefore(control, target);
}, before);

async function host(page: Page, name: string, url: string, width: number, height: number, file: string, state: State, reason: string, still: boolean) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await filtersReady(page);
  await askFor(page);
  await reasonsDrawn(page, 5);
  for (const [variant, before] of VARIANTS) {
    if (before !== null) await move(page, before);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    const s = await stack(page);
    await page.mouse.move(0, 0);
    const suffix = variant === 'as built' ? '' : `-${variant.replace(/ /g, '-')}`;
    const name2 = `${state}-${file}${suffix}.png`;
    if (still) await page.screenshot({ path: join(OUT, name2), fullPage: false });
    results.push({ host: `${name}, ${variant}`, window: `${width} × ${height}`, state, chars: [...reason].length, file: still ? name2 : '(no still: numbers only)', s });
  }
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
  lines.push('## The first cell against the window, every host, every reason length, every placement', '', 'The count line stands where it is ruled, beneath the slot with the answers 24 below it (fixed 19 Nov). A negative margin is how far the first cell\'s bottom falls past the window.', '', '| host | window | reason | placement | field top | first cell bottom | margin to the window |', '|---|---|---|---|---|---|---|');
  for (const l of results) lines.push(`| ${l.host.split(', ')[0]} | ${l.window} | ${l.state}, ${l.chars} chars | ${l.host.split(', ')[1]} | ${l.s.field.top} | ${l.s.firstAnswer?.bottom ?? '—'} | ${l.s.firstAnswer === null ? '—' : Math.round((l.s.window - l.s.firstAnswer.bottom) * 10) / 10} |`);
  lines.push('');
  for (const l of results) {
    const s = l.s;
    lines.push(`## ${l.host}, ${l.window}, the ${l.state} reason of ${l.chars} characters (${l.file})`, '', `Window ${s.window} tall. The field's top is at ${s.field.top}: everything above it comes to ${s.field.top} of ${s.window}.`, '', '| above the field | top | height | bottom |', '|---|---|---|---|');
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
    let reply = replyWith(records, APPROVED);
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    try {
      for (const [state, reason, still] of STATES) {
        reply = replyWith(records, reason);
        for (const view of ['table', 'grid'] as const) await host(page, `the ${view}’s sidebar`, `/?view=${view}&artistId=${artistId}`, 1440, 900, `${view}-1440x900`, state, reason, still);
      }
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
    let reply = replyWith(records, APPROVED);
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    try {
      for (const [state, reason, still] of STATES) {
        reply = replyWith(records, reason);
        for (const view of ['table', 'grid'] as const) await host(page, `the ${view}’s band`, `/?view=${view}&artistId=${artistId}`, 390, 844, `${view}-390x844`, state, reason, still);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'README.md'), readme());
    for (const l of results) console.log(`ASK-FOLD ${l.host} ${l.window} ${l.state} ${l.chars}: field top ${l.s.field.top} of ${l.s.window}; first cell bottom ${l.s.firstAnswer?.bottom ?? "—"}, margin ${l.s.firstAnswer === null ? "—" : Math.round((l.s.window - l.s.firstAnswer.bottom) * 10) / 10}`);
  });
});
