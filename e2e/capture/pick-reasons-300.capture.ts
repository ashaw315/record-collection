import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';

/**
 * **The layout's tolerance of a long reason, measured (the coordinator, 18 Nov).** The pick's schema puts no bound on a
 * reason, Adam approved 3a against reasons of 91 to 108 characters, and a consolation reason legitimately carries three
 * things in one sentence. So, before deciding any bound: one stubbed capture per host at a reason of about 300
 * characters, three times what was approved, and what the layout does with it, measured on the page rather than read
 * off the picture: whether the cell grows and the text wraps whole, or clips, overflows or pushes the row out of view.
 * Every record is SEEDED and every reply STUBBED, as in pick-reasons-3a; the reason is this file's sentence, not the
 * model's. Written to `docs/captures/pick-reasons-300/`.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture pick-reasons-300
 */
const OUT = join('docs', 'captures', 'pick-reasons-300');
registerCleanup();
/* Serial, in one worker: the narrow test writes the README from both tests' measurements, so they share one process. */
test.describe.configure({ mode: 'serial' });

/* The longest reason Adam approved 3a against (pick-reasons-3a, 108 characters), measured beside the long one so the growth is a difference, not a guess. */
const APPROVED = 'Slow and spacious with abrasive peaks on side two, for a late room that wants attention rather than company.';
/* One sentence, about 300 characters, in the reader's terms, as a consolation reason might run. */
const LONG =
  'Slow and spacious across both sides, with abrasive peaks on the second side that interrupt the quiet rather than build to it, ' +
  'for a late room that wants attention rather than company, where the hiss and the bare guitar read as detail rather than noise, ' +
  'and where nothing here would sit under conversation.';
const TITLE_PREFIX = 'Selections From The Long Evening Programme And Other Favourites Vol';
const ARTIST_PREFIX = 'The Reason Orchestra And Its Chorus';

type Row = { id: string; title: string };
async function seed(page: Page): Promise<{ artistId: string; records: Row[] }> {
  const suffix = `c300${Date.now().toString(36)}`;
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
const panelReasonDrawn = (page: Page) => page.locator('[data-testid="panel-reason"]').waitFor({ timeout: 30_000 });
const landed = (page: Page) => page.locator('[data-wall-container][data-phase="landed"]').waitFor({ timeout: 30_000 });

type Measure = {
  chars: number;
  lines: number;
  reasonHeight: number;
  hostHeight: number;
  overflowX: boolean;
  clippedBy: string | null;
  inView: boolean;
  bottom: number;
  windowHeight: number;
  reachable: boolean;
};

/**
 * What the page did with the reason: its lines (its height over its line height), the height of the cell or panel that
 * holds it, whether its text runs wider than its box, whether any ancestor with a hiding overflow cuts it, and whether
 * its bottom is inside the window without scrolling.
 */
const measure = (page: Page, reasonSelector: string, hostSelector: string): Promise<Measure[]> =>
  page.evaluate(
    ({ reasonSelector, hostSelector }) => {
      const drawn = (el: Element) => el.getClientRects().length > 0;
      return Array.from(document.querySelectorAll(reasonSelector)).filter(drawn).map((reason) => {
        const r = reason.getBoundingClientRect();
        const host = reason.closest(hostSelector) ?? reason.parentElement;
        const h = (host ?? reason).getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(reason).lineHeight);
        let clippedBy: string | null = null;
        for (let a = reason.parentElement; a !== null && clippedBy === null; a = a.parentElement) {
          const s = getComputedStyle(a);
          const hides = (v: string) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
          if (!hides(s.overflowX) && !hides(s.overflowY)) continue;
          const b = a.getBoundingClientRect();
          if (r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) {
            const names = Array.from(a.attributes).filter((x) => x.name.startsWith('data-')).map((x) => x.name).join(' ');
            clippedBy = `${a.tagName.toLowerCase()}${names === '' ? '' : ` ${names}`} (${Math.round(b.height)} tall)`;
          }
        }
        return {
          chars: [...(reason.textContent ?? '')].length,
          lines: Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(r.height / lineHeight) : Number.NaN,
          reasonHeight: Math.round(r.height * 10) / 10,
          hostHeight: Math.round(h.height * 10) / 10,
          overflowX: reason.scrollWidth > reason.clientWidth + 0.5,
          clippedBy,
          inView: r.top >= 0 && r.bottom <= window.innerHeight + 0.5,
          bottom: Math.round(r.bottom),
          windowHeight: window.innerHeight,
          /* Whether the page can scroll far enough to show the reason's bottom: what the reader can reach, as against what is cut. */
          reachable: r.bottom + window.scrollY <= (document.scrollingElement?.scrollHeight ?? 0) + 0.5 && (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight,
        };
      });
    },
    { reasonSelector, hostSelector },
  );

async function shot(page: Page, name: string, fullPage: boolean) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

type State = 'approved' | 'long';
const STATES: Array<[State, string]> = [['approved', APPROVED], ['long', LONG]];
type Line = { state: State; host: string; window: string; file: string; m: Measure[] };
const results: Line[] = [];

const replyWith = (records: Row[], reason: string) => ({ mode: 'pick', verdict: 'answer', answers: records.map((r) => ({ recordId: r.id, reason, claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false });

async function cellHost(page: Page, state: State, host: string, url: string, width: number, height: number, ready: (page: Page) => Promise<void>, count: number, file: string) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await ready(page);
  await askFor(page);
  await reasonsDrawn(page, count);
  const m = await measure(page, '[data-grid-reason]', '[data-pick-answer]');
  await shot(page, `${state}-${file}`, false);
  results.push({ state, host, window: `${width} × ${height}`, file: `${state}-${file}.png`, m });
}

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('one capture per host at the approved length and at about 300 characters, measured', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    let reply = replyWith(records, APPROVED);
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    try {
      for (const [state, reason] of STATES) {
        reply = replyWith(records, reason);
        /* The shelf: the reason in the pulled record's facts. */
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await askFor(page);
        await landed(page);
        await panelReasonDrawn(page);
        const panel = await measure(page, '[data-testid="panel-reason"]', '[data-testid="record-panel"]');
        await shot(page, `${state}-shelf-1440x900`, false);
        results.push({ state, host: 'the shelf: the pulled record’s facts', window: '1440 × 900', file: `${state}-shelf-1440x900.png`, m: panel });
        /* The far view's column host at 900 and 768: the first cell in the count column. */
        for (const height of [900, 768]) {
          await cellHost(page, state, 'the far view’s column host: the count column’s cell', `/?wall=far&artistId=${artistId}`, 1440, height, wallMeasured, 1, `far-column-1440x${height}`);
        }
        /* The far view's band host at 1044, at 900 and 768: the cells beneath the control, where a taller cell is what would push the row past the window. */
        for (const height of [900, 768]) {
          await cellHost(page, state, 'the far view’s band host: the cells beneath the control', `/?artistId=${artistId}`, 1044, height, wallMeasured, 1, `far-band-1044x${height}`);
        }
        /* The table and the grid at 1440: five cells, each with the reason. */
        for (const view of ['table', 'grid'] as const) {
          await cellHost(page, state, `the ${view}’s sidebar: five cells`, `/?view=${view}&artistId=${artistId}`, 1440, 900, filtersReady, 5, `${view}-1440x900`);
        }
      }
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid at 390 at the approved length and at about 300 characters, measured', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    let reply = replyWith(records, APPROVED);
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    try {
      for (const [state, reason] of STATES) {
        reply = replyWith(records, reason);
        for (const view of ['table', 'grid'] as const) {
          await cellHost(page, state, `the ${view}’s band, a coarse pointer: five cells`, `/?view=${view}&artistId=${artistId}`, 390, 844, filtersReady, 5, `${view}-390x844`);
        }
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    const row = (l: Line) => {
      const first = l.m[0];
      const heights = l.m.map((x) => x.hostHeight);
      const clipped = l.m.map((x) => x.clippedBy).filter((x): x is string => x !== null);
      return `| ${l.host} | ${l.window} | ${l.state} | ${first?.chars ?? '—'} | ${first?.lines ?? '—'} | ${first?.reasonHeight ?? '—'} | ${heights.length === 1 ? heights[0] : `${Math.min(...heights)} to ${Math.max(...heights)} (${heights.length} cells)`} | ${l.m.some((x) => x.overflowX) ? 'yes' : 'no'} | ${clipped.length === 0 ? 'no' : clipped[0]} | ${l.m.every((x) => x.inView) ? 'yes' : `no, ${l.m.every((x) => x.reachable) ? 'reached by scrolling' : 'NOT reachable by scrolling'}`}: bottom ${l.m.map((x) => x.bottom).join(', ')} in a window ${first?.windowHeight ?? '—'} tall | ${l.file} |`;
    };
    /* The growth, host by host: the long reason's host height less the approved one's, so the number is a difference the page drew, not an estimate. */
    const growth = results
      .filter((l) => l.state === 'approved')
      .map((a) => {
        const b = results.find((l) => l.state === 'long' && l.host === a.host && l.window === a.window);
        const ha = a.m[0]?.hostHeight ?? Number.NaN;
        const hb = b?.m[0]?.hostHeight ?? Number.NaN;
        return `| ${a.host} | ${a.window} | ${a.m[0]?.lines ?? '—'} → ${b?.m[0]?.lines ?? '—'} | ${ha} → ${hb} | ${Math.round((hb - ha) * 10) / 10} |`;
      });
    const lines = [
      `# pick-reasons-300 · the layout's tolerance of a reason of ${[...LONG].length} characters against the approved ${[...APPROVED].length}, one capture per host (the coordinator, 18 Nov), captured ${new Date().toISOString().slice(0, 10)}`,
      '',
      '**Every record is seeded and every reply is stubbed; the reasons are this capture\'s sentences, not the model\'s.** The pick\'s schema puts no',
      `bound on a reason, and Adam approved 3a against reasons of 91 to 108 characters. Each host is captured twice: at ${[...APPROVED].length} characters, the longest`,
      `reason he approved, and at ${[...LONG].length}, about three times that, given to every answer so the five-cell hosts show five stacked. Measured on the`,
      'page, not read off the picture: the reason\'s lines are its height over its line height; the host is the cell (`[data-pick-answer]`) or the',
      'pulled record\'s panel; "runs wider" is the text\'s scroll width past its box; "clipped by" names the nearest ancestor with a hiding overflow',
      'whose box does not contain the reason; "in view" is the reason\'s bottom inside the window with no scrolling, which the sidebars\' stacks',
      'of five fail at either length, so the comparison between the two states is the finding there. From the production build locally (E2E_SERVER=build).',
      '',
      '| host | window | state | reason chars | lines | reason height | host height | runs wider | clipped by | in view | file |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...results.map(row),
      '',
      '## The growth, approved → long',
      '',
      '| host | window | lines | host height | grows by |',
      '|---|---|---|---|---|',
      ...growth,
      '',
      'A long row that reads no, no and the same in-view answer as its approved row is the layout growing and wrapping whole; anything else is the',
      'number the coordinator asked for.',
      '',
    ];
    writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`);
    console.log(results.map(row).join('\n'));
  });
});
