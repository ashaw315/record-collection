import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { walkTab } from './ring-walk';

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

  for (const [state, stops] of [['as the shelf opens', opens], ['in the overview', overview], ['with a record pulled', pulled]] as const) {
    const names = stops.map((s) => `${s.tag} ${s.name}`);
    expect.soft(names.filter((n) => n === 'button Apply'), `${state}: the Apply is reached`).toEqual([]);
    const expected = EXPECTED[state] + (state === 'with a record pulled' ? arrows : 0);
    expect.soft(stops.length, `${state}: stops, against Design’s ${EXPECTED[state]}${state === 'with a record pulled' ? ` plus ${arrows} of §W.9’s arrows` : ''} (${names.join(' · ')})`).toBe(expected);
    const clipped = stops.filter((s) => s.clipped !== null && !s.composition).map((s) => `${s.tag} ${s.name}: ${s.clipped}`);
    test.info().annotations.push({ type: `clipped ${state}`, description: clipped.length === 0 ? 'none outside the composition' : clipped.join('; ') });
  }
});
