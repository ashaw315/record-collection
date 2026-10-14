import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { login } from './sign-in';
import { errorScreen, ringRoutes, settled } from './ring-routes';
import { drawnRing, expectedRing, walkTab, type Stop } from './ring-walk';

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
const EXPECTED = { 'as the shelf opens': 31, 'in the overview': 15, 'with a record pulled': 33 } as const;

test('the Tab walk through the wall in its three states stops 31, 15 and 33 times, and the Apply is never a stop', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.setViewportSize(WALL);
  await openShelf(page);
  const opens = await walkTab(page);
  await page.getByTestId('wall-zoom-out').click();
  await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
  const overview = await walkTab(page);
  await openShelf(page);
  await page.locator('a[data-seat] [data-spine]').first().click();
  await page.getByTestId('record-chrome').waitFor({ timeout: 30_000 });
  await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
  /* The arrows arrive once the pull has settled; the walk reads the settled state. */
  await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().waitFor({ timeout: 30_000 });
  const arrows = await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').count();
  const pulled = await walkTab(page);

  /*
    The wall draws the whole collection, and under the full suites other
    specs' records are on it while this walks (a run of 14 Oct read more
    than seventeen spines). So the count is held in two parts: the chrome,
    which is fixed (the header's six, the rail's seven, the zoom-out; pulled,
    the panel's three and §W.9's arrows), and the composition, which is what
    is drawn. Design's figures are the seed's seventeen, and are asserted
    as such whenever the walk finds exactly those.
  */
  const CHROME = 6 + 7 + 1;
  for (const [state, stops] of [['as the shelf opens', opens], ['in the overview', overview], ['with a record pulled', pulled]] as const) {
    const names = stops.map((s) => `${s.tag} ${s.name}`);
    expect.soft(names.filter((n) => n === 'button Apply'), `${state}: the Apply is reached`).toEqual([]);
    const composition = stops.filter((s) => s.composition).length;
    const panel = state === 'with a record pulled' ? 3 + arrows : 0;
    expect.soft(stops.length, `${state}: ${CHROME} of chrome${panel === 0 ? '' : `, the panel’s three and ${arrows} of §W.9’s arrows`}, and ${composition} of the composition (${names.join(' · ')})`).toBe(CHROME + panel + composition);
    const seed = state === 'in the overview' ? 1 : state === 'as the shelf opens' ? 17 : 16;
    if (composition === seed) expect.soft(stops.length, `${state}: Design’s ${EXPECTED[state]}${panel === 0 ? '' : ` plus ${arrows} of §W.9’s arrows`}, on the seed’s seventeen`).toBe(EXPECTED[state] + (state === 'with a record pulled' ? arrows : 0));
    else test.info().annotations.push({ type: `${state}: not the seed alone`, description: `${composition} in the composition where the seed has ${seed}; Design’s ${EXPECTED[state]} not checked on this run` });
    const clipped = stops.filter((s) => s.clipped !== null && !s.composition).map((s) => `${s.tag} ${s.name}: ${s.clipped}`);
    test.info().annotations.push({ type: `clipped ${state}`, description: clipped.length === 0 ? 'none outside the composition' : clipped.join('; ') });
  }
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
  box, outside it (`T.4/focus-inside-row`). Stats' names are HELD
  (`data-ring-held`): their own wrapper clips the ring and a fix is costed
  before Design rules; the hold is asserted so it cannot grow unnoticed.
  Fails against the build before the rule: the shared components' 3px grey
  ring, the browser's default on the raw controls, the five inline rings
  and the collection views' inside ring read as "something else".
*/
test('§M.6’s ring, once for the app: on every route each Tab stop draws the outside ring, the clipped cases the inside ring, the held names are stats’ and nothing else is held', async ({ page, context, browser }) => {
  test.setTimeout(900_000);
  await login(page);
  await page.setViewportSize(WALL);
  const bad: string[] = [];
  const held: string[] = [];
  const inner: string[] = [];
  const counts: string[] = [];
  let ringed = 0;
  const read = (route: string, stops: Stop[]) => {
    let here = 0;
    for (const stop of stops) {
      if (stop.composition) continue;
      const want = expectedRing(stop);
      if (want === 'held') { held.push(`${route}: ${stop.tag} ${stop.name}`); continue; }
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
  const out = await browser.newContext({ viewport: WALL });
  const loginPage = await out.newPage();
  await loginPage.goto('/login');
  await settled(loginPage);
  read('login', await walkTab(loginPage));
  await out.close();
  expect.soft(bad, 'stops whose ring is not the one ruled').toEqual([]);
  expect.soft(held.filter((h) => !/^stats: a /.test(h)), 'the hold is stats’ names and nothing else').toEqual([]);
  expect.soft(held.length, 'the precondition: the hold is in force on stats').toBeGreaterThan(0);
  expect(ringed, 'the precondition: the routes were walked').toBeGreaterThan(100);
  test.info().annotations.push({ type: 'ringed', description: `${ringed} stops draw the ring ruled for them: ${counts.join('; ')}` });
  test.info().annotations.push({ type: 'held', description: held.join('; ') });
  test.info().annotations.push({ type: 'inside the browser’s control', description: inner.join('; ') || 'none' });
  expect.soft(inner.filter((i) => !/input (entry-date|purchaseDate)/.test(i)), 'stops inside a browser control are the two date fields’ calendar buttons and nothing else').toEqual([]);
});
