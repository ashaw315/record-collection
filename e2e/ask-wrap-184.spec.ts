import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { getTestDb } from '../test/helpers/db';
import { aboutHash } from '../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../src/lib/openai/embeddings';
import { stubEmbedding } from '../src/lib/openai/stub-embedding';
import { nearViewMinWidth } from '../src/app/wall/view-fork';

/**
 * **§P.5 and §P.6 as Design's "Ask field wraps and count line" rules them (13 Nov), in every host of the ask-overflow
 * specimen.** "The ask field takes the host’s width and as many lines as the phrase needs, so the whole phrase stays in
 * view as it is typed and after." "No line cap is ruled, since a cap hides text again." "The field’s growth is a state
 * of the field: one line at rest when empty, and its phrase’s lines when not." §P.4: "the ask field grows only as the
 * reader types, so ASK moves under a reader writing, never between two presses." §P.6: "The count line stands beneath
 * the slot", "so both may be drawn at once"; for 184, "Not set up yet." is the slot's and the line is beneath it.
 *
 * The specimen's phrase, 365.3 wide on one line, against fields of 112 (the rail as a column), 300 (the sidebar) and
 * 354 (the band at 390). Each case fails against the one-line input that scrolled, or the count line drawn between the
 * field and ASK (the rail, the sidebar) or above the slot (the far view's band, by its stylesheet's order).
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const PHRASE = 'something slow and warm for a rainy sunday morning';

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');
const ask = (page: Page) => control(page).getByRole('button', { name: /^ask$/i });
const slot = (page: Page) => control(page).locator('[data-pick-slot]');
const countLine = (page: Page) => control(page).locator('[data-without-about]');

type Host = { name: string; wide: boolean; open: (page: Page, artistId: string) => Promise<void> };

const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });

const HOSTS: readonly Host[] = [
  { name: 'the shelf’s rail, a column, at 1440', wide: true, open: async (page, a) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/?artistId=${a}`); await wallMeasured(page); } },
  {
    name: 'the far view’s rail, a column, at 1440',
    wide: true,
    open: async (page, a) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?artistId=${a}`);
      await wallMeasured(page);
      await page.getByTestId('wall-zoom-out').click();
      await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
    },
  },
  { name: 'the far view’s rail, a band, below the fork', wide: true, open: async (page, a) => { await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 900 }); await page.goto(`/?artistId=${a}`); await wallMeasured(page); } },
  { name: 'the table’s sidebar at 1440', wide: true, open: async (page, a) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/?view=table&artistId=${a}`); await filtersReady(page); } },
  { name: 'the grid’s sidebar at 1440', wide: true, open: async (page, a) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/?view=grid&artistId=${a}`); await filtersReady(page); } },
  { name: 'the table’s band at 390', wide: false, open: async (page, a) => { await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/?view=table&artistId=${a}`); await filtersReady(page); } },
  { name: 'the grid’s band at 390', wide: false, open: async (page, a) => { await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/?view=grid&artistId=${a}`); await filtersReady(page); } },
];

/** The mobile project (WebKit, the engine the field's growth is scripted for) runs the hosts at 390; the wide hosts are the chromium project's. */
const hostsFor = (testInfo: TestInfo) => HOSTS.filter((h) => testInfo.project.name !== 'mobile' || !h.wide);

/** Three records with an ABOUT and its vector, so an ask answers in every host. */
async function fixture(page: Page): Promise<string> {
  const suffix = `aw184${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Wrap-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Wrap', suffix, 3);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
  const db = getTestDb();
  for (const [i, row] of listed.data.entries()) {
    const about = `A slow warm record for a rainy morning, number ${i + 1}.`;
    await db.execute(sql`UPDATE records SET snippet = ${about} WHERE id = ${row.id}::uuid`);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  return artist.id;
}

/** The field's lines by its line box: the content height over the line height, and whether anything is scrolled out of it. */
const fieldFigures = (page: Page) =>
  field(page).evaluate((el) => {
    const f = el as HTMLTextAreaElement;
    const s = getComputedStyle(f);
    const content = f.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    return {
      lines: content / parseFloat(s.lineHeight),
      scrollHeight: f.scrollHeight,
      clientHeight: f.clientHeight,
      scrollWidth: f.scrollWidth,
      clientWidth: f.clientWidth,
      scrollTop: f.scrollTop,
      scrollLeft: f.scrollLeft,
    };
  });

test('the field rests at one line when empty, and grows to hold the whole phrase, focused and unfocused, in every host', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const artistId = await fixture(page);
  try {
    for (const host of hostsFor(testInfo)) {
      await host.open(page, artistId);
      const rest = await fieldFigures(page);
      expect(Math.round(rest.lines), `${host.name}: one line at rest`).toBe(1);
      await field(page).click();
      await field(page).pressSequentially(PHRASE);
      for (const state of ['focused', 'unfocused'] as const) {
        if (state === 'unfocused') await page.locator('body').click({ position: { x: 1, y: 1 } });
        const m = await fieldFigures(page);
        testInfo.annotations.push({ type: `${host.name}, ${state}`, description: `${m.lines.toFixed(2)} lines, ${m.clientWidth} wide` });
        expect(m.scrollHeight, `${host.name}, ${state}: no line is out of the field's box`).toBeLessThanOrEqual(m.clientHeight);
        expect(m.scrollWidth, `${host.name}, ${state}: nothing runs past its width`).toBeLessThanOrEqual(m.clientWidth);
        expect([m.scrollTop, m.scrollLeft], `${host.name}, ${state}: nothing scrolled`).toEqual([0, 0]);
      }
      /* "One line at rest when empty": the growth is the phrase's, and goes with it. */
      await field(page).fill('');
      expect(Math.round((await fieldFigures(page)).lines), `${host.name}: one line again once emptied`).toBe(1);
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('ASK stands where it stood across two presses without an edit, in every host', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const artistId = await fixture(page);
  const at = async () => ask(page).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY }; });
  const press = async () => {
    const answered = page.waitForResponse((r) => r.url().endsWith('/api/ask'));
    await ask(page).click();
    await answered;
    await expect(ask(page)).toBeEnabled();
  };
  try {
    for (const host of hostsFor(testInfo)) {
      await host.open(page, artistId);
      await field(page).fill(PHRASE);
      await press();
      const first = await at();
      await press();
      expect(await at(), `${host.name}: ASK did not move between two presses`).toEqual(first);
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('the count line stands beneath the slot, drawn with "Not set up yet." at once, in every host', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const artistId = await fixture(page);
  /* Production's state on 13 Nov, the key absent: the route answers 503 NOT_CONFIGURED and the slot says so in its own words. */
  await page.route('**/api/ask', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_CONFIGURED', message: 'Asking is not configured.' } }) }));
  try {
    for (const host of hostsFor(testInfo)) {
      await host.open(page, artistId);
      await expect(countLine(page), `${host.name}: the count line is drawn`).toBeVisible();
      /* Its place against the slot holds before any press, the slot empty, and after one, the slot speaking. */
      for (const pressed of [false, true]) {
        if (pressed) {
          await field(page).fill(PHRASE);
          await ask(page).click();
          await expect(slot(page)).toHaveText('Not set up yet.');
          await expect(countLine(page), `${host.name}: both at once`).toBeVisible();
        }
        const slotBox = await slot(page).boundingBox();
        const lineBox = await countLine(page).boundingBox();
        if (slotBox === null || lineBox === null) throw new Error(`${host.name}: not drawn`);
        expect(lineBox.y, `${host.name}, ${pressed ? 'the slot speaking' : 'the slot empty'}: the count line's top at or below the slot's foot`).toBeGreaterThanOrEqual(slotBox.y + slotBox.height);
      }
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});
