import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { HIT_FLOOR, HIT_PAST, pointerIs, readReach, underFloor } from '../hit-area';
import { wholePage } from '../whole-page';
import { login } from './login';

/**
 * Step 129, what the handoff asks to be reported: "each of the 19 fields'
 * hit height at 390 and 768", "the cloud's height at 320, 390 and 768",
 * and the count meeting 44, N of N where N is 27 plus one per genre and
 * tag. A real record's edit form on the real collection, under each
 * pointer, so what a finger is given is beside what a mouse keeps.
 *
 * Read-only. Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'form-129');
const FIELDS = ['title', 'artistId', 'catalogNumber', 'matrixRunout', 'labelId', 'formatId', 'releaseYear', 'conditionMedia', 'conditionSleeve', 'purchasePrice', 'purchaseDate', 'storeId', 'countryPressed', 'yearPressed', 'pressingPlant', 'vinylWeightGrams', 'colorVariant', 'isReissue', 'notes'];

test('the record form’s fields, chips and count, under each pointer, at 320, 390 and 768', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const md = ['# The record form under each pointer, on the real collection', '', `Read-only: a real record’s edit form, desktop Chromium at each width, touch on for the coarse pointer and off for the fine. “Hit” is the rows of pixels down a field’s middle on which a tap reaches it, its label counted; a field whose own box is ${HIT_FLOOR} meets the floor by its box.`, ''];
  const counts = ['| pointer | window | page height | controls | chips | meets 44 | under 44 | past 9 | genres’ cloud | tags’ cloud | a label’s words from its row’s top |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const hits: Record<string, Record<string, string>> = {};
  for (const pointer of ['coarse', 'fine'] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    await login(page);
    if ((await pointerIs(page)) !== pointer) throw new Error(`the page was to have a ${pointer} pointer and has ${await pointerIs(page)}`);
    await page.goto('/?view=table');
    await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
    const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
    const editPath = `/records/${href.split('/').pop() ?? ''}/edit`;
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(editPath);
      await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      const reach = await readReach(page);
      const m = await page.evaluate((ids) => {
        const r1 = (n: number) => Math.round(n * 10) / 10;
        const clouds = Array.from(document.querySelectorAll('main fieldset')).filter((f) => f.querySelector('input.sr-only') !== null).map((f) => r1((f.firstElementChild?.nextElementSibling ?? f).getBoundingClientRect().height));
        const label = document.querySelector('label[for="title"]') as HTMLElement;
        const words = document.createRange();
        words.selectNodeContents(label);
        return { clouds, chips: document.querySelectorAll('main fieldset label input.sr-only').length, words: r1(words.getBoundingClientRect().top - (label.parentElement as HTMLElement).getBoundingClientRect().top), height: document.documentElement.scrollHeight, names: ids.map((id) => { const el = document.getElementById(id) as HTMLElement; return [id, (el.closest('label')?.textContent ?? '').trim() || (el as HTMLInputElement).placeholder || id, r1(el.getBoundingClientRect().height)] as const; }) };
      }, FIELDS);
      const under = underFloor(reach);
      counts.push(`| ${pointer} | ${width} | ${m.height} | ${reach.length} | ${m.chips} | **${reach.length - under.length}** | ${under.length} | ${reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).length} | ${m.clouds[0] ?? '—'} | ${m.clouds[1] ?? '—'} | ${m.words} |`);
      /* A field is found in the reading by the name the reader gives it; two grades share one and are told apart by order. */
      const fields = reach.filter((r) => r.kind === 'input' || r.kind === 'select' || r.kind === 'textarea').filter((r) => !/^Chip|^\s*$/.test(r.name));
      const byOrder = fields.filter((r) => m.names.some(([id, name]) => r.name === name || r.name === id) || r.kind !== 'input');
      FIELDS.forEach((id, index) => {
        const drawn = m.names[index]?.[2] ?? 0;
        const read = byOrder[index];
        (hits[id] ??= {})[`${pointer} ${width}`] = read === undefined ? '?' : `${Math.max(read.tall, 0)}${read.tall >= 80 ? '+' : ''} (drawn ${drawn})`;
      });
      await wholePage(page, join(OUT, `record-form-edit-w${width}-${pointer}-pointer-h${m.height}-meets${reach.length - under.length}of${reach.length}.png`));
    }
    await context.close();
  }
  const columns = ['coarse 390', 'coarse 768', 'fine 390', 'fine 768'];
  md.push(...counts, '', '## Each field’s hit height', '', 'The reading stops at 80 rows, so 80+ is at least that.', '', `| field | ${columns.join(' | ')} |`, `|---|${columns.map(() => '---').join('|')}|`, ...FIELDS.map((id) => `| ${id} | ${columns.map((column) => hits[id]?.[column] ?? '?').join(' | ')} |`));
  writeFileSync(join(OUT, 'form-129.md'), `${md.join('\n')}\n`);
});
