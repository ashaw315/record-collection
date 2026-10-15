import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { gapBetween } from './pair-gap';
import { login } from './sign-in';
import { expectBox, expectLabel, expectLabelControl, read } from './type-read';

/**
 * Step 146, §T.6 part 2's passes, the record form (Design, 14 Oct): "§4.1
 * labels, §9.3 actions, + and − on its two disclosures, and Pressing
 * details' hairline below its head"; "Everything else and Pressing details
 * take the sidebar's + and −, not the browser's triangle"; "Pressing details
 * takes the hairline below its head, as every other group does"; and the
 * doubled rule: "where the last field row's bottom rule and Everything
 * else's top rule stand 21 apart with nothing between, the fieldset's top
 * rule goes, and the row's rule closes the group above". The genre chips
 * stay boxed and the native date field stays.
 *
 * Read from computed style on the new form and on a record's edit form, at
 * 390 under a coarse pointer and 1280 under a fine one. Fails against the
 * build before it: sans uppercase labels in grey, a filled sentence-case
 * Add record button with an underlined Cancel 8 from it, one disclosure
 * with the browser's triangle and a Pressing details fieldset with a rule
 * above its head and none below, and "+ New artist" as small grey text.
 */
registerCleanup();

const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;

type Disclosure = { head: string; open: boolean; marker: string; listStyle: string; mark: number; markRightFromHead: number; headRule: string; groupTopRule: string; downLine: string | null };
const disclosures = (page: Page) => page.evaluate((): Disclosure[] => Array.from(document.querySelectorAll<HTMLDetailsElement>('form details')).map((d) => {
  const summary = d.querySelector('summary') as HTMLElement;
  const line = summary.querySelector<SVGElement>('[data-mark-line="down"]');
  const svg = summary.querySelector('svg');
  const sr = summary.getBoundingClientRect();
  return {
    head: (summary.textContent ?? '').trim(),
    open: d.open,
    marker: getComputedStyle(summary, '::marker').content,
    listStyle: getComputedStyle(summary).listStyleType,
    mark: summary.querySelectorAll('svg line').length,
    markRightFromHead: svg === null ? NaN : Math.round(sr.right - svg.getBoundingClientRect().right),
    headRule: getComputedStyle(summary).borderBottomWidth,
    groupTopRule: getComputedStyle(d).borderTopWidth,
    downLine: line === null ? null : getComputedStyle(line).display,
  };
}));

async function expectForm(page: Page, where: string, editing: boolean) {
  await page.locator('form').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  /* The field labels: every <label for> that is drawn, and the two group heads (Genres, Tags) that are spans because a group has no single control. */
  const labels = (await read(page, 'form label[for], form [data-row-label]')).filter((r) => r.height > 0);
  expect(labels.length, `${where}: the field labels were read`).toBeGreaterThanOrEqual(14);
  for (const r of labels) expectLabel(r, `${where}: the label ${r.text}`);
  /* The actions: the submit as a §9.3 box, CANCEL a §9.3 label 24 clear of it. */
  const [submit] = await read(page, 'form button[type="submit"]');
  const [cancel] = await read(page, 'form [data-form-cancel]');
  expect(submit, `${where}: the submit`).toBeDefined();
  expect(cancel, `${where}: Cancel`).toBeDefined();
  expectBox(submit, `${where}: ${submit.text}`);
  expectLabelControl(cancel, `${where}: ${cancel.text}`);
  expect.soft(submit.height, `${where}: the submit is the box's 44 at every pointer`).toBe(44);
  const apart = gapBetween({ ...submit.edges }, { ...cancel.edges });
  expect.soft(`${apart.axis} ${apart.gap}`, `${where}: CANCEL 24 clear of the submit, side by side`).toBe('x 24');
  /* The inline creates: + New artist and the rest are §9.3 labels. */
  const news = (await read(page, 'form button[type="button"]')).filter((r) => /^new /i.test(r.text));
  expect(news.length, `${where}: the inline-create controls were read`).toBeGreaterThanOrEqual(editing ? 2 : 2);
  for (const r of news) expectLabelControl(r, `${where}: ${r.text}`);
  /* The two disclosures: §T.1's + and −, at the line's right, no browser triangle; the head with the hairline below it; no rule above the group. */
  const groups = await disclosures(page);
  expect(groups.map((g) => g.head), `${where}: the two disclosures`).toEqual(['Everything else', 'Pressing details']);
  for (const g of groups) {
    /* Everything else opens on an edit and not on a new record (§5.7's in-shop case); Pressing details opens to begin with either way, as its fields were in view before it was a disclosure. */
    const opens = g.head === 'Pressing details' || editing;
    expect.soft(g.open, `${where}: ${g.head} is ${opens ? 'open' : 'closed'} here`).toBe(opens);
    expect.soft(g.mark, `${where}: ${g.head} draws §T.1's mark (two lines, the down one hidden when open)`).toBe(2);
    /* The down line of the mark is hidden while the group is open (`group-open:hidden`); an SVG line's display is `inline` when shown. */
    expect.soft(g.downLine === 'none', `${where}: ${g.head}'s mark reads ${opens ? '−' : '+'} (down line ${g.downLine})`).toBe(opens);
    expect.soft(g.markRightFromHead, `${where}: ${g.head}'s mark at the line's right`).toBeLessThanOrEqual(1);
    expect.soft(g.marker === 'none' || g.listStyle === 'none', `${where}: ${g.head} has no browser triangle (marker ${g.marker}, list-style ${g.listStyle})`).toBe(true);
    expect.soft(g.headRule, `${where}: the hairline below ${g.head}'s head`).toBe('1px');
    expect.soft(g.groupTopRule, `${where}: no rule above ${g.head}, which would double the row's above it`).toBe('0px');
  }
}

for (const [width, pointer] of WINDOWS) test(`the record form at ${width} under a ${pointer} pointer: §4.1 labels, the submit a §9.3 box with CANCEL 24 clear, the inline creates §9.3 labels, + and − on both disclosures with the hairline below each head and no doubled rule`, async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const suffix = `f146${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Form ${suffix}` });
  trackArtist(artist);
  const record = await post('/api/records', { title: `Form ${suffix}`, artistId: artist });
  await page.goto('/records/new');
  await expectForm(page, `new at ${width}`, false);
  await page.goto(`/records/${record}/edit`);
  await expectForm(page, `editing at ${width}`, true);
  await context.close();
});
