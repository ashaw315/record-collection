import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { gapBetween } from './pair-gap';
import { seedMatchCandidate } from './seed';
import { login } from './sign-in';
import { expectBox, expectLabel, expectLabelControl, read } from './type-read';

/**
 * Step 146, §T.6 part 2's passes, manage's duplicate review (Design, 14
 * Oct): "The duplicate review is a box in a box in a box with grey panels.
 * It becomes a section between hairlines, set below Manage's heading and
 * above its section names, not above the heading. Inside it, the two
 * artists stand as two labelled columns at 1280 and stacked at 390, with
 * DIFFERENT ARTISTS and SAME ARTIST as §9.3 boxes. The merge's
 * confirmation is the same section's next lines, with CANCEL and MERGE
 * THEM." And part 1's labels in §4.1's type, no fill anywhere.
 *
 * One seeded pair, read at 1280 under a mouse and 390 under a coarse
 * pointer. Fails against the build before it: the review above the
 * heading in a bordered box, each pair in its own box, the two artists in
 * tinted panels, outline buttons 8 apart, and the confirmation in a
 * red-tinted box.
 */
registerCleanup();

const WINDOWS = [[1280, 'fine'], [390, 'coarse']] as const;

type Look = { section: { top: number; bottom: number; borderTop: string; borderBottom: string; borderLeft: string; radius: string; fill: string }; heading: { bottom: number }; names: { top: number }; pair: { border: string; fill: string; radius: string }; columns: Array<{ left: number; top: number; fill: string; border: string }>; confirm: { border: string; fill: string; radius: string } | null };
const look = (page: Page, name: string) => page.evaluate((who): Look => {
  const cs = (el: Element) => getComputedStyle(el);
  const section = document.querySelector('[data-testid="match-review"]') as HTMLElement;
  const heading = document.querySelector('h1') as HTMLElement;
  const names = document.querySelector('nav[aria-label="Resource"]') as HTMLElement;
  /* This test's own pair: another test's pair can stand in the same review. */
  const pair = Array.from(section.querySelectorAll<HTMLElement>('[data-testid="match-candidate"]')).find((el) => (el.textContent ?? '').includes(who)) as HTMLElement;
  const columns = Array.from(pair.querySelectorAll<HTMLElement>('[data-match-side]')).map((el) => ({ left: Math.round(el.getBoundingClientRect().left), top: Math.round(el.getBoundingClientRect().top), fill: cs(el).backgroundColor, border: cs(el).borderTopWidth }));
  const confirm = pair.querySelector('[data-testid="merge-confirm"]') as HTMLElement | null;
  const s = cs(section); const b = section.getBoundingClientRect();
  return {
    section: { top: b.top, bottom: b.bottom, borderTop: s.borderTopWidth, borderBottom: s.borderBottomWidth, borderLeft: s.borderLeftWidth, radius: s.borderTopLeftRadius, fill: s.backgroundColor },
    heading: { bottom: heading.getBoundingClientRect().bottom },
    names: { top: names.getBoundingClientRect().top },
    pair: { border: cs(pair).borderTopWidth, fill: cs(pair).backgroundColor, radius: cs(pair).borderTopLeftRadius },
    columns,
    confirm: confirm === null ? null : { border: cs(confirm).borderTopWidth, fill: cs(confirm).backgroundColor, radius: cs(confirm).borderTopLeftRadius },
  };
}, name);

for (const [width, pointer] of WINDOWS) test(`the duplicate review at ${width} under a ${pointer} pointer: a section between hairlines below the heading and above the section names, the two artists ${width < 640 ? 'stacked' : 'as two columns'} with §4.1 labels and no panels, DIFFERENT ARTISTS and SAME ARTIST as §9.3 boxes, the confirmation as the section’s next lines with CANCEL and MERGE THEM`, async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const suffix = `r146${Date.now().toString(36)}`;
  const name = `Review ${suffix}`;
  const pair = await seedMatchCandidate({ name, importedMbid: `mbid-${suffix}` });
  trackArtist(pair.importedId);
  trackArtist(pair.localId);
  await page.goto('/manage');
  const review = page.getByTestId('match-review');
  await expect(review).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  const row = review.getByTestId('match-candidate').filter({ hasText: name });
  await expect(row).toHaveCount(1);

  const at = await look(page, name);
  expect.soft(at.section, `${width}: a section between hairlines, no box`).toMatchObject({ borderTop: '1px', borderBottom: '1px', borderLeft: '0px', radius: '0px', fill: 'rgba(0, 0, 0, 0)' });
  expect.soft(at.section.top, `${width}: below Manage's heading`).toBeGreaterThanOrEqual(at.heading.bottom);
  expect.soft(at.section.bottom, `${width}: above the section names`).toBeLessThanOrEqual(at.names.top + 0.5);
  expect.soft(at.pair, `${width}: the pair is lines, not a box`).toMatchObject({ border: '0px', fill: 'rgba(0, 0, 0, 0)', radius: '0px' });
  expect(at.columns.length, `${width}: the two artists`).toBe(2);
  for (const c of at.columns) expect.soft(c, `${width}: an artist's column with no panel`).toMatchObject({ fill: 'rgba(0, 0, 0, 0)', border: '0px' });
  if (width < 640) expect.soft(at.columns[1].top, `${width}: stacked`).toBeGreaterThan(at.columns[0].top);
  else { expect.soft(at.columns[1].top, `${width}: side by side`).toBe(at.columns[0].top); expect.soft(at.columns[1].left, `${width}: two columns`).toBeGreaterThan(at.columns[0].left); }
  const labels = (await read(row, '[data-match-side] [data-match-label]')).filter((r) => r.height > 0);
  expect(labels.map((r) => r.text), `${width}: the columns' labels`).toEqual(['Imported', 'Already in your collection']);
  for (const r of labels) expectLabel(r, `${width}: ${r.text}`);
  const choices = (await read(row, '[data-match-choices] button')).filter((r) => r.height > 0);
  expect(choices.map((r) => r.text), `${width}: the two answers`).toEqual(['Different artists', 'Same artist']);
  for (const r of choices) { expectBox(r, `${width}: ${r.text}`); expect.soft(r.height, `${width}: ${r.text} is 44`).toBe(44); }
  expect.soft(gapBetween(choices[0].edges, choices[1].edges), `${width}: the two answers 24 apart`).toMatchObject({ gap: 24 });

  await row.getByRole('button', { name: /same artist/i }).click();
  await expect(row.getByTestId('merge-confirm')).toBeVisible();
  const after = await look(page, name);
  expect.soft(after.confirm, `${width}: the confirmation is the section's next lines, not a box`).toMatchObject({ border: '0px', fill: 'rgba(0, 0, 0, 0)', radius: '0px' });
  const verbs = (await read(row.getByTestId('merge-confirm'), 'button')).filter((r) => r.height > 0);
  expect(verbs.map((r) => r.text), `${width}: CANCEL then MERGE THEM`).toEqual(['Cancel', 'Merge them']);
  expectLabelControl(verbs[0], `${width}: Cancel`);
  expectBox(verbs[1], `${width}: Merge them`);
  expect.soft(gapBetween(verbs[0].edges, verbs[1].edges), `${width}: CANCEL 24 clear of MERGE THEM`).toMatchObject({ gap: 24 });
  await context.close();
});
