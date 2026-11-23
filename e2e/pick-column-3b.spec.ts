import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { WRITE_CAPTURES } from './write-captures';
import { getTestDb } from '../test/helpers/db';
import { aboutHash } from '../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../src/lib/openai/embeddings';
import { stubEmbedding } from '../src/lib/openai/stub-embedding';

/**
 * **Step 3, unit 3b (§P.4, the five-cell ruling of 21 Nov): in the column host the answer is five cells, two across, the
 * nearest first, 24 between them and 24 below the count's last line; when the answer appears its first row stands wholly
 * inside the window wherever the page is scrolled, and the rest runs below, whole, reached by scrolling.** Asserted at
 * 1440 × 900 and 1440 × 768 with five un-wrapped captions and with the tallest five captions the real records hold
 * (docs/captures/real-records.json, by caption length: Donna Summer's On The Radio, The Best Of The Blues Project, Bridge
 * Over Troubled Water, Never Too Much, The Hurdy Gurdy Man). Reported: the window height below which the first row no
 * longer fits beneath the count, measured rather than Design's 494. Captured for Adam: the tallest five at both heights,
 * scrolled to the rail's foot and pressed there.
 *
 * Every record here is seeded, with a stub-model vector over an ABOUT carrying three words no other ABOUT in the test
 * database holds, so the ask's five are these five by construction; nothing here describes the collection.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

/* A phrase of this test's own: four tests run at once on four workers, and the stub model ranks by shared words, so each pool's ABOUTs carry a word no other pool's has. */
const phraseFor = (suffix: string) => `zebra quartz ${suffix}`;
/* One artist per record, named apart: the artists route refuses a second row with the same name. */
/* Short enough never to wrap at 160, and unique per test: two tests at two heights run at once and the artists route refuses a name twice. */
const shortCaptions = (code: string) => ['A', 'B', 'C', 'D', 'E'].map((k) => ({ artist: `P${k}${code}`, title: `Ask ${k}` }));
const TALLEST = [
  { artist: 'Donna Summer', title: 'On The Radio: Greatest Hits Vol. 1 & 2' },
  { artist: 'The Blues Project', title: 'The Best Of The Blues Project' },
  { artist: 'Simon & Garfunkel', title: 'Bridge Over Troubled Water' },
  { artist: 'Luther Vandross', title: 'Never Too Much' },
  { artist: 'Donovan', title: 'The Hurdy Gurdy Man' },
];

/**
 * Five records with the captions given. An artist named as the real record's is reused where the seventeen seed it
 * (Donna Summer, Luther Vandross and the rest are real rows in the test database) and created otherwise; the short set's
 * artists are four characters, so nothing wraps. Only this test's records are removed after, by id: an artist the
 * seventeen own keeps its own records.
 */
async function pool(page: Page, captions: ReadonlyArray<{ artist: string; title: string }>): Promise<{ records: string[]; phrase: string }> {
  const suffix = `p3b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const phrase = phraseFor(suffix);
  const db = getTestDb();
  const records: string[] = [];
  for (const [i, c] of captions.entries()) {
    const existing = (await db.execute<{ id: string }>(sql`SELECT id FROM artists WHERE name = ${c.artist} LIMIT 1`)).rows[0];
    let artistId = existing?.id;
    if (artistId === undefined) {
      const artist = (await (await page.request.post('/api/artists', { data: { name: c.artist } })).json()) as { id: string };
      trackArtist(artist.id);
      artistId = artist.id;
    }
    const about = `${phrase} ${i + 1}: a record for the column host.`;
    const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title, snippet) VALUES (${artistId}::uuid, ${c.title}, ${about}) RETURNING id`)).rows;
    records.push(row.id);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  return { records, phrase };
}

async function openFar(page: Page, height: number) {
  await page.setViewportSize({ width: 1440, height });
  await page.goto('/');
  await wallMeasured(page);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByTestId('wall-zoom-out').click();
  await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
  await expect(page).toHaveURL(/[?&]wall=far/);
  await page.evaluate(() => document.fonts.ready);
}

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const askFor = async (page: Page, phrase: string) => {
  await control(page).locator('[data-ask-field]').fill(phrase);
  await control(page).getByRole('button', { name: /^ask$/i }).click();
};

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };
const geometry = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const box = (el: Element | null) => (el === null ? null : (({ top, bottom, left, right, width, height }) => ({ top, bottom, left, right, width, height }))(el.getBoundingClientRect()));
    const count = Array.from(document.querySelectorAll('[data-region="count-far"]')).find(drawn) ?? null;
    const cells = Array.from(count?.querySelectorAll('[data-pick-answer]') ?? [])
      .filter(drawn)
      .sort((a, b) => Number(a.getAttribute('data-rank')) - Number(b.getAttribute('data-rank')))
      .map((el) => ({ rank: Number(el.getAttribute('data-rank')), title: el.querySelector('[data-grid-title]')?.textContent ?? '', box: box(el) as Box, cut: (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1 }));
    return {
      cells,
      countColumn: box(count),
      countLast: box(count?.querySelector('[data-pick-answers]')?.previousElementSibling ?? null),
      window: { height: window.innerHeight, scrollY: window.scrollY },
    };
  });

for (const height of [900, 768]) {
  for (const [name, captions] of [['un-wrapped', shortCaptions(`${height}`)], ['tallest', TALLEST]] as const) {
    test(`at 1440×${height} with ${name} captions: five cells two across in the count column, 24 apart and 24 below the count's last line, the first row wholly in view, every cell reachable by scrolling, none cut`, async ({ page }) => {
      const { records, phrase } = await pool(page, captions);
      try {
        await openFar(page, height);
        /* Pressed from the rail's foot: the rail scrolled as far as it goes before the ask, so the first row's placement is tested where it matters. */
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await askFor(page, phrase);
        await expect.poll(async () => (await geometry(page)).cells.length, { timeout: 15_000, message: 'five cells answer' }).toBe(5);
        const g = await geometry(page);
        /* The capture is the state at the press: pressed from the rail's foot, the first row placed, nothing scrolled since. */
        if (WRITE_CAPTURES && name === 'tallest') mkdirSync('docs/captures/pick-column-3b', { recursive: true });
        /* The switch on the screenshot's own line: captures-unchanged.test.ts reads the specs' text line by line. */
        if (WRITE_CAPTURES && name === 'tallest') await page.screenshot({ path: `docs/captures/pick-column-3b/seeded-column-host-1440x${height}-tallest-five-pressed-at-the-foot.png` });
        if (g.countColumn === null || g.countLast === null) throw new Error('no count column, or nothing above the cells');
        const [r1, r2, r3, r4, r5] = g.cells.map((c) => c.box);
        expect.soft(g.cells.map((c) => c.rank), 'nearest first').toEqual([1, 2, 3, 4, 5]);
        for (const c of g.cells) {
          expect.soft(c.box.width, `§T.5’s 160 (${c.title})`).toBeCloseTo(160, 0);
          expect.soft(c.box.left, 'inside the column').toBeGreaterThanOrEqual(g.countColumn.left - 0.5);
          expect.soft(c.box.right, 'inside the column, not across its rule').toBeLessThanOrEqual(g.countColumn.right + 0.5);
          expect.soft(c.cut, `no cell cut (${c.title})`).toBe(false);
        }
        expect.soft(r2.left - r1.right, 'two across, 24 between').toBeCloseTo(24, 0);
        expect.soft(r1.top, 'a row shares a top').toBeCloseTo(r2.top, 0);
        expect.soft(r3.left, 'the third starts the second row').toBeCloseTo(r1.left, 0);
        expect.soft(r3.top - Math.max(r1.bottom, r2.bottom), '24 between rows').toBeCloseTo(24, 0);
        expect.soft(r5.top - Math.max(r3.bottom, r4.bottom), '24 between rows').toBeCloseTo(24, 0);
        expect.soft(r1.top - g.countLast.bottom, '24 below the count’s last line').toBeCloseTo(24, 0);
        expect.soft(r1.top, 'the first row’s top in view').toBeGreaterThanOrEqual(0);
        expect.soft(Math.max(r1.bottom, r2.bottom), 'the first row wholly in view').toBeLessThanOrEqual(height + 0.5);
        /* Every cell reachable: scroll to each and it stands wholly in the window. */
        for (const [i, c] of g.cells.entries()) {
          await page.evaluate((rank) => document.querySelector(`[data-region="count-far"] [data-pick-answer][data-rank="${rank}"]`)?.scrollIntoView({ block: 'nearest' }), c.rank);
          const after = (await geometry(page)).cells[i].box;
          expect.soft(after.top >= -0.5 && after.bottom <= height + 0.5, `cell ${c.rank} reachable, whole in the window after scrolling`).toBe(true);
        }
        /* The report: the window height below which the first row no longer fits beneath the count, read with the page and the column both at their top, so the figure is the layout's and not the scroll's. */
        await page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('[data-region="far"] > div')) (el as HTMLElement).scrollTop = 0; });
        const atTop = await geometry(page);
        const firstRowBottom = Math.max(atTop.cells[0].box.bottom, atTop.cells[1].box.bottom) + atTop.window.scrollY;
        test.info().annotations.push({ type: 'first row', description: `${name} captions at 1440×${height}: the first row ends ${firstRowBottom.toFixed(1)} below the page’s top, so it fits beneath the count in a window at least that tall; cells ${g.cells.map((c) => c.box.height.toFixed(0)).join(', ')} tall` });

      } finally {
        const db = getTestDb();
        for (const id of records) await db.execute(sql`DELETE FROM records WHERE id = ${id}::uuid`);
      }
    });
  }
}
