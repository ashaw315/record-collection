import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { HIT_FLOOR, pointerIs, readReach, underFloor, type Reach } from '../hit-area';
import { readSeventeen } from '../seventeen';
import { login } from '../sign-in';

registerCleanup();

/**
 * **The whole app's count under a coarse pointer: every control under 44,
 * by screen.** The floor is a rule about the app ("the 44 floor applies
 * where the pointer is coarse") and the five screens were a work split, so
 * what is left is counted once, everywhere, and not found a screen at a
 * time.
 *
 * Every route, and each state of one that this tool knows how to open (the
 * menu, a filter's panel, the sleeve, the shelf's panel, + New), at 390 and
 * 1280 with touch on: a phone, and a tablet or a touchscreen laptop, which
 * is coarse at any width. The header is read once a width and left out of
 * each screen's own count, so its controls are not counted on every row.
 *
 * On the test database: a record's page and look up's results are not
 * opened on the real collection. So the COUNTS are the fixtures' (seventeen
 * records, six genres), and the KINDS of control under 44 are the app's.
 * A state that would not open is a row that says so, not a row left out.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = process.env.FLOOR_OUT ?? join('docs', 'captures', 'floor-count');
const HEADER = 'header[data-app-nav]';
/* The no-JavaScript Apply beside the sort (`WallRail.tsx`): not drawn, so not a finger's; a chip's box is not drawn either but is its label's, and is not a button. */
const UNDRAWN = 'button.sr-only';

type Row = { screen: string; width: number; reach: Reach[] | null; why?: string };

function kinds(under: Reach[]): string {
  const tally = new Map<string, number>();
  for (const r of under) {
    const key = `${r.kind} “${r.name.replace(/\s+/g, ' ').replace(/[a-z0-9]{10,}$/i, '…').slice(0, 26)}” ${r.tall}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const all = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return all.slice(0, 10).map(([key, n]) => (n > 1 ? `${key} ×${n}` : key)).join('; ') + (all.length > 10 ? `; and ${all.length - 10} more kinds` : '');
}

test('every control under 44 under a coarse pointer, by screen, at 390 and 1280', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  const rows: Row[] = [];

  /* Signed out first: the one screen with no header. */
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ hasTouch: true, viewport: { width, height: 844 } });
    const page = await context.newPage();
    await page.goto('/login');
    await page.locator('form').first().waitFor();
    rows.push({ screen: 'Sign in', width, reach: await readReach(page, 'body') });
    await context.close();
  }

  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  await login(page);
  expect(await pointerIs(page)).toBe('coarse');
  const suffix = `fc${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Floor ${suffix}` });
  trackArtist(artist);
  const wanted = await post('/api/want-list', { title: `Floor Wanted ${suffix}`, artistId: artist });
  const got = await post('/api/want-list', { title: `Floor Got ${suffix}`, artistId: artist });
  expect((await page.request.post(`/api/want-list/${got}/acquire`, { data: { title: `Floor Got ${suffix}`, artistId: artist }, failOnStatusCode: false })).status()).toBe(201);
  const record = readSeventeen()[0]?.id ?? '';

  const settle = async (p: Page) => {
    await p.waitForLoadState('load');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(700);
  };
  const go = (path: string) => async () => { await page.goto(path); await settle(page); };
  const manage = (name: string) => async () => { await page.goto('/manage'); await settle(page); await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name }).click(); await page.waitForTimeout(400); };

  /* [screen, how to open it, what to read (the page less its header unless said), widths]. */
  const BODY = 'body';
  const states: Array<[string, () => Promise<void>, string, number[]]> = [
    ['The header', go('/stats'), HEADER, [390, 1280]],
    ['The header, its menu open', async () => { await page.goto('/stats'); await settle(page); await page.locator(`${HEADER} button[aria-expanded]`).click(); await page.waitForTimeout(500); }, HEADER, [390]],
    ['Collection, table', go('/?view=table'), BODY, [390, 1280]],
    ['Collection, table, a filter open', async () => { await page.goto('/?view=table'); await settle(page); await page.locator('[data-filter-trigger]').first().click(); await page.waitForTimeout(500); }, BODY, [390, 1280]],
    ['Collection, grid', go('/?view=grid'), BODY, [390, 1280]],
    ['Collection, shelf', go('/?view=shelf'), BODY, [1280]],
    /* The pulled record's own controls alone: read with the page, this row counted the shelf's four a second time and the first total at 1280 was 164 for 160. */
    ['Collection, shelf, a record pulled: its panel and controls', async () => { await page.goto('/?view=shelf'); await settle(page); await page.locator('[data-seat] [data-spine]').first().click(); await page.getByTestId('record-panel').waitFor({ timeout: 15_000 }); await page.waitForTimeout(1_500); }, '[data-testid="record-chrome"]', [1280]],
    ['Wall overview', go('/wall/overview'), BODY, [390, 1280]],
    ['A record', go(`/records/${record}`), BODY, [390, 1280]],
    /* The sleeve covers the page, so it alone is read: the page's controls beneath it are not a finger's while it is open. */
    ['A record, its sleeve open', async () => { await page.goto(`/records/${record}`); await settle(page); await page.getByRole('button', { name: 'Open the sleeve' }).click(); await page.waitForTimeout(1_500); }, '[data-sleeve-modal]', [390, 1280]],
    ['Record form, new, at rest', go('/records/new'), BODY, [390, 1280]],
    ['Record form, editing', go(`/records/${record}/edit`), BODY, [390, 1280]],
    ['Look up, at rest', go('/lookup'), BODY, [390, 1280]],
    ['Want list', go('/want-list'), BODY, [390, 1280]],
    ['Want list, acquired', go('/want-list?acquired=true'), BODY, [390, 1280]],
    ['Want list, a new item’s form', go('/want-list/new'), BODY, [390, 1280]],
    ['Want list, an item', go(`/want-list/${wanted}`), BODY, [390, 1280]],
    ['Want list, an item’s edit form', go(`/want-list/${wanted}/edit`), BODY, [390, 1280]],
    ['Suggestions', go('/suggestions'), BODY, [390, 1280]],
    ['Stats', go('/stats'), BODY, [390, 1280]],
    ...['Artists', 'Genres', 'Labels', 'Formats', 'Stores', 'Tags'].map((name): [string, () => Promise<void>, string, number[]] => [`Manage, ${name}`, manage(name), BODY, [390, 1280]]),
    ['Not found', go(`/records/00000000-0000-4000-8000-000000000000`), BODY, [390, 1280]],
  ];

  for (const width of [390, 1280]) for (const [screen, open, within, widths] of states) {
    if (!widths.includes(width)) continue;
    await page.setViewportSize({ width, height: 844 });
    try {
      await open();
      rows.push({ screen, width, reach: await readReach(page, within, within === BODY ? `${HEADER}, ${UNDRAWN}` : UNDRAWN) });
    } catch (error) {
      rows.push({ screen, width, reach: null, why: String(error).split('\n')[0]?.slice(0, 160) });
    }
  }
  await context.close();

  /*
    Two measurements, stated apart (the coordinator, 12 Oct): under 44 DOWN,
    the rows of pixels a tap has down a control's middle, and under 44
    ACROSS, the pixels it has across it. "Nothing under 44" was true of the
    first and was being read as both.
  */
  const across = (reach: Reach[]) => reach.filter((r) => r.wide < HIT_FLOOR);
  const acrossKinds = (reach: Reach[]) => {
    const tally = new Map<string, number>();
    for (const r of reach) { const key = `${r.kind} “${r.name.replace(/\s+/g, ' ').replace(/[a-z0-9]{10,}$/i, '…').slice(0, 22)}” ${r.wide}`; tally.set(key, (tally.get(key) ?? 0) + 1); }
    const all = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    return all.slice(0, 8).map(([key, n]) => (n > 1 ? `${key} ×${n}` : key)).join('; ') + (all.length > 8 ? `; and ${all.length - 8} more kinds` : '');
  };
  const md = ['# Every control under 44 under a coarse pointer, by screen: down, and across', '', `The test database (seventeen records), desktop Chromium with touch on, at 390 and 1280. “Under 44 down” is a control whose own box is under ${HIT_FLOOR} tall and that a tap reaches over fewer than ${HIT_FLOOR} rows of pixels down its middle. “Under 44 across” is one a tap reaches over fewer than ${HIT_FLOOR} pixels across its middle, its drawn width and whatever reaches it from either side. The header is its own row and is left out of each screen’s. The counts are the fixtures’; the kinds are the app’s. Not here: the shared dialog (step 128, 3 of 3 down), look up’s results (step 125: five controls a card, held) and the pages under /wall/probe, which are tools.`, ''];
  for (const width of [390, 1280]) {
    md.push(`## At ${width}`, '', '| screen | controls | under 44 down | under 44 across | down: by kind and the rows a tap has | across: by kind and the pixels a tap has |', '|---|---|---|---|---|---|');
    let controls = 0;
    let short = 0;
    let narrow = 0;
    for (const row of rows.filter((each) => each.width === width)) {
      if (row.reach === null) { md.push(`| ${row.screen} | would not open | | | ${row.why ?? ''} | |`); continue; }
      const under = underFloor(row.reach);
      const thin = across(row.reach);
      controls += row.reach.length;
      short += under.length;
      narrow += thin.length;
      md.push(`| ${row.screen} | ${row.reach.length} | **${under.length}** | **${thin.length}** | ${kinds(under)} | ${acrossKinds(thin)} |`);
    }
    md.push(`| **All, at ${width}** | ${controls} | **${short}** | **${narrow}** | | |`, '');
  }
  writeFileSync(join(OUT, 'floor-count.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'floor-count.json'), JSON.stringify(rows.map((row) => ({ screen: row.screen, width: row.width, why: row.why, under: row.reach === null ? null : underFloor(row.reach).map((r) => ({ name: r.name, kind: r.kind, height: r.height, tall: r.tall })), across: row.reach === null ? null : row.reach.filter((r) => r.wide < HIT_FLOOR).map((r) => ({ name: r.name, kind: r.kind, width: r.width, wide: r.wide })), controls: row.reach?.length ?? null })), null, 1));
});
