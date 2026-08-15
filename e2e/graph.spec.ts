import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §11 flow #6: "Load the graph, click a node, verify the collection
 * filters." Plus §8.1's rendering rules and §10's `/graph` row.
 *
 * **The sparseness rule is tested here, not just respected.** §8.1 forbids a
 * layout that implies structure the data does not have, so the test below
 * asserts that unconnected artists produce NO edges — the visual equivalent of
 * 12b's empty-links assertion. A graph that quietly drew a line between every
 * pair to look busier would pass a screenshot review and fail this.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the graph is reachable from the nav, not only by URL', async ({ page }) => {
  // A screen nothing links to is the unreachable-path shape that cost this
  // build §6's genre mapping (NOTES). Routable is not reachable.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Graph' }).click();

  await expect(page).toHaveURL(/\/graph$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Graph', level: 1 })).toBeVisible();
});

test('loading the graph, clicking a node, and landing on the filtered collection', async ({
  page,
}) => {
  /**
   * §11 flow #6 end to end. The click target is an artist with a record, so
   * the destination is a collection filtered to something that exists — a
   * filter landing on an empty list would pass a naive assertion while telling
   * the user nothing.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Graphed-${suffix}` });
  await post(page, '/api/records', { title: `Graphed LP ${suffix}`, artistId: artist.id });

  await page.goto('/graph');

  const node = page.getByTestId('graph-node').filter({ hasText: `Graphed-${suffix}` });
  await expect(node).toHaveCount(1, { timeout: 15_000 });
  await node.click();

  await expect(page).toHaveURL(new RegExp(`artistId=${artist.id}`), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Graphed LP ${suffix}` })).toBeVisible({
    timeout: 15_000,
  });
});

test('unconnected artists are drawn unconnected — sparseness is not disguised', async ({
  page,
}) => {
  /**
   * §8.1: "A collection of unrelated artists is genuinely a scatter of
   * unconnected dots." Three artists sharing nothing must produce three nodes
   * and zero edges.
   *
   * The node-count assertion carries the edge assertion: without it this would
   * pass against a graph that rendered nothing at all, which is the vacuous
   * shape CLAUDE.md §2 names.
   */
  const suffix = makeSuffix();
  for (const name of ['Alone-A', 'Alone-B', 'Alone-C']) {
    const artist = await post(page, '/api/artists', { name: `${name}-${suffix}` });
    await post(page, '/api/records', { title: `${name} LP ${suffix}`, artistId: artist.id });
  }

  await page.goto('/graph');

  const seeded = page.getByTestId('graph-node').filter({ hasText: suffix });
  await expect(seeded).toHaveCount(3, { timeout: 15_000 });

  const edgesBetweenSeeded = page.getByTestId('graph-link').filter({ hasText: suffix });
  await expect(edgesBetweenSeeded, 'no line the data does not justify').toHaveCount(0);
});

test('an influence edge is drawn between two collected artists', async ({ page }) => {
  /**
   * The other half of the sparseness rule: an edge that SHOULD exist does.
   * Without this, "no edges" would be satisfiable by never drawing edges at
   * all — a graph that is honest and useless.
   *
   * An INFLUENCE rather than a shared member, because memberships are written
   * only by the MusicBrainz lineup import (§12 step 11) and there is no
   * endpoint to seed one over HTTP — the lineup route is mocked in every E2E
   * that touches it. `shared_member` edges are covered against a real database
   * in test/integration/graph.test.ts, which can insert the rows directly.
   */
  const suffix = makeSuffix();
  const source = await post(page, '/api/artists', { name: `Influencer-${suffix}` });
  const target = await post(page, '/api/artists', { name: `Influenced-${suffix}` });
  await post(page, '/api/records', { title: `Src LP ${suffix}`, artistId: source.id });
  await post(page, '/api/records', { title: `Tgt LP ${suffix}`, artistId: target.id });

  await post(page, '/api/influences', {
    sourceArtistId: source.id,
    targetArtistId: target.id,
    strength: 4,
  });

  await page.goto('/graph');

  await expect(page.getByTestId('graph-node').filter({ hasText: suffix })).toHaveCount(2, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('graph-link')).not.toHaveCount(0, { timeout: 15_000 });
});

test('the genre subset control narrows the graph to that genre', async ({ page }) => {
  /**
   * §10's `/graph` row: "Controls: genre subset, reset zoom." Selecting a genre
   * must actually subset the graph, not merely render a control — so this
   * seeds an artist OUTSIDE the chosen genre and asserts it disappears.
   */
  const suffix = makeSuffix();
  const genre = await post(page, '/api/genres', { name: `Subset-${suffix}` });

  const inGenre = await post(page, '/api/artists', { name: `InGenre-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `In LP ${suffix}`,
    artistId: inGenre.id,
    genreIds: [genre.id],
  });
  expect(record.id, 'seeded record').toBeTruthy();

  const outGenre = await post(page, '/api/artists', { name: `OutGenre-${suffix}` });
  await post(page, '/api/records', { title: `Out LP ${suffix}`, artistId: outGenre.id });

  await page.goto('/graph');
  await page.getByRole('combobox', { name: 'Genre subset' }).selectOption(genre.id);

  await expect(page).toHaveURL(new RegExp(`genreId=${genre.id}`), { timeout: 15_000 });

  const nodes = page.getByTestId('graph-node');
  await expect(nodes.filter({ hasText: `InGenre-${suffix}` })).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(nodes.filter({ hasText: `OutGenre-${suffix}` })).toHaveCount(0);
});
