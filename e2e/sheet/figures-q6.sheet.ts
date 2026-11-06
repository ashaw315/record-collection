import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { login } from './login';

/**
 * **Q6, for the coordinator: §55's figures and §60's disc, measured on the
 * real collection from the build (6 Nov).** §55 states the identity field's
 * count and aspect band on the real collection at 1440 × 1200 and 1440 × 900
 * and names the four records whose field is suppressed; §60 states the
 * Images disc's size at one image and from two up, at 390, 1440 and 1920.
 * Both were stated when the collection was 17 records and never re-read
 * since it became 55. Read-only, nothing pressed. Each record at each window
 * is one JSON line carrying the field's own marks (`data-field-*`, set by the
 * page once it has sized the field) and box, the quarter disc's marks
 * (`data-disc-*`) and box, and the Images section's count, so the figures
 * are derived from the file and never recalled.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'figures-q6');
/* §55's "1440 × 900" is 8a's no-scroll budget, so it is the constant and not a retyped figure. */
const WINDOWS: ReadonlyArray<[number, number]> = [[1440, 1200], [1440, NO_SCROLL_HEIGHT], [390, 844], [1920, NO_SCROLL_HEIGHT]];

test('the identity field and the Images disc on every record at §55’s and §60’s windows, from the build', async ({ page, baseURL }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const listed = (await (await page.request.get('/api/records?pageSize=200')).json()) as { data: Array<{ id: string; title: string }> };
  const lines: string[] = [];
  for (const [width, height] of WINDOWS) {
    await page.setViewportSize({ width, height });
    for (const r of listed.data) {
      await page.goto(`/records/${r.id}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 30_000 });
      /* The field is sized after hydration and says so; wait for its state to leave `pending`. */
      await page.waitForFunction(() => { const f = document.querySelector('[data-mark="identityField"]'); return f === null || f.getAttribute('data-field-state') !== 'pending'; }, null, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      const read = await page.evaluate(() => {
        const attrs = (el: Element | null, prefix: string) => el === null ? null : Object.fromEntries(Array.from(el.attributes).filter((a) => a.name.startsWith(prefix)).map((a) => [a.name.slice(prefix.length), a.value]));
        const box = (el: Element | null) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { width: b.width, height: b.height, shown: el.getClientRects().length > 0 && b.width > 0 && b.height > 0 }; };
        const field = document.querySelector('[data-mark="identityField"]');
        const disc = document.querySelector('[data-flat="quarterDisc"]');
        const images = document.querySelector('[data-section="images"]');
        return {
          field: field === null ? null : { ...attrs(field, 'data-field-'), box: box(field) },
          disc: disc === null ? null : { ...attrs(disc, 'data-disc-'), box: box(disc) },
          images: images === null ? null : images.querySelectorAll('img').length,
          cover: document.querySelector('[data-cell="sleeve"] img[data-cover]') !== null,
        };
      });
      lines.push(JSON.stringify({ server: baseURL, vw: width, vh: height, id: r.id, title: r.title, ...read }));
    }
  }
  writeFileSync(join(OUT, `field-disc-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`), `${lines.join('\n')}\n`);
});
