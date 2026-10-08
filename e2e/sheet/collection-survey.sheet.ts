import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { GRID_FORK } from '../../src/app/records/[id]/band-geometry';
import { login } from './login';

/**
 * **The Collection screen's table and grid views as built, measured for the
 * table and grid target (§T).** Read-only, from the real collection. Nothing
 * here asserts: it is the design's raw material, written as a JSON file and
 * a Markdown table beside captures at three widths.
 *
 * Per view and width: the page's width against the window's; every text
 * size with what carries it; every corner radius with what has it; every
 * control with its size; each chip row's sideways scroll, and what wrapping
 * it would cost at 44 a line, the hit area's floor, not the type's line;
 * the table's columns that are drawn; and the Sort select's orders.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'collection-survey');
const WIDTHS = [390, 320, GRID_FORK];
const HEIGHT = 844;

test('the table and grid views, measured at three widths', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const all: Array<Record<string, unknown>> = [];
  for (const view of ['table', 'grid']) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(`/?view=${view}`);
    await page.locator('#collection-sort').waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const round = (v: number) => Math.round(v * 10) / 10;
      const what = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        const role = el.closest('th') ? 'table heading' : el.closest('td') ? 'table cell' : el.closest('button') ? 'button' : el.closest('a') ? 'link' : el.closest('select') ? 'select' : el.closest('label') ? 'label' : tag;
        return role;
      };
      /* Type: every element that itself holds text, by size and face, with what it is and a sample. */
      const type: Record<string, { count: number; carries: Record<string, number>; sample: string }> = {};
      for (const el of Array.from(main.querySelectorAll('*')).filter((e) => shown(e) && Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))) {
        const cs = getComputedStyle(el);
        const key = `${cs.fontSize} ${/mono/i.test(cs.fontFamily) ? 'mono' : 'sans'} ${cs.fontWeight}${cs.textTransform === 'uppercase' ? ' uppercase' : ''}`;
        type[key] ??= { count: 0, carries: {}, sample: (el.textContent ?? '').trim().slice(0, 28) };
        type[key].count += 1;
        const w = what(el); type[key].carries[w] = (type[key].carries[w] ?? 0) + 1;
      }
      const radii: Record<string, Record<string, number>> = {};
      for (const el of Array.from(main.querySelectorAll('*')).filter(shown)) {
        const r = getComputedStyle(el).borderTopLeftRadius;
        if (r === '0px') continue;
        radii[r] ??= {};
        const w = `${what(el)}${el.tagName === 'INPUT' ? ' (input)' : ''}`; radii[r][w] = (radii[r][w] ?? 0) + 1;
      }
      const controls = Array.from(main.querySelectorAll('button, a, select, input')).filter(shown).map((el) => { const b = el.getBoundingClientRect(); return { kind: el.tagName.toLowerCase(), name: ((el.textContent ?? '').trim() || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || '').slice(0, 26), width: round(b.width), height: round(b.height) }; });
      /* Chip rows: a row is a labelled run of filter buttons. Its scroll, and what wrapping it would cost. */
      const rows = Array.from(main.querySelectorAll('*')).filter((e) => shown(e) && /auto|scroll/.test(getComputedStyle(e).overflowX) && e.querySelectorAll('button').length > 1).map((row) => {
        const chips = Array.from(row.querySelectorAll('button')).filter(shown).map((c) => c.getBoundingClientRect().width);
        const cs = getComputedStyle(row); const gap = parseFloat(cs.columnGap) || 0;
        const label = ((row.previousElementSibling ?? row.parentElement?.firstElementChild)?.textContent ?? '').trim().slice(0, 14);
        const room = row.clientWidth;
        let lines = 1; let used = 0;
        for (const w of chips) { if (used > 0 && used + gap + w > room) { lines += 1; used = w; } else used += (used > 0 ? gap : 0) + w; }
        return { label, chips: chips.length, room: round(room), contents: round(row.scrollWidth), scrollsBy: round(row.scrollWidth - row.clientWidth), heightNow: round(row.getBoundingClientRect().height), gap, linesIfWrapped: lines, heightIfWrappedAt44ALine: lines * 44 + (lines - 1) * gap };
      });
      const columns = Array.from(main.querySelectorAll('th')).map((th) => ({ name: (th.textContent ?? '').trim(), drawn: shown(th) && th.getBoundingClientRect().width > 0, width: round(th.getBoundingClientRect().width) }));
      const sort = Array.from((document.querySelector('#collection-sort') as HTMLSelectElement).options).map((o) => ({ value: o.value, text: (o.textContent ?? '').trim() }));
      const viewSwitch = Array.from(document.querySelectorAll('[role="group"][aria-label="View"]')).map((g) => ({ drawn: shown(g), buttons: Array.from(g.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()) }));
      return { window: window.innerWidth, pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, type, radii, controls, chipRows: rows, columns, sort, viewSwitch };
    });
    const file = `survey-${view}-${String(width).padStart(4, '0')}x${HEIGHT}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    all.push({ view, width, file, ...m });
  }
  writeFileSync(join(OUT, 'survey.json'), `${JSON.stringify(all, null, 1)}\n`);

  const md: string[] = ['# The table and grid views as built', '', 'Measured from the build on the real collection, read-only. Generated by `e2e/sheet/collection-survey.sheet.ts`; the full figures are in `survey.json`.', ''];
  md.push('## Page width', '', '| view | window | page | page height |', '|---|---|---|---|');
  for (const r of all) md.push(`| ${r.view} | ${r.window} | ${r.pageWidth} | ${r.pageHeight} |`);
  for (const r of all) {
    md.push('', `## ${r.view} at ${r.width}`, '', `Capture: \`${r.file}\``, '', '### Type', '', '| size, face, weight | elements | carries | first seen as |', '|---|---|---|---|');
    for (const [k, v] of Object.entries(r.type as Record<string, { count: number; carries: Record<string, number>; sample: string }>).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))) md.push(`| ${k} | ${v.count} | ${Object.entries(v.carries).map(([w, n]) => `${w} ${n}`).join(', ')} | ${v.sample.replace(/\|/g, '/')} |`);
    md.push('', '### Corner radii', '', '| radius | on |', '|---|---|');
    for (const [k, v] of Object.entries(r.radii as Record<string, Record<string, number>>)) md.push(`| ${k} | ${Object.entries(v).map(([w, n]) => `${w} ${n}`).join(', ')} |`);
    const controls = r.controls as Array<{ kind: string; name: string; width: number; height: number }>;
    md.push('', `### Controls (${controls.length}, ${controls.filter((c) => c.height < 44).length} under 44 tall)`, '', '| control | name | width | height |', '|---|---|---|---|');
    for (const c of controls) md.push(`| ${c.kind} | ${c.name.replace(/\|/g, '/')} | ${c.width} | ${c.height} |`);
    md.push('', '### Chip rows', '', '| row | chips | room | contents | scrolls sideways by | height now | lines if wrapped | height if wrapped at 44 a line |', '|---|---|---|---|---|---|---|---|');
    for (const c of r.chipRows as Array<Record<string, number | string>>) md.push(`| ${c.label} | ${c.chips} | ${c.room} | ${c.contents} | ${c.scrollsBy} | ${c.heightNow} | ${c.linesIfWrapped} | ${c.heightIfWrappedAt44ALine} |`);
    md.push('', '### Columns and sort orders', '', `Columns drawn: ${(r.columns as Array<{ name: string; drawn: boolean; width: number }>).filter((c) => c.drawn).map((c) => `${c.name} (${c.width})`).join(', ') || 'none (not a table)'}`, '', `Columns in the markup and not drawn: ${(r.columns as Array<{ name: string; drawn: boolean }>).filter((c) => !c.drawn).map((c) => c.name).join(', ') || 'none'}`, '', `Sort orders offered: ${(r.sort as Array<{ value: string; text: string }>).map((o) => `${o.text} [${o.value || 'default'}]`).join(', ')}`, '', `View switch: ${JSON.stringify(r.viewSwitch)}`);
  }
  writeFileSync(join(OUT, 'survey.md'), `${md.join('\n')}\n`);
});
