import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { GRID_FORK } from '../../src/app/records/[id]/band-geometry';
import { login } from './login';

/**
 * **Five screens as built, measured for their design pass: the want list,
 * look up, stats, manage and the record form.** Read-only, from the real
 * collection, by the Collection survey's method
 * (`collection-survey.sheet.ts`) with its corrections applied. Nothing here
 * asserts: it is the design's raw material, a JSON file and a Markdown
 * table beside full-page captures at three widths.
 *
 * Per screen and width: the page's width against the window's; every text
 * size with what carries it; every colour text is set in and every fill;
 * every corner radius; every control with its drawn size AND its hit
 * area, since the floor is the area a finger reaches and an overlay can
 * enlarge it past the box (the Collection survey measured the box only,
 * and was corrected); anything that scrolls sideways inside itself; and
 * each table's columns.
 *
 * **Each screen is loaded and read, and nothing on it is pressed**, with
 * one exception: Manage's section names, which change what the client
 * shows and send nothing. Look up is read empty, because a search there
 * calls Discogs and no test makes a live external call. So Look up's
 * results, the suggestions page, the want list's own forms and a want-list
 * item's page are NOT surveyed, and the report says so.
 *
 * **`SURVEY_SET=step103` reads a wider set, for step 103's before and
 * after:** the five screens; the pages the survey left out that load
 * without an external call (suggestions, the want list's new form, a
 * want-list item's page and its edit form); the sign-in page, signed out;
 * and the ruled surfaces that load without one (shelf, table, grid), so a
 * change that reaches them shows in the diff of the two readings. Look
 * up's results stay out: only a search draws them, and a search calls
 * Discogs.
 */
const WIDE = process.env.SURVEY_SET === 'step103';
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'screens-survey');
const WIDTHS = [390, 320, GRID_FORK];
const HEIGHT = 844;

type Measure = Awaited<ReturnType<typeof measure>>;

async function settle(page: Page) {
  /* Manage has no main element (a finding, reported in the survey), so the heading is waited for where there is none. */
  await page.locator('main, h1').first().waitFor({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

const measure = (page: Page) =>
  page.evaluate(() => {
    const hasMain = document.querySelector('main') !== null;
    /* Where a screen has no main element, everything outside the app's header is read. */
    const main = (document.querySelector('main') ?? document.body) as HTMLElement;
    /*
      `checkVisibility`, not client rects: what lies inside a closed
      disclosure still has rects in this browser, and the first run of this
      sheet counted the new form's 59 folded-away controls as drawn (seen
      against its own capture, 8 Oct).
    */
    const shown = (el: Element) => el.closest('[data-app-nav], nextjs-portal, script, style') === null && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const round = (v: number) => Math.round(v * 10) / 10;
    const what = (el: Element) => (el.closest('th') ? 'table heading' : el.closest('td') ? 'table cell' : el.closest('button') ? 'button' : el.closest('a') ? 'link' : el.closest('select') ? 'select' : el.closest('label') ? 'label' : /^h[1-6]$/i.test(el.tagName) ? 'heading' : el.tagName.toLowerCase());
    const bump = (into: Record<string, Record<string, number>>, key: string, w: string) => { into[key] ??= {}; into[key][w] = (into[key][w] ?? 0) + 1; };

    /* Type and its colour: every element that itself holds text. */
    const type: Record<string, { count: number; carries: Record<string, number>; sample: string }> = {};
    const textColours: Record<string, Record<string, number>> = {};
    for (const el of Array.from(main.querySelectorAll('*')).filter((e) => shown(e) && Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))) {
      const cs = getComputedStyle(el);
      const key = `${cs.fontSize} ${/mono/i.test(cs.fontFamily) ? 'mono' : 'sans'} ${cs.fontWeight}${cs.textTransform === 'uppercase' ? ' uppercase' : ''}${cs.fontStyle === 'italic' ? ' italic' : ''}`;
      type[key] ??= { count: 0, carries: {}, sample: (el.textContent ?? '').trim().slice(0, 28) };
      type[key].count += 1;
      type[key].carries[what(el)] = (type[key].carries[what(el)] ?? 0) + 1;
      bump(textColours, cs.color, what(el));
    }
    const fills: Record<string, Record<string, number>> = {};
    const radii: Record<string, Record<string, number>> = {};
    const borders: Record<string, Record<string, number>> = {};
    const sideways: Array<{ what: string; room: number; contents: number }> = [];
    for (const el of Array.from(main.querySelectorAll('*')).filter(shown)) {
      const cs = getComputedStyle(el);
      const tag = `${what(el)}${el.tagName === 'INPUT' ? ' (input)' : el.tagName === 'TEXTAREA' ? ' (textarea)' : ''}`;
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(fills, cs.backgroundColor, tag);
      if (cs.borderTopLeftRadius !== '0px') bump(radii, cs.borderTopLeftRadius, tag);
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        const w = cs[`border${side}Width`];
        if (w !== '0px' && cs[`border${side}Style`] !== 'none') bump(borders, `${w} ${cs[`border${side}Color`]}`, tag);
      }
      if (/auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) sideways.push({ what: `${tag} ${(el.getAttribute('aria-label') ?? el.className.toString().slice(0, 30))}`, room: el.clientWidth, contents: el.scrollWidth });
    }

    /* Controls: the drawn box, and the run of pixels down its middle that a tap would land on it. */
    const controls = Array.from(main.querySelectorAll<HTMLElement>('button, a, select, input:not([type=hidden]), textarea, summary')).filter(shown).map((el) => {
      const r = el.getBoundingClientRect();
      const before = window.scrollY;
      window.scrollTo(0, Math.max(0, r.top + r.height / 2 + before - 400));
      const dy = window.scrollY - before;
      const x = r.left + Math.min(r.width / 2, 20);
      const mid = r.top + r.height / 2 - dy;
      let hit = 0;
      for (let y = Math.round(mid - 30); y <= Math.round(mid + 30); y += 1) { const at = document.elementFromPoint(x, y); if (at !== null && (at === el || el.contains(at) || (at.contains(el) && (at.tagName === 'A' || at.tagName === 'LABEL')))) hit += 1; }
      window.scrollTo(0, before);
      /* Past the window's edge, so reachable only by scrolling the page sideways: no hit area can be read there, and 0 would misstate it. */
      const off = x >= window.innerWidth || x < 0;
      return { off, kind: `${el.tagName.toLowerCase()}${el.tagName === 'INPUT' ? `[${(el as HTMLInputElement).type}]` : ''}`, name: ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.id || (el as HTMLInputElement).name || '').slice(0, 30), width: round(r.width), height: round(r.height), hit, disabled: (el as HTMLButtonElement).disabled === true };
    });
    const tables = Array.from(main.querySelectorAll('table')).filter(shown).map((t) => ({ rows: t.querySelectorAll('tbody tr').length, columns: Array.from(t.querySelectorAll('thead th')).map((th) => ({ name: (th.textContent ?? '').trim().slice(0, 20), drawn: shown(th) && th.getBoundingClientRect().width > 0, width: round(th.getBoundingClientRect().width) })), rowHeights: (() => { const tally: Record<string, number> = {}; for (const r of Array.from(t.querySelectorAll('tbody tr'))) { const h = String(round(r.getBoundingClientRect().height)); tally[h] = (tally[h] ?? 0) + 1; } return tally; })() }));
    const headings = Array.from(main.querySelectorAll('h1, h2, h3, h4')).filter(shown).map((h) => `${h.tagName.toLowerCase()} ${getComputedStyle(h).fontSize}: ${(h.textContent ?? '').trim().slice(0, 40)}`);
    const mainBox = main.getBoundingClientRect();
    const column = (() => { const first = Array.from(main.querySelectorAll('h1, h2, form, table, section')).find(shown); if (first === undefined) return null; const r = first.getBoundingClientRect(); return { left: round(r.left), right: round(window.innerWidth - r.right), width: round(r.width) }; })();
    return { hasMain, window: window.innerWidth, pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, mainLeft: round(mainBox.left), mainWidth: round(mainBox.width), column, body: getComputedStyle(document.body).backgroundColor, type, textColours, fills, radii, borders, sideways, controls, tables, headings };
  });

test('the want list, look up, stats, manage and the record form, measured at three widths', async ({ page, browser }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);

  /* A real record's form, for the edit state: the first row of the table, read and not changed. */
  await page.setViewportSize({ width: GRID_FORK, height: HEIGHT });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
  const id = href.split('/').pop() ?? '';
  const editPath = `/records/${id}/edit`;

  const screens: Array<{ screen: string; path: string; sections?: boolean }> = [
    { screen: 'want-list', path: '/want-list' },
    { screen: 'lookup', path: '/lookup' },
    { screen: 'stats', path: '/stats' },
    { screen: 'manage', path: '/manage', sections: true },
    { screen: 'record-form-new', path: '/records/new' },
    { screen: 'record-form-edit', path: editPath },
  ];
  const anonymous: string[] = [];
  if (WIDE) {
    screens.push({ screen: 'suggestions', path: '/suggestions' }, { screen: 'want-list-new', path: '/want-list/new' });
    /* A real want-list item, if the list has one: read and not changed. */
    await page.goto('/want-list');
    await settle(page);
    const item = await page.locator('main a[href^="/want-list/"]').evaluateAll((all) => all.map((a) => a.getAttribute('href') ?? '').find((h) => /^\/want-list\/[0-9a-f-]{36}$/.test(h)) ?? null);
    if (item !== null) screens.push({ screen: 'want-list-item', path: item }, { screen: 'want-list-item-edit', path: `${item}/edit` });
    screens.push({ screen: 'ruled-shelf', path: '/' }, { screen: 'ruled-table', path: '/?view=table' }, { screen: 'ruled-grid', path: '/?view=grid' });
    /*
      Not a record's page. Loaded under this config it asked Discogs for the market's prices, live, once a
      width (seen 9 Oct as three refused writes to `market_cache`), and no sheet should cause an external
      call. The record page's radii are read on seeded records by `radius-103.spec.ts` instead.
    */
    anonymous.push('/login');
  }

  const all: Array<{ screen: string; state: string; width: number; file: string } & Measure> = [];
  for (const s of screens) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(s.path);
    await settle(page);
    /* Manage's sections: the names beside the one marked current. Pressing one changes what is shown and sends nothing. */
    const names = page.locator('nav[aria-label="Resource"] button');
    const sections = s.sections === true ? await names.evaluateAll((all) => all.map((x) => (x.textContent ?? '').trim())) : [''];
    for (const [index, section] of sections.entries()) {
      if (section !== '') {
        await names.nth(index).click();
        await page.waitForTimeout(500);
      }
      const state = section === '' ? 'as loaded' : section;
      const file = `survey-${s.screen}${section === '' ? '' : `-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}-${String(width).padStart(4, '0')}x${HEIGHT}.png`;
      const m = await measure(page);
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      all.push({ screen: s.screen, state, width, file, ...m });
    }
  }
  /* The sign-in page, as someone signed out sees it: a second context with no session. */
  for (const path of anonymous) for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const out = await context.newPage();
    await out.goto(path);
    await settle(out);
    const file = `survey-login-${String(width).padStart(4, '0')}x${HEIGHT}.png`;
    const m = await measure(out);
    await out.screenshot({ path: join(OUT, file), fullPage: true });
    all.push({ screen: 'login', state: 'signed out', width, file, ...m });
    await context.close();
  }
  writeFileSync(join(OUT, 'survey.json'), `${JSON.stringify(all, null, 1)}\n`);

  const list = (o: Record<string, Record<string, number>>) => Object.entries(o).map(([k, v]) => `| ${k} | ${Object.values(v).reduce((a, b) => a + b, 0)} | ${Object.entries(v).map(([w, n]) => `${w} ${n}`).join(', ')} |`);
  const md: string[] = [WIDE ? '# The screens step 103 reaches, and the ruled surfaces beside them' : '# Five screens as built', '', 'Measured from the build on the real collection, read-only, nothing pressed but Manage’s section names. Generated by `e2e/sheet/screens-survey.sheet.ts`; the full figures are in `survey.json`.', '', WIDE ? '**Not read:** Look up’s results. Only a search draws them, and a search calls Discogs.' : '**Not surveyed:** Look up’s results (a search calls Discogs), the suggestions page, the want list’s own forms and a want-list item’s page.', ''];
  md.push('## Every screen at a glance', '', '| screen | state | window | page | page height | text sizes | text colours | fills | radii | controls | under 44 by hit | off the window’s edge | scrolls sideways |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of all) md.push(`| ${r.screen} | ${r.state} | ${r.window} | ${r.pageWidth} | ${r.pageHeight} | ${Object.keys(r.type).length} | ${Object.keys(r.textColours).length} | ${Object.keys(r.fills).length} | ${Object.keys(r.radii).length} | ${r.controls.length} | ${r.controls.filter((c) => !c.off && c.hit < 44).length} | ${r.controls.filter((c) => c.off).length} | ${r.sideways.length} |`);
  for (const r of all) {
    md.push('', `## ${r.screen}, ${r.state}, at ${r.width}`, '', `Capture: \`${r.file}\``, '', `${r.hasMain ? '' : '**This screen has no `main` element**, so everything outside the app’s header was read. '}Page ${r.pageWidth} wide in a window of ${r.window}, ${r.pageHeight} long. Main starts at ${r.mainLeft} and is ${r.mainWidth} wide${r.column === null ? '' : `; its first block is ${r.column.width} wide, ${r.column.left} from the left and ${r.column.right} from the right`}. Paper: ${r.body}.`, '', `Headings: ${r.headings.join('; ') || 'none'}`, '', '### Type', '', '| size, face, weight | elements | carries | first seen as |', '|---|---|---|---|');
    for (const [k, v] of Object.entries(r.type).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))) md.push(`| ${k} | ${v.count} | ${Object.entries(v.carries).map(([w, n]) => `${w} ${n}`).join(', ')} | ${v.sample.replace(/\|/g, '/')} |`);
    md.push('', '### Text colours', '', '| colour | elements | on |', '|---|---|---|', ...list(r.textColours));
    md.push('', '### Fills', '', '| colour | elements | on |', '|---|---|---|', ...list(r.fills));
    md.push('', '### Corner radii', '', '| radius | elements | on |', '|---|---|---|', ...list(r.radii));
    md.push('', '### Borders', '', '| width and colour | sides | on |', '|---|---|---|', ...list(r.borders));
    md.push('', `### Controls (${r.controls.length}; ${r.controls.filter((c) => c.height < 44).length} drawn under 44, ${r.controls.filter((c) => !c.off && c.hit < 44).length} under 44 by hit area, ${r.controls.filter((c) => c.off).length} past the window’s edge)`, '', '| control | name | width | height | hit | |', '|---|---|---|---|---|---|');
    for (const c of r.controls) md.push(`| ${c.kind} | ${c.name.replace(/\|/g, '/')} | ${c.width} | ${c.height} | ${c.off ? 'off the window' : c.hit} | ${c.disabled ? 'disabled' : ''} |`);
    md.push('', '### Tables', '');
    if (r.tables.length === 0) md.push('None.');
    for (const t of r.tables) md.push(`- ${t.rows} rows; drawn: ${t.columns.filter((c) => c.drawn).map((c) => `${c.name} (${c.width})`).join(', ') || 'no header'}; in the markup and not drawn: ${t.columns.filter((c) => !c.drawn).map((c) => c.name).join(', ') || 'none'}; row heights: ${Object.entries(t.rowHeights).map(([h, n]) => `${n} of ${h}`).join(', ')}`);
    md.push('', '### Scrolls sideways inside itself', '');
    if (r.sideways.length === 0) md.push('Nothing.');
    for (const sw of r.sideways) md.push(`- ${sw.what}: ${sw.contents} in ${sw.room}`);
  }
  writeFileSync(join(OUT, 'survey.md'), `${md.join('\n')}\n`);
});
