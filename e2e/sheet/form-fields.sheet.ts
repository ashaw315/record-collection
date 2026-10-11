import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * For Design, before the record form's hit areas are built (11 Oct): the
 * two things its ruling waits on, measured on a real record's edit form,
 * read-only, nothing pressed.
 *
 * 1. The chips (genres, tags): each chip's box, the gap to the next chip
 *    on its line and the gap between lines. An overlay 44 tall on a chip
 *    of 26 takes 9 above and below, so it needs 18 between lines.
 * 2. The fields: for each, whether it has a label a tap sends to it,
 *    where that label stands (above, beside), how wide it is against the
 *    field, and the strip between them that reaches neither.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'form-fields');

test('the record form’s chips and its fields’ labels, at 320, 390 and 768', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
  const editPath = `/records/${href.split('/').pop() ?? ''}/edit`;

  const md = ['# The record form’s chips and its fields’ labels, on the real collection', '', 'Read-only: a real record’s edit form, desktop Chromium at each width, nothing pressed.', ''];
  const all: Record<string, unknown> = {};
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(editPath);
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const round = (v: number) => Math.round(v * 10) / 10;
      const groups = Array.from(document.querySelectorAll('main fieldset')).filter((f) => f.querySelector('input[type=checkbox].sr-only') !== null).map((fieldset) => {
        const chips = Array.from(fieldset.querySelectorAll('label')).map((label) => label.getBoundingClientRect());
        const lines: DOMRect[][] = [];
        for (const chip of chips) { const line = lines.find((each) => Math.abs((each[0]?.top ?? 0) - chip.top) < 2); if (line === undefined) lines.push([chip]); else line.push(chip); }
        const across = lines.flatMap((line) => line.slice(1).map((chip, index) => round(chip.left - (line[index]?.right ?? 0))));
        const down = lines.slice(1).map((line, index) => round((line[0]?.top ?? 0) - (lines[index]?.[0]?.bottom ?? 0)));
        const tally = (values: number[]) => { const t: Record<string, number> = {}; for (const v of values) t[String(v)] = (t[String(v)] ?? 0) + 1; return t; };
        return { legend: (fieldset.querySelector('legend')?.textContent ?? '').trim(), chips: chips.length, lines: lines.length, perLine: lines.map((line) => line.length), heights: tally(chips.map((c) => round(c.height))), widths: { narrowest: round(Math.min(...chips.map((c) => c.width))), widest: round(Math.max(...chips.map((c) => c.width))) }, across: tally(across), down: tally(down), endOfLine: lines.map((line) => round((fieldset.getBoundingClientRect().right) - (line[line.length - 1]?.right ?? 0))) };
      });
      const fields = Array.from(document.querySelectorAll<HTMLElement>('main input:not([type=hidden]):not(.sr-only), main select, main textarea')).filter((el) => el.getClientRects().length > 0 && el.checkVisibility()).map((el) => {
        const box = el.getBoundingClientRect();
        const tied = el.id === '' ? null : document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`);
        const wrapping = el.closest('label');
        const label = tied ?? wrapping;
        const lb = label?.getBoundingClientRect() ?? null;
        const where = lb === null ? 'none' : wrapping !== null && tied === null ? 'wraps the field' : lb.bottom <= box.top + 1 ? 'above' : lb.right <= box.left + 1 ? 'beside, left' : 'overlapping';
        return { field: el.id || (el.getAttribute('aria-label') ?? el.tagName.toLowerCase()), kind: el.tagName.toLowerCase() + (el instanceof HTMLInputElement ? `[${el.type}]` : ''), width: round(box.width), height: round(box.height), label: label === null ? null : (label.textContent ?? '').trim().slice(0, 28), labelIs: label === null ? 'none' : `${label.tagName.toLowerCase()}${tied !== null ? ' for' : ''}${label.classList.contains('sr-only') ? ', not drawn' : ''}`, where, labelWidth: lb === null ? null : round(lb.width), labelHeight: lb === null ? null : round(lb.height), strip: lb === null || where !== 'above' ? null : round(box.top - lb.bottom) };
      });
      /* The Reissue box: what stands above and below it, for whether an overlay of 44 on a box of 16 has its 14 either side. */
      const box = document.querySelector<HTMLElement>('#isReissue');
      const reissue = (() => {
        if (box === null) return null;
        const b = box.getBoundingClientRect();
        const wrap = box.closest('label')?.getBoundingClientRect() ?? null;
        const row = box.closest('.border-b')?.getBoundingClientRect() ?? null;
        const controls = Array.from(document.querySelectorAll<HTMLElement>('main input:not([type=hidden]):not(.sr-only), main select, main textarea, main button, main a, main summary')).filter((el) => el !== box && el.getClientRects().length > 0 && el.checkVisibility());
        const named = (el: HTMLElement) => `${el.tagName.toLowerCase()} ${el.id || (el.textContent ?? '').trim().slice(0, 20)}`;
        const above = controls.filter((el) => el.getBoundingClientRect().bottom <= b.top).sort((p, q) => q.getBoundingClientRect().bottom - p.getBoundingClientRect().bottom)[0];
        const below = controls.filter((el) => el.getBoundingClientRect().top >= b.bottom).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top)[0];
        const tied = document.querySelector<HTMLElement>('label[for="isReissue"]')?.getBoundingClientRect() ?? null;
        return { box: `${round(b.width)} × ${round(b.height)}`, wrap: wrap === null ? null : `${round(wrap.width)} × ${round(wrap.height)}`, row: row === null ? null : `${round(row.height)} tall, the box ${round(b.top - row.top)} from its top and ${round(row.bottom - b.bottom)} from its bottom`, above: above === undefined ? null : `${named(above)}, its bottom ${round(b.top - above.getBoundingClientRect().bottom)} above the box`, below: below === undefined ? null : `${named(below)}, its top ${round(below.getBoundingClientRect().top - b.bottom)} below the box`, rowLabel: tied === null ? null : `"Reissue", its bottom ${round(b.top - tied.bottom)} above the box, or ${round(b.left - tied.right)} to its left` };
      })();
      const others = Array.from(document.querySelectorAll<HTMLElement>('main a, main button, main summary')).filter((el) => el.getClientRects().length > 0 && el.checkVisibility()).map((el) => { const b = el.getBoundingClientRect(); return { name: (el.textContent ?? '').trim().slice(0, 28), kind: el.tagName.toLowerCase(), width: round(b.width), height: round(b.height) }; });
      return { groups, fields, others, reissue };
    });
    all[width] = m;
    md.push(`## At ${width}`, '', '### Chips', '', '| group | chips | lines | chip heights | chip widths | gap across, on a line | gap down, between lines | room after a line’s last chip |', '|---|---|---|---|---|---|---|---|');
    for (const g of m.groups) md.push(`| ${g.legend} | ${g.chips} | ${g.lines} (${g.perLine.join(', ')}) | ${Object.entries(g.heights).map(([k, n]) => `${k} ×${n}`).join(', ')} | ${g.widths.narrowest} to ${g.widths.widest} | ${Object.entries(g.across).map(([k, n]) => `${k} ×${n}`).join(', ')} | ${Object.entries(g.down).map(([k, n]) => `${k} ×${n}`).join(', ')} | ${Math.min(...g.endOfLine)} to ${Math.max(...g.endOfLine)} |`);
    md.push('', '### Fields', '', '| field | kind | box | its label | label is | label stands | label box | strip between |', '|---|---|---|---|---|---|---|---|');
    for (const f of m.fields) md.push(`| ${f.field} | ${f.kind} | ${f.width} × ${f.height} | ${f.label ?? '**none**'} | ${f.labelIs} | ${f.where} | ${f.labelWidth === null ? '' : `${f.labelWidth} × ${f.labelHeight}`} | ${f.strip ?? ''} |`);
    if (m.reissue !== null) md.push('', '### The Reissue box', '', `The box is ${m.reissue.box}, inside its own label of ${m.reissue.wrap}, in a row ${m.reissue.row}. The nearest control above: ${m.reissue.above}. The nearest below: ${m.reissue.below}. The row’s label: ${m.reissue.rowLabel}.`);
    md.push('', '### Links, buttons and the disclosure', '', '| control | kind | box |', '|---|---|---|');
    for (const o of m.others) md.push(`| ${o.name} | ${o.kind} | ${o.width} × ${o.height} |`);
    md.push('');
    await page.screenshot({ path: join(OUT, `record-form-edit-w${width}.png`), fullPage: true });
    const cloud = page.locator('main fieldset').filter({ has: page.locator('input[type=checkbox].sr-only') }).first();
    await cloud.scrollIntoViewIfNeeded();
    await cloud.screenshot({ path: join(OUT, `chips-w${width}-lines${m.groups[0]?.lines ?? 0}-down${Object.keys(m.groups[0]?.down ?? {}).join('-') || 'none'}.png`) });
  }
  writeFileSync(join(OUT, 'form-fields.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'form-fields.json'), JSON.stringify(all, null, 1));
});
