import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../../test/helpers/db';
import { aboutHash } from '../../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../../src/lib/openai/embeddings';
import { stubEmbedding } from '../../src/lib/openai/stub-embedding';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';
import { nearViewMinWidth } from '../../src/app/wall/view-fork';

/**
 * **The ask field with a phrase longer than it, in every host (the coordinator, 13 Nov, for Design's ruling on §P.5's
 * "its width is the host's").** Adam typed a phrase into the shelf's rail and it scrolled out of sight. Nothing is
 * built for it; this is the specimen Design rules on. One phrase, typed and not asked, in each host the field draws in,
 * twice: while typing (focused, the caret at the end, the field scrolled to it) and after leaving the field. Beside each
 * picture the field's figures: its content box, the phrase's full width, and the share of the phrase in view.
 * The records are seeded under an artist filter, the field needing none of the collection. Written to
 * `docs/captures/ask-overflow/`. Run with CAPTURE=1 E2E_SERVER=build --project=capture.
 */
const OUT = join('docs', 'captures', 'ask-overflow');
registerCleanup();

/** A phrase of the kind Adam typed, which Code was not shown: an ordinary sentence of what to play, 50 characters. */
const PHRASE = 'something slow and warm for a rainy sunday morning';

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');
const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });

type Row = { host: string; window: string; file: string; contentBox: number; phraseWidth: number; inView: string };
const rows: Row[] = [];

async function capture(page: Page, open: () => Promise<void>, host: string, name: string) {
  await open();
  const viewport = page.viewportSize();
  const window = viewport === null ? '?' : `${viewport.width} × ${viewport.height}`;
  await field(page).click();
  await field(page).pressSequentially(PHRASE);
  await page.evaluate(() => document.fonts.ready);
  const figures = await field(page).evaluate((el) => {
    const input = el as HTMLInputElement;
    const style = getComputedStyle(input);
    const contentBox = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    /* The phrase's own width, in the field's font: scrollWidth is the box's wherever the phrase fits, so it cannot say by how much. */
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) throw new Error('no 2d context');
    context.font = style.font;
    context.letterSpacing = style.letterSpacing;
    return { contentBox, phraseWidth: context.measureText(input.value).width };
  });
  const inView = `${Math.min(100, Math.round((figures.contentBox / figures.phraseWidth) * 100))}%`;
  for (const state of ['typing', 'left'] as const) {
    if (state === 'left') {
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.mouse.move(0, 0);
    }
    const file = `${name}-${state}.png`;
    const box = await control(page).boundingBox();
    if (box === null) throw new Error(`${name}: no control drawn`);
    /* The control with room round it, so the field reads against its host. */
    const pad = 24;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: Math.min(box.height + pad * 2, 400) };
    await page.screenshot({ path: join(OUT, file), clip });
    await page.screenshot({ path: join(OUT, `${name}-${state}-window.png`) });
    rows.push({ host, window, file, contentBox: Math.round(figures.contentBox * 10) / 10, phraseWidth: Math.round(figures.phraseWidth * 10) / 10, inView });
  }
}

async function seed(page: Page): Promise<string> {
  const suffix = `overflow${Date.now().toString(36)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Overflow-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Overflow', suffix, 3);
  return artist.id;
}

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the shelf, the far view as a column and as a band, the table and the grid', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const artistId = await seed(page);
    try {
      await capture(page, async () => { await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); }, 'the shelf’s rail, a column', 'shelf-1440');
      await capture(page, async () => {
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
      }, 'the far view’s rail, a column', 'far-view-1440');
      const band = nearViewMinWidth() - 1;
      await page.setViewportSize({ width: band, height: 900 });
      await capture(page, async () => { await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); }, 'the far view’s rail, a band', `far-band-${band}`);
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const view of ['table', 'grid'] as const) {
        await capture(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, `the ${view}’s sidebar`, `${view}-1440`);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'figures-1440.json'), `${JSON.stringify(rows, null, 2)}\n`);
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid at 390, where the control draws as a band', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const artistId = await seed(page);
    try {
      for (const view of ['table', 'grid'] as const) {
        await capture(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, `the ${view}’s band`, `${view}-390`);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'figures-390.json'), `${JSON.stringify(rows, null, 2)}\n`);
  });
});

/*
  The rail as a column on both views WITH an answer showing (the coordinator, 13 Nov, correcting the first brief):
  Design's lean widens the field into the column beside the rail, assuming that column empty, while §P.4 puts the far
  view's answer there. No widened field is built: the pictures are today's build, the figures say what a field widened
  to the column's right edge would cover, and a separate `-outline` picture marks that box dashed, labelled as not a
  design. Written to its own folder, since a committed capture is never rewritten.
*/
const ANSWER_OUT = join('docs', 'captures', 'ask-overflow-answer');
const ABOUTS = ['A slow warm record for a rainy sunday morning.', 'Something warm and slow, a sunday record.', 'Rainy morning music, slow and warm.', 'A sunday morning record, warm strings.', 'Slow songs for rain.'];

test.describe('the rail as a column with an answer showing', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the near view and the far view at 1440 × 900, the phrase asked', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(ANSWER_OUT, { recursive: true });
    await login(page);
    const suffix = `overflowans${Date.now().toString(36)}`;
    const artist = (await (await page.request.post('/api/artists', { data: { name: `Overflow-${suffix}` } })).json()) as { id: string };
    trackArtist(artist.id);
    await seedRecords(artist.id, 'Answer', suffix, ABOUTS.length);
    const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
    const db = getTestDb();
    for (const [i, row] of listed.data.entries()) {
      const about = ABOUTS[i % ABOUTS.length];
      const vector = stubEmbedding(about);
      await db.execute(sql`UPDATE records SET snippet = ${about} WHERE id = ${row.id}::uuid`);
      await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
    }
    const figures: Record<string, unknown>[] = [];
    try {
      for (const view of ['near', 'far'] as const) {
        await page.goto(`/?artistId=${artist.id}`);
        await wallMeasured(page);
        if (view === 'far') {
          await page.getByTestId('wall-zoom-out').click();
          await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
        }
        await field(page).fill(PHRASE);
        await control(page).getByRole('button', { name: /^ask$/i }).click();
        if (view === 'near') {
          await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
        } else {
          await page.locator('[data-pick-answer]').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        }
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await page.evaluate(() => window.scrollTo(0, 0));
        const m = await page.evaluate((testId) => {
          const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          const input = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control] [data-ask-field]')).find((e) => e.getClientRects().length > 0) ?? null;
          const rail = input?.closest('aside, nav, [data-rail]') ?? null;
          const count = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)).find((e) => e.getClientRects().length > 0) ?? null;
          /* The column is the widest ancestor of the count that still lies between the rail and the window's right edge: the count's own parent is only its text's width. */
          const railRight = rail === null ? 0 : rail.getBoundingClientRect().right;
          let column: HTMLElement | null = count;
          while (column?.parentElement) {
            const r = column.parentElement.getBoundingClientRect();
            if (r.left < railRight - 1 || r.right > window.innerWidth - 1) break;
            column = column.parentElement;
          }
          const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-answer]')).filter((e) => e.getClientRects().length > 0).map(box);
          if (!input || !column) return null;
          const f = box(input);
          const c = box(column);
          /* The box a field widened to the column's right edge would take: the field's own top and foot, from its left edge. */
          const widened = { left: f.left, right: c.right, top: f.top, bottom: f.bottom };
          const covered = cells.filter((x) => x.left < widened.right && x.right > widened.left && x.top < widened.bottom && x.bottom > widened.top);
          /* What the column draws, whatever it is (the near view's pulled record is a panel there, not a cell): the foot of its lowest drawn leaf, the full-height rules left out. */
          const drawnFoot = Math.max(...Array.from(column.querySelectorAll<HTMLElement>('*')).filter((e) => e.children.length === 0 && e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < (c.bottom - c.top) / 2).map((e) => e.getBoundingClientRect().bottom));
          return { field: f, rail: rail === null ? null : box(rail), column: c, cells, widened, covered: covered.length, drawnFoot, gapToField: f.top - drawnFoot };
        }, view === 'far' ? 'wall-count-far' : 'wall-count');
        if (m === null) throw new Error(`${view}: no field or no count column`);
        figures.push({ view, ...m });
        await page.screenshot({ path: join(ANSWER_OUT, `${view}-1440-answer.png`) });
        await page.evaluate((w) => {
          const d = document.createElement('div');
          d.setAttribute('data-capture-outline', '');
          Object.assign(d.style, { position: 'fixed', left: `${w.left}px`, top: `${w.top}px`, width: `${w.right - w.left}px`, height: `${w.bottom - w.top}px`, outline: '2px dashed #d0021b', zIndex: '9999', pointerEvents: 'none' });
          const label = document.createElement('span');
          label.textContent = 'a field widened to the column (not built, not a design)';
          Object.assign(label.style, { position: 'absolute', left: '0', top: 'calc(100% + 4px)', font: '11px monospace', color: '#d0021b', whiteSpace: 'nowrap' });
          d.appendChild(label);
          document.body.appendChild(d);
        }, m.widened);
        await page.screenshot({ path: join(ANSWER_OUT, `${view}-1440-answer-outline.png`) });
      }
    } finally {
      await removeRecordsFor(artist.id);
    }
    writeFileSync(join(ANSWER_OUT, 'figures.json'), `${JSON.stringify(figures, null, 2)}\n`);
  });
});

/**
 * **The control's own fold at 640, judged with the field at its tallest (Design's "Ask field wraps and count line"
 * and "ADD RECORD leaves the rail"; §P.5's open provisional, for Adam).** The rail as a column on the shelf, the
 * specimen's phrase typed and left so the field holds its lines, ADD RECORD at the content's top right since §W.13
 * was built. Each window at rest and scrolled until SURPRISE ME's foot meets the window's. Replaces the one-line
 * capture the provisional named. From a build; written to `docs/captures/fold-640/`.
 */
const FOLD_OUT = join('docs', 'captures', 'fold-640');
test.describe('the fold at 640, the field at its tallest', () => {
  test('the shelf’s rail at 1274 × 640, 1440 × 640 and 1440 × 900, at rest and scrolled to SURPRISE ME', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(FOLD_OUT, { recursive: true });
    await login(page);
    const artistId = await seed(page);
    const figures: unknown[] = [];
    try {
      for (const [width, height] of [[1274, 640], [1440, 640], [1440, 900]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await field(page).click();
        await field(page).pressSequentially(PHRASE);
        await page.locator('body').click({ position: { x: 1, y: 1 } });
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.fonts.ready);
        const read = () => page.evaluate(() => {
          const visible = (el: Element | null) => el !== null && (el as HTMLElement).getClientRects().length > 0;
          const control = Array.from(document.querySelectorAll('[data-shelf-offered] [data-testid="wall-rail"] [data-pick-control]')).find(visible) ?? null;
          const f = control?.querySelector<HTMLTextAreaElement>('[data-ask-field]') ?? null;
          const surprise = Array.from(control?.querySelectorAll('button') ?? []).find((b) => /surprise me/i.test(b.textContent ?? '')) ?? null;
          const add = Array.from(document.querySelectorAll('[data-wall-add-record] a')).find(visible) ?? null;
          const box = (el: Element | null) => (el === null ? null : (({ top, bottom, left, right }) => ({ top, bottom, left, right }))(el.getBoundingClientRect()));
          const s = f === null ? null : getComputedStyle(f);
          return {
            scrollY: window.scrollY,
            field: box(f),
            fieldLines: f === null || s === null ? null : (f.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight),
            surprise: box(surprise),
            control: box(control),
            addRecord: box(add),
          };
        });
        const rest = await read();
        await page.screenshot({ path: join(FOLD_OUT, `fold-${width}x${height}-at-rest.png`) });
        /* Scrolled until SURPRISE ME's foot meets the window's, or not at all where it is already in view. */
        const by = Math.max(0, Math.ceil((rest.surprise?.bottom ?? 0) - height + 18));
        await page.evaluate((y) => window.scrollTo(0, y), by);
        const scrolled = await read();
        await page.screenshot({ path: join(FOLD_OUT, `fold-${width}x${height}-scrolled-to-surprise-me.png`) });
        figures.push({ window: `${width} × ${height}`, atRest: rest, scrolled });
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(FOLD_OUT, 'figures.json'), `${JSON.stringify(figures, null, 2)}\n`);
  });
});
