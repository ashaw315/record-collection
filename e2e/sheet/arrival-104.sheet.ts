import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { login } from './login';

/**
 * Step 104 on the real collection, read-only: where the near view arrives
 * under each genre's filter, and the shelf's sentence where nothing
 * matches.
 *
 * "Test on the real collection with a genre of few records far from the
 * first seat, staged and confirmed before reading." Staged: every record's
 * place in the collection's order is read from the UNFILTERED wall first.
 * Confirmed: a genre is only counted as a case when its first match, by
 * that order, is NOT in the region as the unfiltered wall opens. Then the
 * reading: under the filter, is that record in the region. Every genre is
 * read and tabled; the one captured is the genre of fewest records whose
 * first match sits furthest along.
 *
 * Nothing is written and nothing is pressed but CLEAR FILTERS, which
 * changes the address and sends nothing.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'arrival-104');

async function near(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-wall-container][data-unmeasured]')).toHaveCount(0, { timeout: 15_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.waitForTimeout(900);
}

const read = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement;
    const r = el.getBoundingClientRect();
    const seats = Array.from(document.querySelectorAll<HTMLElement>('a[data-seat]')).map((a) => {
      const s = (a.querySelector('[data-spine]') as Element).getBoundingClientRect();
      const t = (a.querySelector('[data-face="top"]') as Element).getBoundingClientRect();
      return { id: a.getAttribute('data-seat') as string, name: a.getAttribute('aria-label') ?? '', order: Number(a.getAttribute('tabindex')), inRegion: s.left >= r.left - 1 && s.right <= r.right + 1 && s.top >= r.top - 1 && s.bottom <= r.bottom + 1 && t.top >= r.top - 1 };
    });
    return { scroll: [Math.round(el.scrollLeft), Math.round(el.scrollTop)] as [number, number], region: [Math.round(r.width), Math.round(r.height)] as [number, number], seats, footprints: document.querySelectorAll('[data-footprint]').length };
  });

test('the filtered arrival and the empty shelf, on the real collection', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* Staged: the collection's order, and what the unfiltered wall shows as it opens. */
  await near(page, '/');
  const whole = await read(page);
  const order = new Map(whole.seats.map((s) => [s.id, s.order]));
  const shownUnfiltered = new Set(whole.seats.filter((s) => s.inRegion).map((s) => s.id));
  const genres = await page.locator('#rail-genre option').evaluateAll((all) => all.map((o) => ({ id: (o as HTMLOptionElement).value, name: (o.textContent ?? '').trim() })).filter((o) => o.id !== ''));

  const rows: Array<{ genre: string; id: string; matches: number; firstOrder: number; first: string; farFromFirstSeat: boolean; arrivesOnIt: boolean; anyMatchInRegion: boolean; scroll: [number, number] }> = [];
  for (const genre of genres) {
    await near(page, `/?genreId=${genre.id}`);
    const m = await read(page);
    if (m.seats.length === 0) continue;
    const first = [...m.seats].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0];
    rows.push({ genre: genre.name, id: genre.id, matches: m.seats.length, firstOrder: order.get(first.id) ?? 0, first: first.name, farFromFirstSeat: !shownUnfiltered.has(first.id), arrivesOnIt: first.inRegion, anyMatchInRegion: m.seats.some((s) => s.inRegion), scroll: m.scroll });
  }

  /* The case captured: confirmed far from the first seat, fewest records, furthest along. */
  const cases = rows.filter((r) => r.farFromFirstSeat);
  /*
    Where the collection has no such genre the staging says so, and the reading is of the genre whose first match is
    furthest along all the same: it shows what the arrival does, and cannot show the defect this step fixes.
  */
  const staged = cases.length > 0;
  const chosen = [...(staged ? cases : rows)].sort((a, b) => (staged ? a.matches - b.matches : 0) || b.firstOrder - a.firstOrder)[0];
  expect(chosen, 'a genre with a record').toBeDefined();
  await near(page, `/?genreId=${chosen.id}`);
  await page.screenshot({ path: join(OUT, 'arrival-filtered-1440x900.png') });

  /* Nothing matches: that genre and a search term none of it has. */
  await near(page, `/?genreId=${chosen.id}&q=zzzz-no-such-record-104`);
  const none = await read(page);
  const empty = page.locator('[data-shelf-empty]');
  await expect(empty).toBeVisible();
  await page.screenshot({ path: join(OUT, 'empty-shelf-1440x900.png') });
  const block = await empty.evaluate((el) => {
    const sentence = el.querySelector('[data-shelf-empty-sentence]') as HTMLElement;
    const s = sentence.getBoundingClientRect(); const b = el.getBoundingClientRect();
    const region = (document.querySelector('[data-region="wall"]') as HTMLElement).getBoundingClientRect();
    const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D;
    const rgb = (c: string) => { x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
    return { sentence: (sentence.textContent ?? '').trim(), size: getComputedStyle(sentence).fontSize, block: [Math.round(b.width), Math.round(b.height)], sentenceWidth: Math.round(s.width * 10) / 10, offCentre: [Math.round((b.left + b.right) / 2 - (region.left + region.right) / 2), Math.round((b.top + b.bottom) / 2 - (region.top + region.bottom) / 2)], text: rgb(getComputedStyle(sentence).color), paper: rgb(getComputedStyle(document.body).backgroundColor), clip: { x: Math.floor(s.left), y: Math.floor(s.top), width: Math.ceil(s.width), height: Math.ceil(s.height) } };
  });
  await page.addStyleTag({ content: '[data-shelf-empty-sentence]{visibility:hidden!important}' });
  const shot = (await page.screenshot({ clip: block.clip })).toString('base64');
  const ground = await page.evaluate(async ({ shot, text, paper }) => {
    const img = new Image(); img.src = `data:image/png;base64,${shot}`; await img.decode();
    const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const x = k.getContext('2d') as CanvasRenderingContext2D; x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const lum = (r: number, g: number, b: number) => { const f = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const t = lum(text[0], text[1], text[2]);
    let worst = Infinity; let notPaper = 0;
    for (let i = 0; i < img.width * img.height; i += 1) { const r = d[i * 4]; const g = d[i * 4 + 1]; const b = d[i * 4 + 2]; worst = Math.min(worst, ratio(t, lum(r, g, b))); if (Math.abs(r - paper[0]) + Math.abs(g - paper[1]) + Math.abs(b - paper[2]) > 6) notPaper += 1; }
    return { worst: Math.round(worst * 100) / 100, notPaper, pixels: img.width * img.height };
  }, { shot, text: block.text, paper: block.paper });

  await empty.locator('[data-shelf-empty-clear]').click();
  await expect(page).not.toHaveURL(/genreId|q=/, { timeout: 30_000 });
  await expect(page.locator('[data-footprint]')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(900);
  const cleared = await read(page);

  const result = { staged, collection: whole.seats.length, region: whole.region, unfilteredScroll: whole.scroll, shownUnfiltered: shownUnfiltered.size, genres: rows, chosen: chosen.genre, noMatch: { seated: none.seats.length, footprints: none.footprints, scroll: none.scroll, ...block, ground }, cleared: { scroll: cleared.scroll, seated: cleared.seats.length, url: new URL(page.url()).search } };
  writeFileSync(join(OUT, 'arrival.json'), `${JSON.stringify(result, null, 1)}\n`);
  const md = ['# Step 104 on the real collection', '', 'Read-only, at 1440 × 900. Generated by `e2e/sheet/arrival-104.sheet.ts`; the figures are in `arrival.json`.', '',
    `The collection is ${result.collection} records. The region is ${result.region[0]} × ${result.region[1]}. Unfiltered, the wall opens at scroll ${result.unfilteredScroll.join(', ')} and shows ${result.shownUnfiltered} records whole in the region.`, '',
    '## Every genre', '', 'Far from the first seat: the genre’s first match, by the collection’s order, is not in the region as the unfiltered wall opens. Only those are cases.', '',
    '| genre | records | first match, by order | far from the first seat | arrives with it in the region | scroll |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.genre} | ${r.matches} | ${r.firstOrder}: ${r.first.replace(/\|/g, '/')} | ${r.farFromFirstSeat ? 'yes' : 'no'} | ${r.arrivesOnIt ? 'yes' : 'NO'} | ${r.scroll.join(', ')} |`), '',
    `Cases: ${cases.length} of ${rows.length} genres. Of those, the arrival has the first match in the region on ${cases.filter((r) => r.arrivesOnIt).length}.`, '',
    ...(staged ? [] : ['**The case could not be staged on this collection.** No genre’s first match is outside the region as the unfiltered wall opens: every record is already in view. So this reading cannot show the filtered arrival differing from the unfiltered one; `e2e/wall-arrival-104.spec.ts` stages that on a seeded collection.', '']),
    `## Captured: ${chosen.genre}`, '', `${chosen.matches} record${chosen.matches === 1 ? '' : 's'}, the first at place ${chosen.firstOrder} of ${result.collection}. \`arrival-filtered-1440x900.png\`.`, '',
    '## Nothing matches', '', `That genre and a search term none of it has: ${result.noMatch.seated} seated, ${result.noMatch.footprints} emptied seats drawn. \`empty-shelf-1440x900.png\`.`, '',
    `- arrives at scroll ${result.noMatch.scroll.join(', ')}; the unfiltered wall’s is ${result.unfilteredScroll.join(', ')}`,
    `- the sentence: "${result.noMatch.sentence}", ${result.noMatch.size}, ${result.noMatch.sentenceWidth} wide; the block ${result.noMatch.block.join(' × ')}; off the region’s centre by ${result.noMatch.offCentre.join(', ')}`,
    `- §59, against the block as built: ${ground.pixels} pixels under the sentence, ${ground.notPaper} not paper, the worst ${ground.worst} : 1 (4.5 is owed below 40px)`,
    `- CLEAR FILTERS: the address is "${result.cleared.url}", ${result.cleared.seated} seated, scroll ${result.cleared.scroll.join(', ')}`, ''];
  writeFileSync(join(OUT, 'arrival.md'), `${md.join('\n')}\n`);
});
