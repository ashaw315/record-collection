import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { login } from './sign-in';
import { HIT_FLOOR, HIT_PAST, pointerIs, readReach, underFloor } from './hit-area';
import { normalizeRelease } from '@/lib/discogs/normalize-release';

registerCleanup();

/**
 * Step 150, §T.6 "Part 3, look up and its result card" (Design, 15 and 16
 * Oct), in two units: A, the card's words; B, its layout. Unit A: "the
 * adds as I OWN THIS and I WANT THIS, unfilled and with no glyph, own
 * first", because "IN COLLECTION and ON WANT LIST, an earlier draft, named
 * a state rather than an action"; and "COMPARE PRESSINGS and IDENTIFY THIS
 * PRESSING as disclosures with + and −", the mark carrying the open state
 * where the words "Hide pressings" and "Hide pressing details" did. The
 * words are their own unit so that a red here is a word and not a layout
 * (the reviewer, 16 Oct).
 */
const RELEASE = JSON.parse(readFileSync('test/fixtures/discogs/release-collision-clay-lp-3-a.json', 'utf8')) as Record<string, unknown>;
const VERSIONS = JSON.parse(readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8')) as { versions: Array<Record<string, unknown>> };
const ORIGINAL = 381756;
const MASTER = 50683;

const result = (overrides: Record<string, unknown> = {}) => ({
  discogsId: ORIGINAL, type: 'master', masterId: MASTER, title: 'Hear Nothing See Nothing Say Nothing', artist: 'Discharge',
  thumbUrl: null, coverUrl: null, year: 1982, country: 'UK', label: 'Clay Records', catalogNumber: 'CLAY LP 3',
  formats: ['Vinyl', 'LP', 'Album'], formatText: null, genres: ['Rock'], styles: ['Hardcore', 'Punk'], isReissue: false,
  communityHave: 3739, communityWant: 2165, ownership: { tier: null, ownedPressing: null, wantedPriority: null, isTargetPressing: false },
  ...overrides,
});

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stub(page: Page, results: Array<Record<string, unknown>>) {
  await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ data: results, meta: { total: results.length, page: 1, pageSize: 25 } })));
  const raw = VERSIONS.versions.find((v) => v.id === ORIGINAL) ?? {};
  const version = { discogsId: ORIGINAL, title: 'Hear Nothing See Nothing Say Nothing', label: 'Clay Records', country: 'UK', year: 1982, catalogNumber: 'CLAY LP 3', formats: String(raw.format ?? 'LP, Album').split(', '), isReissue: false, thumbUrl: null, communityHave: 100, communityWant: 100, ownership: result().ownership };
  await page.route('**/api/discogs/master/*/versions**', (route) => route.fulfill(json({ data: [version], meta: { total: 1, page: 1, pageSize: 25, pages: 1, ownershipChecked: true } })));
  await page.route('**/api/discogs/master/*/spread*', (route) => route.fulfill(json({ error: { message: 'Not asked here.', code: 'UPSTREAM_ERROR' } }, 502)));
  await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ error: { message: 'Not asked here.', code: 'UPSTREAM_ERROR' } }, 502)));
  await page.route('**/api/discogs/release/*', (route) => route.fulfill(json(normalizeRelease(RELEASE))));
}

/* A 1 × 1 PNG for a thumbnail, answered here: a real result has one, it takes 72 and 12 of the row, and nothing may reach Discogs. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const THUMB = 'https://i.discogs.com/thumb-150.png';
async function thumbs(page: Page) {
  await page.route(THUMB, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

async function search(page: Page) {
  await page.goto('/lookup');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Catalog no.').fill('CLAY LP 3');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await expect(page.getByTestId('result-card').first()).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/* Fails against the card as built: its links read "Add to collection" and "Add to want list". */
test('the card’s two actions read I own this then I want this, own first, each a link to its form with the release', async ({ page }) => {
  await stub(page, [result(), result({ discogsId: 6779382, isReissue: true })]);
  await search(page);
  const card = page.getByTestId('result-card').first();
  const own = card.getByRole('link', { name: 'I own this' });
  const want = card.getByRole('link', { name: 'I want this' });
  await expect(own).toHaveAttribute('href', `/records/new?discogsReleaseId=${ORIGINAL}`);
  await expect(want).toHaveAttribute('href', `/want-list/new?discogsReleaseId=${ORIGINAL}`);
  const names = await card.getByRole('link').evaluateAll((links) => links.map((l) => (l.textContent ?? '').trim()));
  expect(names.indexOf('I own this'), `own first, in ${names.join(' · ')}`).toBeLessThan(names.indexOf('I want this'));
  expect(names.filter((n) => /^Add to/.test(n)), 'the earlier words are gone').toEqual([]);
});

/* Fails against the card as built: the open state reads "Hide pressings" and "Hide pressing details", and nothing draws a mark. */
test('the two disclosures keep their names open and closed, the mark + closed and − open, and no "Hide" wording', async ({ page }) => {
  await stub(page, [result()]);
  await search(page);
  const card = page.getByTestId('result-card').first();
  const versions = card.getByTestId('expand-versions');
  const evidence = card.getByTestId('expand-evidence');
  const downStroke = (control: typeof versions) => control.locator('svg [data-mark-line="down"]');
  await expect(versions).toHaveText(/Compare pressings/);
  await expect(versions).toHaveAttribute('aria-expanded', 'false');
  await expect(downStroke(versions), 'closed: the + has its down stroke').toHaveCount(1);
  await versions.click();
  await expect(versions).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('table')).toBeVisible({ timeout: 15_000 });
  await expect(versions, 'open: the name stands, not "Hide pressings"').toHaveText(/Compare pressings/);
  await expect(versions).not.toHaveText(/Hide/);
  await expect(downStroke(versions), 'open: the − is the bar alone').toHaveCount(0);

  await expect(evidence).toHaveText(/Identify this pressing/);
  await expect(downStroke(evidence)).toHaveCount(1);
  await evidence.click();
  await expect(card.getByTestId('pressing-evidence')).toBeVisible({ timeout: 15_000 });
  await expect(evidence, 'open: the name stands, not "Hide pressing details"').toHaveText(/Identify this pressing/);
  await expect(evidence).not.toHaveText(/Hide/);
  await expect(downStroke(evidence)).toHaveCount(0);
});

/**
 * Unit B: the card's layout, as §T.6 rules it (the step at handoff line
 * 558): "a row between hairlines; unfilled §9.3 boxes for the two adds,
 * side by side or stacked by fit (report the width); the market slot at
 * Check the market's height; … the two disclosures on one line with + and
 * −, stacking COMPARE above IDENTIFY where they do not fit, checked at 320;
 * … Gatefold in the format line; opened details with §4.1 labels,
 * hairlines and no italic; the versions table aligned to the row's inset.
 * … SEARCHING… at SEARCH DISCOGS's width; failures in their slots." And
 * the floor "taken by the card's step on those four cards" at 320 and 390
 * coarse. Nothing here asserts a control's height under a fine pointer:
 * that number is Design's to rule (NOTES, 16 Oct) and moves in one place.
 */
const MONO = /mono/i;
const style = (locator: ReturnType<Page['locator']>, prop: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
/* The row's inset is the page's content edge: `main`'s box less its own padding (18, §T.1's one inset). */
const contentLeft = (page: Page) => page.locator('main').evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
const LONG_TITLE = 'On The Radio: Greatest Hits Vol. 1 & 2';

test.describe('unit B, the layout', () => {
  /* Fails against the card as built: a rounded box with a border on every side and an inset of its own. */
  test('a result is a row between hairlines, not a box, its content on the row’s inset', async ({ page }) => {
    await stub(page, [result(), result({ discogsId: 6779382, isReissue: true })]);
    await search(page);
    const cards = page.getByTestId('result-card');
    const first = cards.first();
    expect(await style(first, 'border-left-width'), 'no side border').toBe('0px');
    expect(await style(first, 'border-right-width')).toBe('0px');
    expect(await style(first, 'border-bottom-width'), 'a hairline below').toBe('1px');
    expect(await style(first, 'border-top-left-radius'), 'no radius').toBe('0px');
    const listTop = await style(page.locator('section[aria-label="Results"] ul'), 'border-top-width');
    expect(listTop, 'a hairline above the first row').toBe('1px');
    const inset = { left: await contentLeft(page) };
    const title = await box(first.getByText('Hear Nothing See Nothing Say Nothing').first());
    const thumb = await first.locator('img').count();
    /* With no thumbnail the title stands on the row's inset itself; a thumbnail is left of it by its own width and the gap. */
    expect(thumb).toBe(0);
    expect(Math.abs(title.left - inset.left), 'the title on the row’s inset').toBeLessThanOrEqual(1);
  });

  /* Fails against the card as built: a filled primary link and a bordered one, 24 tall, 8 apart. */
  for (const width of [320, 390, 1280]) test(`the two adds are unfilled boxes with no glyph, own first, side by side 24 apart or stacked full width, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await thumbs(page);
    /* Two cards: one bare, one with the thumbnail a real result has, which takes 84 of the row and is what makes the two stack at 320. */
    await stub(page, [result(), result({ discogsId: 6779382, isReissue: true, thumbUrl: THUMB })]);
    await search(page);
    await expect(page.getByTestId('result-card').nth(1).locator('img'), 'the precondition: the second card draws its thumbnail').toHaveJSProperty('naturalWidth', 1);
    for (const [which, index] of [['bare', 0], ['with a thumbnail', 1]] as const) {
    const card = page.getByTestId('result-card').nth(index);
    const own = card.getByRole('link', { name: 'I own this' });
    const want = card.getByRole('link', { name: 'I want this' });
    for (const [name, link] of [['own', own], ['want', want]] as const) {
      expect(await style(link, 'background-color'), `${name}: unfilled`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(await style(link, 'border-top-width'), `${name}: a 1px box`).toBe('1px');
      expect(await style(link, 'border-left-width'), `${name}: a 1px box`).toBe('1px');
      expect(await link.locator('svg').count(), `${name}: no glyph`).toBe(0);
      expect(await style(link, 'font-family'), `${name}: the label type`).toMatch(MONO);
    }
    const o = await box(own);
    const w = await box(want);
    const row = await box(card.locator('[data-adds]'));
    const sideBySide = Math.abs(o.top - w.top) < 1;
    if (sideBySide) expect(w.left - o.right, `${which}: side by side, 24 apart`).toBeCloseTo(24, 0);
    else {
      expect(o.bottom, `${which}: stacked, own above want`).toBeLessThanOrEqual(w.top);
      expect(o.width, `${which}: stacked, full width`).toBeCloseTo(row.width, 0);
      expect(w.width, `${which}: stacked, full width`).toBeCloseTo(row.width, 0);
    }
    test.info().annotations.push({ type: `adds at ${width}, ${which}`, description: `${sideBySide ? 'side by side' : 'stacked'}; the two boxes and their gap need ${sideBySide ? Math.round(o.width + w.width + 24) : 'more than'} of a row ${Math.round(row.width)} wide` });
    }
  });

  /* Fails against the card as built: a slot of 30 and 24 round a 16.5 link. */
  test('the market slot is Check the market’s own height, the same before and after it answers, and nothing beneath moves', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, [result(), result({ discogsId: 6779382, isReissue: true })]);
    await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ numForSale: 3, lowestPrice: { value: 42, currency: 'USD' }, conditions: [{ grade: 'Very Good Plus (VG+)', value: 42 }] })));
    await search(page);
    const card = page.getByTestId('result-card').first();
    const slot = card.locator('[data-market-slot]');
    const control = card.getByTestId('check-market');
    const before = { slot: await box(slot), control: await box(control), identify: await box(card.getByTestId('expand-evidence')) };
    expect(before.slot.height, 'the slot is the control’s height').toBeCloseTo(before.control.height, 0);
    expect(await style(control, 'font-family'), 'the control is a §9.3 label').toMatch(MONO);
    await control.click();
    await expect(card.getByTestId('market-summary')).toBeVisible({ timeout: 15_000 });
    const after = { slot: await box(slot), identify: await box(card.getByTestId('expand-evidence')) };
    expect(after.slot.height, 'the slot keeps its height holding the answer').toBeCloseTo(before.slot.height, 0);
    expect(after.identify.top, 'Identify this pressing did not move').toBeCloseTo(before.identify.top, 0);
  });

  /* Fails against the card as built: Compare pressings sits in the adds’ row and Identify on a line of its own. */
  for (const width of [320, 390]) test(`the two disclosures stand on one line 24 apart, or COMPARE above IDENTIFY where they do not fit, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await stub(page, [result()]);
    await search(page);
    const card = page.getByTestId('result-card').first();
    const compare = await box(card.getByTestId('expand-versions'));
    const identify = await box(card.getByTestId('expand-evidence'));
    const oneLine = Math.abs(compare.top - identify.top) < 1;
    if (oneLine) expect(identify.left - compare.right, 'one line: 24 apart').toBeCloseTo(24, 0);
    else {
      expect(compare.bottom, 'stacked: COMPARE above IDENTIFY').toBeLessThanOrEqual(identify.top);
      expect(Math.abs(compare.left - identify.left), 'stacked: on the same left').toBeLessThanOrEqual(1);
    }
    for (const control of [card.getByTestId('expand-versions'), card.getByTestId('expand-evidence')]) expect(await control.locator('svg[data-mark-line], svg:has([data-mark-line])').count(), 'the + and −').toBe(1);
    test.info().annotations.push({ type: `disclosures at ${width}`, description: oneLine ? 'one line' : 'stacked' });
  });

  /* Fails against the card as built: the qualifier is an italic line of its own. */
  test('Gatefold joins the format line, unitalicised', async ({ page }) => {
    await stub(page, [result({ formatText: 'Gatefold, Repress' })]);
    await search(page);
    const card = page.getByTestId('result-card').first();
    const line = card.getByText(/Vinyl · LP · Album/);
    await expect(line).toHaveText('Vinyl · LP · Album · Gatefold, Repress');
    expect(await style(card.getByTestId('format-text'), 'font-style')).toBe('normal');
  });

  /* Fails against the panel as built: 11px medium headings in the body face, a dashed rule and italic notes. */
  test('opened pressing details take §4.1 labels under hairlines, and the notes drop their italic', async ({ page }) => {
    await stub(page, [result()]);
    await search(page);
    const card = page.getByTestId('result-card').first();
    await card.getByTestId('expand-evidence').click();
    const panel = card.getByTestId('pressing-evidence');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    expect(await style(panel, 'border-top-width'), 'a hairline above the details').toBe('1px');
    expect(await style(panel, 'border-top-style')).toBe('solid');
    const heads = panel.locator('h4');
    const n = await heads.count();
    expect(n, 'the precondition: labelled sections').toBeGreaterThan(1);
    for (let i = 0; i < n; i += 1) {
      expect(await style(heads.nth(i), 'font-family'), `label ${i}: mono`).toMatch(MONO);
      expect(await style(heads.nth(i), 'text-transform'), `label ${i}: uppercase`).toBe('uppercase');
    }
    const notes = card.getByTestId('evidence-notes');
    if ((await notes.count()) > 0) {
      expect(await style(notes, 'border-top-style'), 'a hairline, not a dashed rule').toBe('solid');
      expect(await style(notes.locator('p'), 'font-style'), 'no italic').toBe('normal');
    }
  });

  /* Fails against the table as built: its first cell 8 in from the row's edge and its headings in the body face. */
  test('the versions table’s first column stands on the row’s inset, under §4.1 header labels', async ({ page }) => {
    await stub(page, [result()]);
    await search(page);
    const card = page.getByTestId('result-card').first();
    await card.getByTestId('expand-versions').click();
    const table = card.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15_000 });
    const inset = { left: await contentLeft(page) };
    const firstHead = table.locator('thead th').first();
    const firstCell = table.locator('tbody td').first();
    expect(Math.abs((await box(firstHead)).left - inset.left), 'the first column on the inset').toBeLessThanOrEqual(1);
    expect(Math.abs((await box(firstCell)).left - inset.left)).toBeLessThanOrEqual(1);
    const heading = table.locator('thead th').nth(1);
    expect(await style(heading, 'font-family')).toMatch(MONO);
    expect(await style(heading, 'text-transform')).toBe('uppercase');
  });

  /* Fails against the form as built: the button narrows to its shorter word while searching. */
  test('SEARCHING… keeps SEARCH DISCOGS’s drawn width', async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/discogs/search**', async (route) => { await held; await route.fulfill(json({ data: [result()], meta: { total: 1, page: 1, pageSize: 25 } })); });
    await page.goto('/lookup');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    const button = page.locator('form[data-testid="lookup-form"] button[type="submit"]');
    await expect(page.getByRole('button', { name: 'Search Discogs', exact: true }), 'the reserving copy is not read as part of the name').toHaveCount(1);
    const rest = await box(button);
    await page.getByLabel('Catalog no.').fill('CLAY LP 3');
    await button.click();
    await expect(button).toHaveText(/Searching…/);
    const searching = await box(button);
    release();
    expect(searching.width, 'the width held').toBeCloseTo(rest.width, 0);
    expect(searching.height, 'and the height').toBeCloseTo(rest.height, 0);
  });

  /* Fails against the form as built: the browser's triangle on More search terms, and sans labels in grey. */
  test('the form takes part 1’s labels, and More search terms draws + closed and − open', async ({ page }) => {
    await page.goto('/lookup');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    const label = page.locator('label[for="catno"]');
    expect(await style(label, 'font-family'), '§4.1: mono').toMatch(MONO);
    expect(await style(label, 'text-transform')).toBe('uppercase');
    expect(await style(label, 'letter-spacing'), 'tracked').not.toBe('normal');
    const summary = page.locator('summary', { hasText: 'More search terms' });
    expect(await summary.locator('svg [data-mark-line="down"]').count(), 'closed: +').toBe(1);
    expect(await summary.locator('svg [data-mark-line="down"]').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await summary.click();
    expect(await summary.locator('svg [data-mark-line="down"]').evaluate((el) => getComputedStyle(el).display), 'open: the − is the bar alone').toBe('none');
  });

  /* Fails against the form as built: the failure line is absent until a failure, so the first one moves the form. */
  test('the form’s failure line is a reserved slot, there before any search and holding the rate limit’s words', async ({ page }) => {
    await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ error: { message: 'Discogs rate limit reached. Try again in a moment.', code: 'RATE_LIMITED' } }, 429)));
    await page.goto('/lookup');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    const slot = page.getByTestId('lookup-error');
    await expect(slot, 'the slot is there at rest').toHaveCount(1);
    const rest = await box(slot);
    expect(rest.height, 'one line, reserved').toBeGreaterThan(10);
    const buttonAtRest = await box(page.getByRole('button', { name: /Search Discogs/ }));
    await page.getByLabel('Catalog no.').fill('CLAY LP 3');
    await page.getByRole('button', { name: /Search Discogs/ }).click();
    await expect(slot).toHaveText(/rate limit/);
    expect((await box(slot)).height, 'the failure takes the slot and does not grow it').toBeCloseTo(rest.height, 0);
    expect((await box(page.getByRole('button', { name: /Search Discogs/ }))).top, 'nothing above it moved').toBeCloseTo(buttonAtRest.top, 0);
  });
});

/**
 * The floor, "taken by the card's step on those four cards" at 320 and 390
 * coarse: the collection's longest title wrapping, a market answer in its
 * slot, a disclosure open, and a pressing with a notes line. Fails against
 * the card as built, whose links are 24 tall to a finger.
 */
test.describe('the floor on four cards, coarse', () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390]) test(`every control on the four cards is 44 tall to a finger and reaches no more than 9 past itself, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await thumbs(page);
    const cards = [
      result({ discogsId: 1, title: LONG_TITLE, artist: 'Donna Summer', thumbUrl: THUMB }),
      result({ discogsId: 2, thumbUrl: THUMB }),
      result({ discogsId: 3, masterId: MASTER, thumbUrl: THUMB }),
      result({ discogsId: 4, formatText: 'Gatefold, Repress', thumbUrl: THUMB }),
    ];
    await stub(page, cards);
    await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ numForSale: 3, lowestPrice: { value: 42, currency: 'USD' }, conditions: [{ grade: 'Very Good Plus (VG+)', value: 42 }] })));
    await search(page);
    const all = page.getByTestId('result-card');
    await expect(all).toHaveCount(4);
    expect(await pointerIs(page), 'the precondition: a coarse pointer').toBe('coarse');
    /* The first card's title wraps at 320, the second holds a market answer, the third has a disclosure open, the fourth a notes line. */
    /* Lines by height: a block's client rects are one rect however many lines it takes. */
    const titleLines = await all.nth(0).getByText(LONG_TITLE).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    test.info().annotations.push({ type: `long title at ${width}`, description: `${titleLines} line(s)` });
    if (width === 320) expect(titleLines, 'the precondition: the long title wraps at 320, as the ruling names').toBeGreaterThan(1);
    await all.nth(1).getByTestId('check-market').click();
    await expect(all.nth(1).getByTestId('market-summary')).toBeVisible({ timeout: 15_000 });
    await all.nth(2).getByTestId('expand-versions').click();
    await expect(all.nth(2).getByRole('table')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    const reach = await readReach(page, 'section[aria-label="Results"]');
    expect(reach.length, 'the precondition: the cards’ controls were read').toBeGreaterThanOrEqual(16);
    expect.soft(underFloor(reach).map((r) => `${r.name}: ${r.tall} (${r.lostTo.join('; ')})`), `controls under ${HIT_FLOOR} to a finger at ${width}, of ${reach.length}`).toEqual([]);
    expect.soft(reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).map((r) => `${r.name}: ${r.left} left, ${r.right} right`), `controls a tap reaches from more than ${HIT_PAST} past them at ${width}`).toEqual([]);
    const heights = await all.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    test.info().annotations.push({ type: `card heights at ${width}`, description: `long title ${heights[0]}, market answered ${heights[1]}, disclosure open ${heights[2]}, notes line ${heights[3]}` });
  });

  /* The figures the step reports, not an assertion: the card's height and the page's for 25 results at 390. */
  test('the card’s height and the page’s height for 25 results at 390, reported', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await thumbs(page);
    await stub(page, Array.from({ length: 25 }, (_, i) => result({ discogsId: 1000 + i, thumbUrl: THUMB })));
    await search(page);
    await expect(page.getByTestId('result-card')).toHaveCount(25);
    await page.evaluate(() => document.fonts.ready);
    const card = Math.round((await box(page.getByTestId('result-card').first())).height);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    test.info().annotations.push({ type: 'at 390 coarse', description: `a card ${card} tall; the page ${pageHeight} tall for 25 results` });
    expect(card).toBeGreaterThan(0);
  });
});
