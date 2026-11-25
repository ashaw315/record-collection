import { expect, test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist } from '../cleanup';
import { login } from '../sign-in';

/**
 * **The record page's actions slot with three verbs (Q90's Measure bullet, 24 Nov).** The step asks the slot's row
 * measured at 390 and 1440 and whether it still takes one row at 390, per §G.8. §G.8's four forms were set on two verbs
 * (in line with the links from 768, with the control from 454); a third widens the slot, so this reads the header's
 * form at every width from 380 to 1000: its height, whether the slot sits on the bar's row, and whether the three verbs
 * share one line within the slot. Reported, not asserted; tagged report-only, so the gate's suites do not run it.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

test('the header’s form with three verbs, 380 to 1000 @report-only', async ({ page }) => {
  test.setTimeout(300_000);
  const s = `${Date.now()}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Slot3-${s}` } })).json()) as { id: string };
  trackArtist(artist.id);
  const id = ((await (await page.request.post('/api/records', { data: { title: `Slot3 ${s}`, artistId: artist.id } })).json()) as { id: string }).id;
  const rows: string[] = [];
  let last = '';
  for (let width = 380; width <= 1000; width += 1) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    if (width === 380) { await page.goto(`/records/${id}`); await page.locator('[data-app-nav]').waitFor({ timeout: 30_000 }); await page.evaluate(() => document.fonts.ready); }
    const f = await page.evaluate(() => {
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
      const slot = header.querySelector('[data-slot="actions"]') as HTMLElement;
      const verbs = Array.from(slot.querySelectorAll('[data-control]')).map((e) => e.getBoundingClientRect());
      const links = Array.from(header.querySelectorAll('nav[aria-label="Main"] a')).every((a) => a.getClientRects().length > 0);
      return { height: Math.round(header.getBoundingClientRect().height), slotTop: Math.round(slot.getBoundingClientRect().top - bar.top), slotHeight: Math.round(slot.getBoundingClientRect().height), verbsOneLine: verbs.every((r) => Math.abs(r.top - verbs[0].top) < 2), links, overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    const form = `${f.links ? 'links' : 'control'}, header ${f.height}, slot ${f.slotTop === 0 || f.slotTop < 52 ? 'in line' : `below at ${f.slotTop}`} ${f.slotHeight} tall, verbs ${f.verbsOneLine ? 'one line' : 'wrapped'}${f.overflow ? ', OVERFLOWS' : ''}`;
    if (form !== last || width === 390 || width === 1000) rows.push(`${width}: ${form}`);
    last = form;
  }
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  const at1440 = await page.evaluate(() => { const h = document.querySelector('[data-app-nav]') as HTMLElement; const slot = h.querySelector('[data-slot="actions"]') as HTMLElement; return `header ${Math.round(h.getBoundingClientRect().height)}, slot ${Math.round(slot.getBoundingClientRect().width)} wide`; });
  rows.push(`1440: ${at1440}`);
  test.info().annotations.push({ type: 'forms', description: rows.join('\n') });
  process.stdout.write(`${rows.join('\n')}\n`);
  expect(rows.length).toBeGreaterThan(0);
});
