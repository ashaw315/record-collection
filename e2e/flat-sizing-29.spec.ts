import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { seedExtreme } from './identity-extremes';
import { EMPTIEST, WORST } from '../src/app/records/[id]/identity-extremes';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { VISIBLE_OF_HOST_HEIGHT, VISIBLE_OF_SECTION_WIDTH } from '../src/app/records/[id]/OrnamentMarks';
import { DISC_REFERENCE_JS } from './disc-reading';

registerCleanup();

/**
 * **§29, build step 21: a flat's size follows its host, measured at both ends
 * of the collection and both named viewports — four figures per flat.**
 *
 * "Report each flat's visible size on the shared extremes fixture's emptiest
 * and fullest records, at both named viewports, so four figures per flat."
 * Two figures would not show the rule working: a flat is bounded by its
 * host's HEIGHT and its section's WIDTH, and which bound binds changes with
 * both the record and the width.
 *
 * §29 also predicts which is smallest: "the smallest flat is the emptiest
 * record at 390, not at 1440 — a quarter of a 7-column section is 210 at
 * 1440 and 97 at 390". The report is what decides whether a floor is ruled:
 * "rule a floor only if the smallest reads as a speck when viewed".
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** Both extremes need a sampled colour, or the flats are ladder-null and draw nothing (§5.3). */
async function seedWithColour(page: Page, extreme: typeof WORST | typeof EMPTIEST): Promise<string> {
  const id = await seedExtreme(page, extreme);
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
  return id;
}

type Measured = { shape: string; visible: number; hostHeight: number; hostWidth: number; heightBasis: number; free: number; bound: string };

async function flatsAt(page: Page, id: string, width: number, height: number): Promise<Measured[]> {
  await page.setViewportSize({ width, height });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });
  /* §59, §60: the quarter-disc measures in the browser; read it settled. */
  await page.waitForFunction(`(() => { const d = document.querySelector('[data-flat="quarterDisc"]'); return d === null || d.getAttribute('data-disc-state') !== 'measuring'; })()`, undefined, { timeout: 10_000 });

  return page.evaluate(
    ({ ofHeight, ofWidth, referenceJs }) =>
      Array.from(document.querySelectorAll('[data-ornament="flat"]'))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const hostEl = el.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]')!;
          const host = hostEl.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          /* The part inside its host is what shows; the rest is off the page edge. */
          const visible = Math.max(0, Math.min(box.right, host.right) - Math.max(box.left, host.left));
          const shape = el.getAttribute('data-flat') ?? '?';
          /* §60: the quarter-disc's height term is the stated reference, not its host's rendering; §59: and it yields to the caption in its reach. The triangle keeps §29's host height. */
          const heightBasis = shape === 'quarterDisc' ? (new Function('return ' + referenceJs)() as (sec: Element) => { reference: number })(hostEl).reference : host.height;
          const byHeight = heightBasis * ofHeight;
          const byWidth = host.width * ofWidth;
          let lowest = host.top;
          if (shape === 'quarterDisc') {
            const sized = Math.min(byHeight, byWidth);
            for (const t of Array.from(hostEl.querySelectorAll('*'))) {
              if (t.closest('[aria-hidden="true"]') !== null) continue;
              for (const n of Array.from(t.childNodes)) {
                if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() === '') continue;
                const range = document.createRange(); range.selectNodeContents(n);
                for (const g of Array.from(range.getClientRects())) if (g.width > 0 && g.right > host.right - sized) lowest = Math.max(lowest, g.bottom);
              }
            }
          }
          return {
            shape,
            visible: Math.round(visible * 10) / 10,
            hostHeight: Math.round(host.height),
            hostWidth: Math.round(host.width),
            heightBasis: Math.round(heightBasis * 10) / 10,
            free: shape === 'quarterDisc' ? Math.round((host.bottom - lowest) * 10) / 10 : Number.POSITIVE_INFINITY,
            bound: byHeight <= byWidth ? 'height' : 'width',
          };
        }),
    { ofHeight: VISIBLE_OF_HOST_HEIGHT, ofWidth: VISIBLE_OF_SECTION_WIDTH, referenceJs: DISC_REFERENCE_JS },
  );
}

test('§29: every flat is bounded by its host (the quarter-disc by §60’s reference and §59’s caption), at both extremes and both named viewports', async ({ page }) => {
  await login(page);
  const fullest = await seedWithColour(page, WORST);
  const emptiest = await seedWithColour(page, EMPTIEST);

  const report: string[] = [];
  const smallest: number[] = [];

  for (const [label, id] of [['fullest', fullest], ['emptiest', emptiest]] as const) {
    for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
      const flats = await flatsAt(page, id, width, height);
      /* §28: two opposite flats at 1440, one on the right below 960. */
      expect(flats.length, `${label} at ${width}: flats drawn`).toBeGreaterThan(0);

      for (const flat of flats) {
        const bound = Math.min(flat.heightBasis * VISIBLE_OF_HOST_HEIGHT, flat.hostWidth * VISIBLE_OF_SECTION_WIDTH, flat.free);
        report.push(
          `${label} @${width}  ${flat.shape.padEnd(12)} visible ${String(flat.visible).padStart(6)}px  host ${flat.hostWidth}×${flat.hostHeight}${flat.shape === 'quarterDisc' ? ` reference ${flat.heightBasis} free ${flat.free}` : ''}  bound by ${flat.bound} (${bound.toFixed(1)})`,
        );
        smallest.push(flat.visible);

        /*
          The rule itself: at most two-thirds of the host's height and a
          quarter of the section's width, whichever is smaller. Within 1.5px
          — the percentage resolves against the padding box, which excludes
          the host's 1px top rule.
        */
        expect(flat.visible, `${label} @${width} ${flat.shape}: within §29's bound`).toBeLessThanOrEqual(bound + 0.5);
        expect(flat.visible, `${label} @${width} ${flat.shape}: and reaches it`).toBeGreaterThan(bound - 1.5);
      }
    }
  }

  console.log(`\n§29 flat sizes — four figures per flat:\n${report.join('\n')}`);
  console.log(`\nsmallest flat in the app: ${Math.min(...smallest)}px`);

  /*
    §29 predicts the smallest is the emptiest record at 390 and rules a floor
    only if it reads as a speck. Asserted as "not a speck" at §W.31's 2px
    rule weight — below that a mark is within reach of a hairline, which is
    the comparison §25 already uses for the 6px face floor.
  */
  expect(Math.min(...smallest), 'the smallest flat is not within reach of a rule').toBeGreaterThan(2);
});
