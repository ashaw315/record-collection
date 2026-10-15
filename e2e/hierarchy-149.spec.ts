import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackGenre } from './cleanup';
import { readReach } from './hit-area';
import { gapBetween } from './pair-gap';
import { login } from './sign-in';
import { LABEL_INK, expectBox, expectLabelControl, read } from './type-read';

/**
 * Step 149, §T.6's unnumbered "login at 1280 and the proposed hierarchy"
 * (Design, 14 Oct). Login's half is step 145's, built and captured there.
 * The hierarchy: "it is a section between hairlines. SUGGEST A HIERARCHY
 * and ACCEPT ALL 3 REMAINING are §9.3 boxes. Accept, Reject and Accept all
 * under Rock become ACCEPT, REJECT and ACCEPT ALL UNDER ROCK as §9.3 labels,
 * drawn 44 under a coarse pointer and 24 apart by the grouped-controls rule,
 * with no half-gap overlay. Each proposed genre sets its name on one line
 * with ACCEPT and REJECT at the line's right, and its evidence, 3 records:
 * The Doors — The Soft Parade, on the next line in the label colour. At
 * 390, as built, the name wrapped beside its evidence. The parent names,
 * Rock and Pop, stay as the groups' heads."
 *
 * The suggestion route is answered by the test, as manage.spec does: the
 * model is never called. Fails against the build before it: a top rule in
 * the theme's grey and no bottom one, SUGGEST A HIERARCHY an underlined
 * label, Accept and Reject underlined 4 apart on the evidence's line in
 * parentheses, ACCEPT ALL an outline button.
 */
registerCleanup();

const WINDOWS = [[1280, 'fine'], [390, 'coarse']] as const;

async function seedGenre(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/genres', { data: { name } });
  expect(response.status(), `seeding ${name} must succeed`).toBe(201);
  const id = ((await response.json()) as { id: string }).id;
  trackGenre(id);
  return id;
}

for (const [width, pointer] of WINDOWS) test(`the proposed hierarchy at ${width} under a ${pointer} pointer: a section between hairlines, two §9.3 boxes, three §9.3 labels 24 apart, each genre's evidence on its own line`, async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const run = `h149${Date.now().toString(36)}`;
  const rock = await seedGenre(page, `Rock-${run}`);
  const psych = await seedGenre(page, `Psychedelic Rock-${run}`);
  const aor = await seedGenre(page, `AOR-${run}`);
  await page.route('**/api/genres/parent-suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          pairings: [
            { genreId: psych, genre: `Psychedelic Rock-${run}`, parentId: rock, parent: `Rock-${run}` },
            { genreId: aor, genre: `AOR-${run}`, parentId: rock, parent: `Rock-${run}` },
          ],
          noParentFits: [],
          dropped: 0,
          evidence: {
            [`Psychedelic Rock-${run}`]: { recordCount: 3, examples: ['The Doors — The Soft Parade'] },
            [`AOR-${run}`]: { recordCount: 1, examples: ['Dire Straits — Dire Straits'] },
          },
        },
      }),
    });
  });
  await page.goto('/manage');
  await page.getByRole('button', { name: 'Genres', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Genres' })).toBeVisible();
  await page.getByTestId('propose-parents').click();
  const proposal = page.getByTestId('parent-proposal');
  await expect(proposal).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  /* The section between hairlines: a rule above and below, no box, no fill, as the duplicate review's. */
  const section = page.getByTestId('hierarchy');
  await expect(section, `${width}: the hierarchy is a section`).toHaveCount(1);
  expect.soft(await section.evaluate((el) => { const cs = getComputedStyle(el); return { borderTop: cs.borderTopWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth, radius: cs.borderTopLeftRadius, fill: cs.backgroundColor }; }), `${width}: between hairlines, no box`).toMatchObject({ borderTop: '1px', borderBottom: '1px', borderLeft: '0px', radius: '0px', fill: 'rgba(0, 0, 0, 0)' });

  /* The two boxes. */
  const suggest = (await read(page, '[data-testid="propose-parents"]'))[0];
  expectBox(suggest, `${width}: SUGGEST A HIERARCHY`);
  const acceptAll = (await read(proposal, '[data-testid="accept-all"]'))[0];
  expectBox(acceptAll, `${width}: ACCEPT ALL 2 REMAINING`);
  expect.soft(acceptAll.text, `${width}: says how many`).toMatch(/^Accept all 2 remaining$/);

  /* One proposed genre's line: the name, ACCEPT and REJECT at the line's right, 24 apart, and the evidence on the next line. */
  const row = proposal.getByTestId(`pairing-${psych}`);
  const name = (await read(row, '[data-genre-name]'))[0];
  expect(name, `${width}: the genre's name is marked`).toBeDefined();
  const verbs = (await read(row, 'button')).filter((r) => r.height > 0);
  expect(verbs.map((r) => r.text), `${width}: ACCEPT then REJECT`).toEqual(['Accept', 'Reject']);
  for (const r of verbs) { expectLabelControl(r, `${width}: ${r.text}`); expect.soft(r.height, `${width}: ${r.text} is 44`).toBe(44); }
  expect.soft(gapBetween(verbs[0].edges, verbs[1].edges), `${width}: ACCEPT and REJECT 24 apart`).toMatchObject({ gap: 24 });
  expect.soft(name.edges.top, `${width}: the name on the verbs' line`).toBeGreaterThanOrEqual(verbs[0].edges.top - 1);
  expect.soft(name.edges.bottom, `${width}: and not below it`).toBeLessThanOrEqual(verbs[0].edges.bottom + 1);
  expect.soft(verbs[0].edges.left, `${width}: the verbs right of the name`).toBeGreaterThan(name.edges.right);
  const rowRight = await row.evaluate((el) => el.getBoundingClientRect().right);
  expect.soft(Math.round(rowRight - verbs[1].edges.right), `${width}: REJECT at the line's right`).toBeLessThanOrEqual(1);
  const evidence = (await read(row, `[data-testid="evidence-${psych}"]`))[0];
  expect.soft(evidence.text, `${width}: the evidence, stated`).toBe('3 records: The Doors — The Soft Parade');
  expect.soft(LABEL_INK, `${width}: in the label colour`).toContain(evidence.colour);
  expect.soft(evidence.edges.top, `${width}: on the next line, below the verbs' line`).toBeGreaterThanOrEqual(verbs[0].edges.bottom - 0.5);
  expect.soft(Math.round(evidence.edges.left), `${width}: starting where the name starts, not beside it`).toBe(Math.round(name.edges.left));

  /* The group's head stays, and ACCEPT ALL UNDER ROCK is a label. */
  const heads = (await read(proposal, 'h4')).map((r) => r.text);
  expect(heads, `${width}: the parent's name heads the group`).toContain(`Rock-${run}`);
  const under = (await read(proposal, `[data-testid="accept-group-Rock-${run}"]`))[0];
  expectLabelControl(under, `${width}: ACCEPT ALL UNDER ROCK`);
  expect.soft(under.height, `${width}: 44`).toBe(44);

  /* Under a coarse pointer: 44 reached, and no half-gap overlay past the label's own box. */
  if (pointer === 'coarse') {
    const reach = await readReach(page, '[data-testid="parent-proposal"]');
    const labels = reach.filter((r) => /^(Accept|Reject)$/.test(r.name.trim()));
    expect(labels.length, `${width}: the four verbs read`).toBe(4);
    for (const r of labels) {
      expect.soft(r.tall, `${width}: ${r.name} reaches 44 down`).toBeGreaterThanOrEqual(44);
      expect.soft([r.left, r.right], `${width}: ${r.name} has no overlay past its box`).toEqual([0, 0]);
    }
  }
  await context.close();
});
