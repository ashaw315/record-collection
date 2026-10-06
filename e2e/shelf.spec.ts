import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackGenre } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/*
  **A 60-second budget, because the 30-second default did not fit this file
  on an IDLE machine.** Diagnosed in NOTES ("the E2E suite's flakes are a
  timeout budget, not contention"): the suite's four load failures all passed
  serially, which looked like contention, and was not. `record-navigation`'s
  put-back test measured 32.9s running entirely alone; `wall-first-paint`'s
  arrival-script test 23.5s. These specs drive the wall's real animation
  clocks — SWING 1300, OUT 1600, RETURN 861 — through several pulls per test,
  so their floor is high and any load pushed them over the default. Under
  load, which spec crossed first varied, so the failing set moved between
  runs and no single spec ever looked broken.

  Twice the measured worst, not `test.slow()`'s triple: enough headroom for
  a busy machine, not enough to hide a hang for minutes. Held by
  test/repo/wall-specs-declare-budget.test.ts. The fixed `waitForTimeout`
  sleeps in these files are the second half of the same task and are not
  touched here.
*/
test.describe.configure({ timeout: 60_000 });


/**
 * SPEC.md §10b — the shelf, and pulling a record off it.
 *
 * **These exist because unit tests could not have caught any of the three
 * defects this feature shipped and then fixed**: five genre sections that
 * rendered as empty black bands, spine text clipped at both ends, and a turn
 * that was a panel swap wearing a rotation's clothes. All three were found by
 * looking at the screen.
 *
 * What a test CAN hold down is the behaviour underneath: that a spine leads
 * somewhere, that turning shows the other side, and that the gatefold
 * affordance appears only where an inner image exists — which is §10b's
 * strictest rule, because there is no generated stand-in for artwork.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A record on the shelf, returning both ids the callers need. */
async function seedRecord(page: Page, title: string) {
  const artist = await page.request.post('/api/artists', {
    data: { name: `Shelf-${suffix()}` },
  });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  const record = await page.request.post('/api/records', {
    data: { title, artistId },
  });
  expect(record.status(), 'the fixture must exist for this to test anything').toBe(201);

  // The artist id travels back so a caller can SCOPE its view to this run's
  // fixture. The table paginates at 50 and does not filter by default, so an
  // unscoped assertion looks for a record that may be on page 3 — which is what
  // `record-detail.spec.ts` records costing it three separate defects.
  return { id: (await record.json()).id as string, artistId };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the shelf is the default view, and a spine names its record', async ({ page }) => {
  /**
   * §10b makes the shelf "the default view of `/` on desktop" — asserted
   * because it is a contract change that broke 22 specs when it landed, and the
   * thing that broke them was the default rather than the shelf.
   *
   * The spine's accessible name is the RECORD, not its truncated visible text.
   * That was a real defect: a link reading "Luther Vandross  Nev…  FE 37451"
   * names nothing to a screen reader or to any consumer.
   */
  const title = `Shelved ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');

  /*
    The wall is the isometric composition now (8a §11), so its marker is
    `wall`. The property — the shelf is the default view of `/` — is unchanged.
  */
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(
    page.getByRole('link', { name: new RegExp(title) }),
    'the spine is named by the record, whatever its spine text says',
  ).toBeVisible();
});

test('a spine is a link, so it survives without JavaScript', async ({ browser, page }) => {
  /**
   * §W.8: the spine is an <a> inside the SVG whose click is intercepted into
   * the pull, so the href goes somewhere correct if the handler never runs.
   *
   * **Asserted by navigating with JavaScript OFF, not by reading the href.** An
   * href is necessary and not sufficient — an element can carry one and still
   * not be navigable without its handler — and the earlier version of this
   * test asserted the attribute, which is the proxy shape.
   */
  const title = `Linked ${suffix()}`;
  const { id } = await seedRecord(page, title);

  const storage = await page.context().storageState();
  const noJs = await browser.newContext({ storageState: storage, javaScriptEnabled: false });
  try {
    const plain = await noJs.newPage();
    await plain.goto('/');
    const link = plain.getByRole('link', { name: new RegExp(title) });
    await expect(link).toHaveAttribute('href', `/records/${id}`);
    /* The link's box spans its three faces and its centre falls on paper between them; the spine is the target. */
    await link.locator('[data-spine]').click();
    await expect(plain).toHaveURL(`/records/${id}`);
  } finally {
    await noJs.close();
  }
});

/**
 * Step 36 (§W.29): "Without JavaScript the wall starts at its origin, whole
 * and reachable." The markup arrival is a transform the landing effect
 * clears; with script off it stayed, and the rows above the arrival could
 * not be scrolled to. Two rows at 1280 (twenty and four), so the first
 * spine sits above the arrival and the last below it; both must scroll into
 * the region and take focus.
 */
test('without JavaScript the first and last spines can both be scrolled to and focused (§W.29, step 36)', async ({ browser, page }) => {
  await login(page);
  const db = getTestDb();
  const run = suffix();
  const a = await db.execute(sql`INSERT INTO artists (name) VALUES (${'NoJs-' + run}) RETURNING id`);
  const artistId = (a.rows[0] as { id: string }).id;
  trackArtist(artistId);
  await db.execute(sql`INSERT INTO records (artist_id, title, release_year) SELECT ${artistId}::uuid, ${'NoJs ' + run + ' '} || i, 1980 FROM generate_series(1, 24) i`);
  const storage = await page.context().storageState();
  const noJs = await browser.newContext({ storageState: storage, javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const plain = await noJs.newPage();
    /*
      Measured before this was built: the server renders the offset
      translate(-5px, -75px) for the first shelf regardless of ?shelf= --
      the addressed shelf is applied by the landing effect, client-side --
      so without JavaScript the offset hides 75px of landing pad and never a
      row, and 'first and last reachable' alone could not fail. The
      assertion that can: with script off the wall is at its ORIGIN, the
      offset's computed transform none (§W.29: "Without JavaScript the wall
      starts at its origin, whole and reachable").
    */
    await plain.goto(`/?artistId=${artistId}`);
    const spines = plain.locator('a[data-seat]');
    await expect(spines).toHaveCount(24);
    const offset = await plain.locator('[data-arrival-offset]').evaluate((el) => getComputedStyle(el).transform);
    expect(offset, 'the arrival offset is cleared without script, by the noscript style').toBe('none');
    for (const which of ['first', 'last'] as const) {
      const spine = which === 'first' ? spines.first() : spines.last();
      await spine.scrollIntoViewIfNeeded();
      await spine.focus();
      const state = await spine.evaluate((el) => {
        const region = el.closest('[data-region="wall"]') as HTMLElement;
        const r = region.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return { inside: b.top >= r.top - 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.right <= r.right + 1, focused: document.activeElement === el, top: Math.round(b.top - r.top) };
      });
      expect(state.inside, `the ${which} spine scrolls into the region (top ${state.top}px from the region's top)`).toBe(true);
      expect(state.focused, `the ${which} spine takes focus`).toBe(true);
    }
  } finally {
    await noJs.close();
  }
});

test('the wall shows the records the heading says it does', async ({ page }) => {
  /**
   * **The defect this test was written for, and the reason it is a SEAM test.**
   *
   * The shelf is the default view of `/`. Filtering to a genre rendered every
   * spine in the collection under a heading reading the FILTERED count — five
   * spines beneath "2 records", with the chip lit and "Clear filter" offered.
   * The count came from the filtered `listRecords` query and the wall from
   * `shelfRecords()`, which took no arguments at all and returned everything.
   *
   * A user would believe a false thing: that they own five Rock records. That
   * is the confidently-misleading class CLAUDE.md §8 is about, on the screen
   * they see first.
   *
   * **It survived units 6 through 20 because nothing asserted the shelf honours
   * a filter.** Units 20 and 21 both wrote GEOMETRY tests for this wall —
   * measuring how wide it was — without noticing it was showing the wrong
   * records.
   *
   * **The two counts are asserted against EACH OTHER, not each against its own
   * expectation.** That is the shape `genreRollup`'s test uses to pin two
   * implementations together: a test comparing each to a literal passes when
   * both drift the same way, and passes when a fixture changes and someone
   * updates both numbers. Comparing the producers to each other fails the
   * moment they disagree, whatever the collection contains.
   */
  const suffixed = suffix();
  const genre = await page.request.post('/api/genres', { data: { name: `Filtered-${suffixed}` } });
  expect(genre.status(), 'the fixture genre must exist').toBe(201);
  const genreId = (await genre.json()).id as string;
  trackGenre(genreId);

  // Two records in the genre, one outside it — so a correct filter changes the
  // answer and an ignored filter does not.
  const { artistId } = await seedRecord(page, `In genre A ${suffixed}`);
  const inGenre = await page.request.post('/api/records', {
    data: { title: `In genre B ${suffixed}`, artistId, genreIds: [genreId] },
  });
  expect(inGenre.status()).toBe(201);
  const firstId = (await page.request.get(`/api/records?artistId=${artistId}`)).ok();
  expect(firstId, 'the fixture records must be readable').toBe(true);

  // Tag the first record into the genre too, leaving a third outside.
  await seedRecord(page, `Outside ${suffixed}`);

  await page.goto(`/?genreId=${genreId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  /*
    Two counts asserted against EACH OTHER: the composition's 72 (§W.7's
    COLLECTION count, from the wall's own seats) and the number of spines
    drawn as links. The heading's "N of M" line is the same number again when a
    filter is on.
  */
  const shown = Number((await page.getByTestId('wall-count').textContent())?.trim());
  expect(shown, 'the composition states a count').not.toBeNaN();
  const onWall = await page.getByTestId('wall').locator('a[data-seat]').count();
  expect(onWall, `the wall draws ${onWall} spines under a count of ${shown}`).toBe(shown);
});

test('the shelf view has no header band: the wall starts under the nav, and the rail carries the controls (§W.13)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  /* No heading, no band: the facts column's COLLECTION and count are the identity (§W.9). */
  await expect(page.getByRole('heading', { level: 1, name: 'Collection' })).toHaveCount(0);
  await expect(page.getByTestId('shelf-controls-toggle')).toHaveCount(0);
  const rail = page.getByTestId('wall-rail');
  await expect(rail).toBeVisible();
  const geometry = await page.evaluate(() => {
    const box = (q: string) => document.querySelector(q)?.getBoundingClientRect();
    return { nav: box('[data-app-nav]'), wall: box('[data-testid="wall"]'), rail: box('[data-testid="wall-rail"]'), facts: box('[data-region="facts"]'), region: box('[data-region="wall"]') };
  });
  expect(geometry.nav && geometry.wall && geometry.rail && geometry.facts && geometry.region).toBeTruthy();
  if (!geometry.nav || !geometry.wall || !geometry.rail || !geometry.facts || !geometry.region) return;
  expect(Math.abs(geometry.wall.top - geometry.nav.bottom), 'directly under the nav').toBeLessThan(2);
  expect(geometry.rail.width, '148px').toBeCloseTo(148, 0);
  expect(geometry.rail.left).toBeLessThan(geometry.facts.left);
  expect(geometry.facts.width, '420px').toBeCloseTo(420, 0);
  expect(geometry.region.left, 'the drawing stays rightmost').toBeGreaterThan(geometry.facts.left);
  /* The rail's order: search, the views, add record. */
  /* The rail's order: the one form (search, genre, sort), the views, add record. */
  const order = await rail.evaluate((el) => Array.from(el.querySelectorAll('form, a')).map((n) => (n.tagName === 'FORM' ? n.getAttribute('role') : n.textContent?.trim())));
  expect(order).toEqual(['search', 'Shelf', 'Table', 'Grid', 'Add record']);
  /* SEARCH first and SORT last; GENRE between them when the collection has genre facets (the §W.24 test seeds one and asserts all three). */
  const fields = await rail.evaluate((el) => Array.from(el.querySelectorAll('form label')).map((n) => n.textContent?.trim()));
  expect(fields[0]).toBe('Search');
  expect(fields[fields.length - 1]).toBe('Sort');
  await expect(rail.getByRole('link', { name: 'Shelf' })).toHaveAttribute('aria-current', 'page');
});

test('search from the rail narrows the wall, and the count says so', async ({ page }) => {
  const artist = await page.request.post('/api/artists', { data: { name: `Shelf-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  /*
    Distinct titles with NO shared stamp: the search is trigram OR substring,
    and a suffix common to all three would score every title above the 0.3
    threshold against any one of them. The artist filter, carried through the
    rail's hidden inputs, is what scopes the search to this test's records.
  */
  const titles = ['Wired', 'Gaucho', 'Believer'];
  for (const title of titles) {
    const record = await page.request.post('/api/records', { data: { title, artistId } });
    expect(record.status()).toBe(201);
  }
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId('wall-count')).toHaveText('3');
  const search = page.getByTestId('wall-rail').getByLabel('Search');
  await search.fill(titles[0]);
  await search.press('Enter');
  await expect(page).toHaveURL(/q=Wired/);
  await expect(page.getByTestId('wall-count')).toHaveText('1');
  /* The filter-aware line under the count carries what the header's count used to. */
  await expect(page.getByTestId('wall').locator('[data-region="count"]')).toContainText(/1 of \d+/);
});

test('the rail’s sort reorders the wall itself (§W.24)', async ({ page }) => {
  /*
    The control submitted a `sort` the shelf query ignored: the wall kept its
    genre-section order whatever the URL said, so the rail had a control that
    did nothing. The section order is the DEFAULT — §W.1 leaves position
    carrying the collection's order, and which order that is is the reader's.
  */
  const stamp = suffix();
  const artist = await page.request.post('/api/artists', { data: { name: `Sort-${stamp}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  for (const [i, title] of ['Charlie', 'Alpha', 'Echo', 'Bravo', 'Delta'].entries()) {
    const record = await page.request.post('/api/records', { data: { title, artistId, releaseYear: 1990 - i } });
    expect(record.status()).toBe(201);
  }

  /**
   * The wall's own reading order, by each spine's accessible name: shelf by
   * shelf from the top, and left to right along each.
   *
   * **It was left to right only, and that made the test depend on records it
   * never created.** The wall seats the whole collection and this test's five
   * sit among it, so how they fall across shelves depends on how many other
   * records there are. Measured on 6 Oct with N extra records on the wall,
   * under title descending, ordered by x: N = 0, Alpha first (it had wrapped
   * to the next shelf, at the left); N = 4, Charlie, Bravo, Alpha, Echo,
   * Delta; N = 10, the expected order; N = 20, Alpha first again. It passed
   * in full runs on whatever other specs had left on the wall, and failed
   * among the seventeen alone. The sort itself was applied every time.
   *
   * Along one shelf the drawing runs down to the right at 30 degrees, so
   * `top − left × tan 30°` is the same for every seat on it (within 1px,
   * measured) and steps by about 198 from one shelf to the next. That is the
   * shelf; the seat's left is its place along it.
   */
  const order = () =>
    page.evaluate(() => {
      const TAN30 = Math.tan(Math.PI / 6);
      return Array.from(document.querySelectorAll('a[data-seat]'))
        .map((el) => {
          const box = el.getBoundingClientRect();
          return { x: box.left, shelf: Math.round((box.top - box.left * TAN30) / 60), title: (el.getAttribute('aria-label') ?? '').split('·').pop()?.trim() };
        })
        .sort((a, b) => a.shelf - b.shelf || a.x - b.x)
        .map((seat) => seat.title);
    });

  await page.goto(`/?artistId=${artistId}&sort=title%3Aasc`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(await order()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);

  await page.goto(`/?artistId=${artistId}&sort=title%3Adesc`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(await order(), 'the direction reaches the wall too').toEqual(['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha']);

  /* And through the control itself, which is how a reader reaches it. */
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('select[data-hydrated="true"]').first().waitFor({ timeout: 15_000 });
  await page.getByTestId('wall-rail').getByLabel('Sort').selectOption('releaseYear:asc');
  await expect(page).toHaveURL(/sort=releaseYear/, { timeout: 15_000 });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  expect(await order(), 'oldest first: Delta 1986 … Charlie 1990').toEqual(['Delta', 'Bravo', 'Echo', 'Alpha', 'Charlie']);
});

test('genre and sort from the rail narrow and order the wall without leaving it (§W.24)', async ({ page }) => {
  const stamp = suffix();
  const genre = await page.request.post('/api/genres', { data: { name: `Rail-${stamp}` } });
  expect(genre.status()).toBe(201);
  const genreId = (await genre.json()).id as string;
  trackGenre(genreId);
  const artist = await page.request.post('/api/artists', { data: { name: `Rail-${stamp}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  for (const [title, inGenre] of [['Believer', true], ['Gaucho', true], ['Wired', false]] as const) {
    const record = await page.request.post('/api/records', { data: { title, artistId, ...(inGenre ? { genreIds: [genreId] } : {}) } });
    expect(record.status()).toBe(201);
  }
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId('wall-count')).toHaveText('3');
  const rail = page.getByTestId('wall-rail');
  const fields = await rail.evaluate((el) => Array.from(el.querySelectorAll('form label')).map((n) => n.textContent?.trim()));
  expect(fields, 'SEARCH, then GENRE and SORT beneath it').toEqual(['Search', 'Genre', 'Sort']);
  /* Choosing a genre is the submit: the artist scope rides along as a hidden input. The selects submit only once hydrated. */
  const hydrated = () => rail.locator('select[data-hydrated="true"]').first().waitFor({ timeout: 15_000 });
  await hydrated();
  await rail.getByLabel('Genre').selectOption(genreId);
  await expect(page).toHaveURL(new RegExp(`genreId=${genreId}`));
  await expect(page).toHaveURL(new RegExp(`artistId=${artistId}`));
  await expect(page.getByTestId('wall-count')).toHaveText('2');
  await expect(rail.getByLabel('Genre')).toHaveValue(genreId);
  /* And the sort keeps the genre. A fresh document after the submit: wait for its selects to hydrate too. */
  await hydrated();
  await rail.getByLabel('Sort').selectOption('title:desc');
  await expect(page).toHaveURL(/sort=title(%3A|:)desc/);
  await expect(page).toHaveURL(new RegExp(`genreId=${genreId}`));
  await expect(page.getByTestId('wall-count')).toHaveText('2');
  await expect(rail.getByLabel('Sort')).toHaveValue('title:desc');
});

test('a filter empties seats rather than re-seating them, and the emptied seats are drawn (§W.12, §W.34)', async ({ page }) => {
  /*
    **The fixture's matches must NOT be contiguous in wall order, and that is
    the whole reason this test was rewritten.** The wall orders by genre
    section, so records carrying a test genre sort to the front of the shelf
    together: filter to that genre and the survivors were already adjacent,
    so a build that repacked and a build that held looked identical. The
    earlier version asserted position without count and would have passed on
    a build that dropped every emptied seat.

    So: three genres, assigned so the filtered genre's records are separated
    by records of another — the gaps then fall INSIDE the run, where holding
    and repacking differ. Asserted together: the seat count is unchanged, the
    matched count is right, and every surviving position is identical against
    the UNFILTERED layout.
  */
  const stamp = suffix();
  const target = await page.request.post('/api/genres', { data: { name: `AShape-${stamp}` } });
  const targetId = (await target.json()).id as string;
  trackGenre(targetId);
  const other = await page.request.post('/api/genres', { data: { name: `BShape-${stamp}` } });
  const otherId = (await other.json()).id as string;
  trackGenre(otherId);
  const artist = await page.request.post('/api/artists', { data: { name: `Shape-${stamp}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  /* Six records alternating between the two genres, so neither set is contiguous. */
  const ids: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const record = await page.request.post('/api/records', {
      data: { title: `Shape ${String(i).padStart(2, '0')}`, artistId, genreIds: [i % 2 === 0 ? targetId : otherId] },
    });
    expect(record.status()).toBe(201);
    ids.push((await record.json()).id as string);
  }

  /** Every seat's x against the left upright, so scroll and frame origin drop out. */
  const measure = (seatIds: string[]) =>
    page.evaluate((all) => {
      const uprights = Array.from(document.querySelectorAll('[data-furniture="upright-front"]')).map((el) => el.getBoundingClientRect().left);
      const origin = Math.min(...uprights);
      const at = (id: string) => {
        const box = document.querySelector(`[data-seat="${id}"] [data-spine]`)?.getBoundingClientRect();
        return box === undefined ? null : Math.round(box.left - origin);
      };
      return {
        length: Math.round(Math.max(...uprights) - origin),
        pieces: document.querySelectorAll('[data-piece]').length,
        drawn: document.querySelectorAll('a[data-seat]').length,
        footprints: document.querySelectorAll('[data-footprint]').length,
        /* Footprints among THIS fixture's records — a footprint carries the displaced record's id. */
        footprintsMine: all.filter((id) => document.querySelector(`[data-footprint="${id}"]`) !== null).length,
        seats: Object.fromEntries(all.map((id) => [id, at(id)])),
      };
    }, seatIds);

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId('wall-count')).toHaveText('6');
  const rest = await measure(ids);
  expect(rest.drawn, 'all six are drawn unfiltered').toBe(6);
  /*
    **Counted among this fixture's records, not the whole wall's.** This line
    asserted zero footprints on the wall and failed under the full suite with
    67: `?artistId=` is a filter (§W.12), so every record another spec has
    seeded at that moment is displaced and §W.34 owes it a footprint. A
    baseline-and-delta was tried first and failed too — the navigation spec
    seeds sixty records and deletes them between this test's two page loads,
    so even the gap between loads is wide enough. So a footprint now carries
    the displaced record's id, and the claim is exact and owes nothing to the
    rest of the database: none of these six is a footprint unfiltered, and
    exactly three are once the genre filter is on.
  */
  expect(rest.footprintsMine, 'none of the six is a footprint when nothing is filtered').toBe(0);

  await page.goto(`/?artistId=${artistId}&genreId=${targetId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId('wall-count'), 'the seated records').toHaveText('3');
  const filtered = await measure(ids);

  /* The COUNT: three drawn, three emptied, and the fixture itself unchanged. */
  expect(filtered.drawn, 'only the matches are drawn').toBe(3);
  expect(filtered.pieces, 'the fixture is the same fixture').toBe(rest.pieces);
  expect(Math.abs(filtered.length - rest.length), 'the row did not shorten').toBeLessThan(1);

  /* §W.34: every seat a record was displaced from draws its footprint. */
  expect(filtered.footprintsMine, 'one footprint per emptied seat, among the six').toBe(3);

  /* The POSITIONS, against the unfiltered layout: every survivor is where it was. */
  for (const [index, id] of ids.entries()) {
    if (index % 2 === 0) {
      expect(filtered.seats[id], `match ${index} is drawn`).not.toBeNull();
      expect(Math.abs((filtered.seats[id] ?? NaN) - (rest.seats[id] ?? NaN)), `match ${index} keeps its seat`).toBeLessThan(1);
    } else {
      expect(filtered.seats[id], `non-match ${index} draws no spine`).toBeNull();
    }
  }

  await page.request.delete(`/api/genres/${targetId}`);
  await page.request.delete(`/api/genres/${otherId}`);
});

test('the rail’s view list reaches the table and comes back to the shelf', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.getByTestId('wall-rail').getByRole('link', { name: 'Table' }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.getByTestId('wall')).toHaveCount(0);
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'shelf', exact: true }).click();
  await expect(page.getByTestId('wall'), 'and the shelf is reachable again').toBeAttached({ timeout: 30_000 });
});

test('the table and grid keep their controls on the page', async ({ page }) => {
  /**
   * The regression this unit is most likely to cause. §10's screens table
   * states the asymmetry: a list wants its controls visible, and the overlay is
   * about the wall only.
   *
   * If this fails, the overlay was built at the wrong level — around the shared
   * component rather than around the shelf's use of it.
   */
  const title = `Listed ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  for (const view of ['table', 'grid'] as const) {
    await page.goto(`/?view=${view}&artistId=${artistId}`);

    await expect(
      page.getByRole('search'),
      `${view} must show its search without opening anything`,
    ).toBeVisible();
    await expect(
      page.getByTestId('shelf-controls-toggle'),
      `${view} has no overlay toggle`,
    ).toHaveCount(0);
  }
});

test('the table view is still reachable, and the shelf is not forced', async ({ page }) => {
  // §10b makes the shelf the default; §10's toggle still reaches the others.
  // The shelf is a third mode rather than a replacement.
  const title = `Tabled ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  // Scoped to this run's artist: the table paginates at 50, so an unfiltered
  // page 1 is whatever other specs happened to create.
  await page.goto(`/?view=table&artistId=${artistId}`);

  await expect(page.getByTestId('wall-scene')).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});
