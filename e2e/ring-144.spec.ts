import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { login } from './sign-in';
import { errorScreen, ringRoutes, settled } from './ring-routes';
import { drawnRing, expectedRing, walkTab, type Stop } from './ring-walk';
import { MOODS } from '../src/lib/moods/moods';
import { clickSpine } from './wall-ready';

registerCleanup();

/**
 * Step 144, §T.6 "Focus, once for the app" (Design, 13 Oct), unit one: the
 * rail's hidden Apply leaves the tab order, and the Tab walk through the
 * wall in its three states counts the stops against Design's sets.
 *
 * "The rail's hidden one-pixel Apply is not a stop for Tab: it leaves the
 * tab order, and Enter in the search field still submits." And: "walk Tab
 * through the wall in all three states and report the counts, expected 31,
 * 15 and 33 once the Apply has left the order, failing if the Apply is
 * still reached."
 */
const WALL = { width: 1440, height: 900 };

async function openShelf(page: Page) {
  await page.goto('/');
  await page.locator('[data-shelf-offered] [data-wall="labelled"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

test('the rail’s hidden Apply is not a Tab stop: Tab from the search field lands on the genre select and from the sort select on SHELF, Enter in the field still submits, and the Apply is still the form’s submit button', async ({ page }) => {
  await login(page);
  await page.setViewportSize(WALL);
  await openShelf(page);
  const search = page.locator('#rail-search');
  const active = () => page.evaluate(() => ({ id: document.activeElement?.id ?? '', tag: document.activeElement?.tagName.toLowerCase() ?? '', text: (document.activeElement?.textContent ?? '').trim().slice(0, 12) }));
  await search.focus();
  await page.keyboard.press('Tab');
  expect(await active(), 'the stop after the search field is the genre select').toMatchObject({ id: 'rail-genre', tag: 'select' });
  /* The Apply stands after the sort select in the form, so this is the stop that changes. Fails against the build before it, where it was the Apply (`wall-focusables.md`: the rail's eight). */
  await page.locator('#rail-sort').focus();
  await page.keyboard.press('Tab');
  expect(await active(), 'the stop after the sort select is SHELF, not the Apply').toMatchObject({ tag: 'a', text: 'Shelf' });
  /*
    Enter still submits: the form's implicit submission, which clicks its
    default button. This is the one that could break silently later, since
    nothing visible changes when it does (the coordinator, 14 Oct).
  */
  await search.fill('Gaucho');
  await search.press('Enter');
  await expect(page, 'Enter in the search field submits the rail’s form').toHaveURL(/[?&]q=Gaucho/);
  /* The proxy beneath that, named as one: the Apply is still there as the form's submit button, out of the order and not gone. The drawn rail, not the band's copy. */
  const apply = await page.evaluate(() => {
    const rail = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-rail"]')).find((el) => el.getClientRects().length > 0);
    const button = rail?.querySelector<HTMLButtonElement>('form button[type="submit"]') ?? null;
    return button === null ? null : { text: (button.textContent ?? '').trim(), tabindex: button.getAttribute('tabindex') };
  });
  expect(apply, 'the drawn rail’s form keeps a submit button, which implicit submission clicks, out of the order').toEqual({ text: 'Apply', tabindex: '-1' });
});

/*
  Design's sets, "expected 31 as the shelf opens, 15 in the overview and 33
  with a record pulled", on the seventeen of the test database. The walk
  "counts them for real and pins the measured figures": pulled, the
  measured figure is 33 plus §W.9's arrows, NEXT RECORD and PREVIOUS
  RECORD, 44 boxes beside the landed cover drawn "only where there is
  somewhere to go", one for the first record and two for a middle one.
  Code's reading (`wall-focusables.md`) ran before the pull had settled
  and missed them, so Design's 33 counts the panel's three only; the
  arrows are boxed chrome by §T.6's own sentence ("a boxed control added
  to the wall later is chrome too") and are reported for Design to confirm
  (14 Oct). Fails against the Apply still in the order: 32, 16 and 35.
*/
/*
  Step 148 (§T.6, 14 Oct): "the spines are one Tab stop with a roving
  index". Design's 31 and 33 were measured with every seated spine a stop,
  seventeen as the shelf opens and sixteen with one pulled; one stop makes
  them 15 and 18, and the composition's expected count 1 in both states.
  The figures changed by arithmetic under the ruling, not to pass code;
  Design's bullet still says 31 and 33 and is told so as text.
*/
/*
  Step 156 (§P.5, 27 Oct): SURPRISE ME is focusable by ruling, so it is a Tab
  stop in the rail, and each count rises by one: 16, 16 and 19. Measured
  first, all three on the seed alone, with the control the one stop added in
  each walk; the figures follow by arithmetic under the ruling, as step 148's
  did. Design's target still says 31, 15 and 33, false since step 148, and
  they are Design's to withdraw.
*/
/*
  Step 157b (§P.5, §P.6, 27 Oct): the walk asserts the SEQUENCE of stops, not
  a total. The rail's stops are "fixed by the control's list and not by the
  tags": the moods come from code's list in its order (§P.5, "the control
  draws whatever that list holds, in its order"), and an inert mood or an
  inert ASK stays a stop (§P.6). A count passes on any N stops in any order
  and moved every time the control changed (31, 15, 33; then 15, 15, 18;
  then 16, 16, 19, each withdrawn in turn); the sequence fails on a missing
  stop, an extra one or a wrong order, and the counts are derived for the
  report. Expected from the list, actual from the DOM: expected from the
  drawn moods would check the control against itself and miss a missing one.
*/
type Expected = readonly [tag: string, name: RegExp];
const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const HEADER: Expected[] = [['a', /^Record Collection$/], ['a', /^Collection$/], ['a', /^Want list$/], ['a', /^Look up$/], ['a', /^Stats$/], ['a', /^Manage$/]];
/* §W.13's rail: the search field, the genre and sort selects, the three views, then §P.5's control in its order, then ADD RECORD at the foot. */
const RAIL: Expected[] = [
  ['input', /^rail-search$/],
  ['select', /^Any/],
  ['select', /^Default/],
  ['a', /^Shelf$/],
  ['a', /^Table$/],
  ['a', /^Grid$/],
  ...MOODS.map((m): Expected => ['button', exact(m)]),
  ['button', /^Ask$/],
  ['button', /^Surprise me$/],
  ['a', /^Add record$/],
];
/* §W.12: the way out is the count, in whichever view is showing. */
const ZOOM: Expected = ['button', /^Show the whole collection$/];
/* §W.7's panel, pulled: its link, TURN OVER and PUT BACK, before the composition's stop. */
const PANEL: Expected[] = [['a', /^Open the full record/], ['button', /^Turn over$/], ['button', /^Put back$/]];
const ARROWS = (index: number, length: number): Expected[] => [
  ...(index > 0 ? [['button', /^Previous record$/] as Expected] : []),
  ...(index < length - 1 ? [['button', /^Next record$/] as Expected] : []),
];

/**
 * The walk against its expected shape: the chrome's stops positionally, then
 * one or more composition stops (one spine under the roving index; a run per
 * shelf in the overview, and other specs' shelves are on the wall under the
 * full suites), then the arrows by position. Every departure is reported
 * with the full walk, so a wrong order reads as what it is.
 */
function expectWalk(state: string, stops: Stop[], chrome: Expected[], arrows: Expected[]) {
  const names = stops.map((s) => `${s.tag} ${s.name}`);
  test.info().annotations.push({ type: `walked ${state}`, description: `${stops.length} stops: ${names.join(' · ')}` });
  const show = (e: Expected) => `${e[0]} ${e[1].source}`;
  const miss = (at: number, want: Expected | 'composition', got: Stop | undefined) =>
    `${state}, stop ${at + 1}: expected ${want === 'composition' ? 'a composition stop' : show(want)}, walked ${got === undefined ? 'nothing (the walk ended)' : `${got.tag} ${got.name}${got.composition ? ' (composition)' : ''}`}\n  the walk: ${names.join(' · ')}`;
  chrome.forEach((want, i) => {
    const got = stops[i];
    expect.soft(got !== undefined && got.tag === want[0] && want[1].test(got.name) && !got.composition, miss(i, want, got)).toBe(true);
  });
  const rest = stops.slice(chrome.length);
  const firstTail = rest.findIndex((s) => !s.composition);
  const composition = firstTail === -1 ? rest : rest.slice(0, firstTail);
  const tail = firstTail === -1 ? [] : rest.slice(firstTail);
  expect.soft(composition.length, miss(chrome.length, 'composition', rest[0])).toBeGreaterThanOrEqual(1);
  arrows.forEach((want, i) => {
    const got = tail[i];
    expect.soft(got !== undefined && got.tag === want[0] && want[1].test(got.name), miss(chrome.length + composition.length + i, want, got)).toBe(true);
  });
  expect.soft(tail.slice(arrows.length).map((s) => `${s.tag} ${s.name}`), `${state}: stops after the last expected one`).toEqual([]);
  expect.soft(names.filter((n) => n === 'button Apply'), `${state}: the Apply is reached`).toEqual([]);
  const clipped = stops.filter((s) => s.clipped !== null && !s.composition).map((s) => `${s.tag} ${s.name}: ${s.clipped}`);
  test.info().annotations.push({ type: `clipped ${state}`, description: clipped.length === 0 ? 'none outside the composition' : clipped.join('; ') });
  /* The figures, derived and reported, never pinned: the chrome's count, the composition's, and the arrows'. */
  test.info().annotations.push({ type: `counted ${state}`, description: `${chrome.length} of chrome, ${composition.length} of the composition${arrows.length === 0 ? '' : `, ${arrows.length} of §W.9's arrows`}: ${stops.length}${composition.length === 1 ? '' : ' (not the seed alone)'}` });
}

test('the Tab walk through the wall in its three states stops in order: the header, the rail with the control from code’s list, the zoom-out, pulled the panel, then the composition as one stop and §W.9’s arrows by position; the Apply never', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await page.setViewportSize(WALL);
  await openShelf(page);
  const opens = await walkTab(page);
  await page.getByTestId('wall-zoom-out').click();
  await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
  const overview = await walkTab(page);
  /*
    §W.9's arrows are drawn "only where there is somewhere to go", so how many
    there should be is a fact about the pulled record's position, read from
    the panel's `data-nav`, and not about what was drawn: counted from the
    page, a middle record drawing one arrow lowered the expectation with it
    and the walk stayed green (the coordinator, 27 Oct). The rule has a branch
    per end, so the walk pulls the first, a middle and the last record in
    §W.23's seat order: pulling one position left the others unproven, and a
    middle record drawing one arrow passed on the seed.
  */
  const pulls: { state: string; stops: Stop[]; arrows: Expected[] }[] = [];
  for (const position of ['first', 'middle', 'last'] as const) {
    await openShelf(page);
    const seats = await page.$$eval('a[data-seat]', (links) => links.map((a) => ({ id: a.getAttribute('data-seat') ?? '', order: Number(a.getAttribute('data-seat-order')) })).sort((x, y) => x.order - y.order).map((s) => s.id));
    expect(seats.length, 'the precondition: a wall with a middle record').toBeGreaterThanOrEqual(3);
    const seat = seats[position === 'first' ? 0 : position === 'last' ? seats.length - 1 : Math.floor(seats.length / 2)];
    await clickSpine(page, page.locator(`a[data-seat="${seat}"] [data-spine]`));
    await page.getByTestId('record-chrome').waitFor({ timeout: 30_000 });
    await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
    /* The arrows arrive once the pull has settled; the walk reads the settled state. */
    await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().waitFor({ timeout: 30_000 });
    const nav = (await page.getByTestId('record-chrome').getAttribute('data-nav')) ?? '';
    const [index, length] = nav.split('/').map(Number);
    expect(Number.isInteger(index) && Number.isInteger(length) && index >= 0 && index < length, `the pulled record's position is read (data-nav "${nav}")`).toBe(true);
    /* The precondition the branch needs: the record pulled is at the position asked for, or the walk proves a branch it did not reach. */
    const at = index === 0 ? 'first' : index === length - 1 ? 'last' : 'middle';
    expect(at, `the ${position} record is pulled (data-nav "${nav}")`).toBe(position);
    const arrows = ARROWS(index, length);
    const drawn = await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').count();
    test.info().annotations.push({ type: `pulled the ${position}`, description: `record ${index + 1} of ${length}: ${arrows.length} of §W.9's arrows ruled, ${drawn} drawn` });
    expect.soft(drawn, `§W.9's arrows for record ${index + 1} of ${length}`).toBe(arrows.length);
    pulls.push({ state: `with the ${position} record pulled`, stops: await walkTab(page), arrows });
  }

  expectWalk('as the shelf opens', opens, [...HEADER, ...RAIL, ZOOM], []);
  expectWalk('in the overview', overview, [...HEADER, ...RAIL, ZOOM], []);
  for (const pull of pulls) expectWalk(pull.state, pull.stops, [...HEADER, ...RAIL, ZOOM, ...PANEL], pull.arrows);
});

/*
  Unit two, the rule (§T.6, 20:23 drop): "Every focusable control in the app
  outside the wall's drawn composition shows §M.6's outside ring when it has
  keyboard focus, a 2px ink outline offset 2 outside its box, and nothing
  else: the shared components' grey ring and the browser's default outline
  are defects wherever they appear. Where a control's box is clipped by its
  container, as the record page's cover is, it takes §M.6's inside ring
  instead." The filter panel's options are the clipping clause's second
  instance (step 113; Design correcting §T.6's "only the cover", 14 Oct).
  The row's and the cell's link draw the ring on the overlay that is their
  box, outside it (`T.4/focus-inside-row`). Stats' names, held while their
  wrapper clipped the ring, are their own clippers (§T.6, 14 Oct) and take
  the outside ring; `stats-names-144.spec.ts` reads the bands painted.
  Fails against the build before the rule: the shared components' 3px grey
  ring, the browser's default on the raw controls, the five inline rings
  and the collection views' inside ring read as "something else".
*/
/* "Add a check that focuses each focusable element on each route at 390 and 1280 and asserts the ring": those two, and 1440, the wall sheet's window. */
for (const width of [390, 1280, 1440]) test(`§M.6’s ring, once for the app, at ${width}: on every route each Tab stop draws the outside ring, the clipped cases the inside ring`, async ({ page, context, browser }) => {
  test.setTimeout(900_000);
  await login(page);
  await page.setViewportSize({ width, height: WALL.height });
  const bad: string[] = [];
  const inner: string[] = [];
  const counts: string[] = [];
  let ringed = 0;
  const read = (route: string, stops: Stop[]) => {
    let here = 0;
    for (const stop of stops) {
      if (stop.composition) continue;
      const want = expectedRing(stop);
      const got = drawnRing(stop);
      /* A stop inside the browser's own control (a date field's calendar button): not the rule's to reach, reported rather than counted either way. */
      if (!stop.ring.focusVisible && stop.tag === 'input') { inner.push(`${route}: ${stop.tag} ${stop.name}`); continue; }
      if (got === want) { ringed += 1; here += 1; } else bad.push(`${route}: ${stop.tag} ${stop.name}: draws ${got}, ruled ${want}`);
    }
    counts.push(`${route} ${here} of ${stops.length}`);
  };
  for (const route of await ringRoutes(page)) {
    await page.goto(route.path);
    await settled(page);
    if (route.before !== undefined) await route.before(page);
    read(route.name, await walkTab(page));
  }
  await errorScreen(page, context, async (p) => read('the error screen', await walkTab(p)));
  const out = await browser.newContext({ viewport: { width, height: WALL.height } });
  const loginPage = await out.newPage();
  await loginPage.goto('/login');
  await settled(loginPage);
  read('login', await walkTab(loginPage));
  await out.close();
  expect.soft(bad, 'stops whose ring is not the one ruled').toEqual([]);
  expect(ringed, 'the precondition: the routes were walked').toBeGreaterThan(100);
  test.info().annotations.push({ type: 'ringed', description: `${ringed} stops draw the ring ruled for them: ${counts.join('; ')}` });
  test.info().annotations.push({ type: 'inside the browser’s control', description: inner.join('; ') || 'none' });
  expect.soft(inner.filter((i) => !/input (entry-date|purchaseDate)/.test(i)), 'stops inside a browser control are the two date fields’ calendar buttons and nothing else').toEqual([]);
});
