import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readSeventeen } from '../seventeen';

/**
 * **The contact sheet: every record of the real collection at seven
 * windows, full page, with a manifest.** Read-only: the spec logs in with
 * the password from the environment, loads each record's page, reads what
 * it drew, and screenshots it. It registers no cleanup and posts nothing
 * but the login form.
 *
 * Files are named by the discriminating figure (the tint field's height, or
 * `suppressed`), per the capture-naming rule: a wrong file is visible in
 * its name. The manifest carries, per capture, the record, the viewport,
 * the colours served (the ladder's tint and base as rendered, or ink), whether
 * a cover image rendered, the field's state and term, and the pair the
 * ladder chose -- and an inventory of what drew, so a record whose served
 * colour changes WHAT draws, not only what it looks like, shows as a
 * difference in the inventory rather than in the eye.
 */

const WINDOWS: ReadonlyArray<readonly [number, number]> = [[390, 900], [768, 900], [1000, 900], [1440, 900], [1920, 900], [1440, 1200], [1920, 1200]];
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'sheet');
const NO_LADDER_RECORD = 'The Best Of The Blues Project';

/*
  Two ways in, neither of which is the test hash. `E2E_PASSWORD` is the
  collection's password, read at run time and nowhere else. `SHEET_SESSION_FILE`
  names a file holding a session token minted locally from the signing secret
  the server itself reads (`createSessionToken`), for an operator who has the
  server's environment and not the password; the token is read from the file
  and never printed. With neither, the sheet refuses to start.
*/
const password = process.env.E2E_PASSWORD;
const sessionFile = process.env.SHEET_SESSION_FILE;
if ((password === undefined || password === '') && (sessionFile === undefined || sessionFile === '')) {
  throw new Error('Neither E2E_PASSWORD nor SHEET_SESSION_FILE is set. The contact sheet logs in to the collection and never falls back to the test hash: run as  E2E_PASSWORD=\'…\' npx playwright test --config playwright.sheet.config.ts');
}
const PASSWORD: string = password ?? '';

async function login(page: Page) {
  if (sessionFile !== undefined && sessionFile !== '') {
    const { readFileSync } = await import('node:fs');
    const token = readFileSync(sessionFile, 'utf8').trim();
    const origin = new URL(process.env.SHEET_BASE_URL ?? `http://localhost:${process.env.SHEET_PORT ?? '3200'}`);
    await page.context().addCookies([{ name: 'rc_session', value: token, domain: origin.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/');
    await expect(page, 'the minted session signs in').toHaveURL('/', { timeout: 15_000 });
    return;
  }
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page, 'the password in E2E_PASSWORD signs in').toHaveURL('/', { timeout: 15_000 });
}

type Reading = {
  record: string; id: string; viewport: string; width: number; height: number;
  ladder: 'ladder' | 'ink';
  tint: string | null; base: string | null;
  coverRendered: boolean; coverCellFlat: boolean;
  field: { state: string | null; term: string | null; height: number; cap: number | null; aspect: string | null } | null;
  pair: { title: number; artist: number } | null;
  faces: Record<string, number>;
  marks: string[];
  file: string;
};

test('the contact sheet: seventeen records at seven windows, full page, with a manifest', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const rows = readSeventeen();
  const readings: Reading[] = [];
  const t0 = Date.now();
  for (const r of rows) {
    const slug = r.title.split(':')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    for (const [w, h] of WINDOWS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-testid="record-page-8a"]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      /* The ladder chooses after paint and the field after the ladder; a cover image arrives on its own time. */
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const R = (el: Element) => el.getBoundingClientRect();
        const host = document.querySelector<HTMLElement>('[data-title-step]');
        const ladder = host?.getAttribute('data-ladder');
        const pair = ladder ? (JSON.parse(ladder) as { pair: { title: number; artist: number } }).pair : null;
        const field = document.querySelector<HTMLElement>('[data-mark="identityField"]');
        const disc = document.querySelector<SVGElement>('[data-testid="construction-still"] [data-mark="disc"]');
        const bar = document.querySelector<HTMLElement>('[data-mark="section-bar"]');
        const sleeve = document.querySelector<HTMLElement>('[data-cell="sleeve"]');
        const cover = sleeve?.querySelector('img') ?? null;
        const faces: Record<string, number> = {};
        for (const f of Array.from(document.querySelectorAll('[data-testid="construction-still"] [data-face]'))) { const s = f.getAttribute('data-step') ?? '?'; faces[s] = (faces[s] ?? 0) + 1; }
        const marks = Array.from(document.querySelectorAll('[data-mark], [data-ornament], [data-plane], [data-flat]')).filter((el) => el.getClientRects().length > 0 && R(el).width > 0).map((el) => el.getAttribute('data-flat') ?? el.getAttribute('data-plane') ?? el.getAttribute('data-mark') ?? el.getAttribute('data-ornament') ?? '?');
        return {
          ladder: field !== null ? 'ladder' : 'ink',
          tint: disc ? getComputedStyle(disc).fill : null,
          base: bar ? getComputedStyle(bar).backgroundColor : null,
          coverRendered: cover !== null && (cover as HTMLImageElement).complete && (cover as HTMLImageElement).naturalWidth > 0,
          coverCellFlat: cover === null,
          field: field ? { state: field.getAttribute('data-field-state'), term: field.getAttribute('data-field-term'), height: Math.round(R(field).height * 10) / 10, cap: Number(field.getAttribute('data-field-cap')) || null, aspect: field.getAttribute('data-field-aspect') } : null,
          pair,
          faces,
          marks: [...new Set(marks)].sort(),
        } as const;
      });
      const figure = m.field === null ? 'ink' : m.field.state === 'drawn' ? `h${Math.round(m.field.height)}` : 'suppressed';
      const file = `sheet-${slug}-${w}x${h}-${figure}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      readings.push({ record: r.title, id: r.id, viewport: `${w}×${h}`, width: w, height: h, ...m, faces: { ...m.faces }, marks: [...m.marks], file });
    }
  }
  const seconds = Math.round((Date.now() - t0) / 1000);

  /* The manifest, machine-readable and as a table. */
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ takenAt: new Date().toISOString(), seconds, readings }, null, 1));
  const lines = ['# Contact sheet -- the real collection', '', `Taken ${new Date().toISOString().slice(0, 16).replace('T', ' ')} in ${seconds}s; ${readings.length} captures, full page, named by the tint field\'s height or its suppression.`, '', '| file | record | viewport | ladder | tint | base | cover | field | pair | marks |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const x of readings) lines.push(`| \`${x.file}\` | ${x.record} | ${x.viewport} | ${x.ladder} | ${x.tint ?? '—'} | ${x.base ?? '—'} | ${x.coverRendered ? 'rendered' : x.coverCellFlat ? 'flat cell' : 'img not loaded'} | ${x.field === null ? 'none (ink)' : x.field.state === 'drawn' ? `${x.field.height} (${x.field.aspect}:1, ${x.field.term})` : `suppressed by ${x.field.term}`} | ${x.pair ? `${x.pair.title}/${x.pair.artist}` : '—'} | ${x.marks.join(' ')} |`);

  /*
    What the served colour changes: the marks that exist only when the record
    has a ladder (§5.5's tint field, the section bars, §25's figures, §26's
    flats), per record against the collection's modal set at each viewport.
    Marks that follow the record's DATA rather than its colour -- the matrix
    solid, the cover frame -- are listed apart, so a record with no matrix
    does not read as a colour finding.
  */
  const LADDER_MARKS = new Set(['identityField', 'section-bar', 'figure', 'quarterDisc', 'triangle']);
  const byViewport = new Map<string, Reading[]>();
  for (const x of readings) byViewport.set(x.viewport, [...(byViewport.get(x.viewport) ?? []), x]);
  const differences: string[] = [];
  const dataMarks: string[] = [];
  for (const [viewport, xs] of byViewport) {
    const key = (x: Reading) => JSON.stringify({ marks: x.marks.filter((m) => LADDER_MARKS.has(m)), ladder: x.ladder, disc: x.tint });
    const counts = new Map<string, number>();
    for (const x of xs) counts.set(JSON.stringify({ marks: x.marks.filter((m) => LADDER_MARKS.has(m)), ladder: x.ladder }), (counts.get(JSON.stringify({ marks: x.marks.filter((m) => LADDER_MARKS.has(m)), ladder: x.ladder })) ?? 0) + 1);
    const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const x of xs) {
      const mine = JSON.stringify({ marks: x.marks.filter((m) => LADDER_MARKS.has(m)), ladder: x.ladder });
      if (mine !== modal) differences.push(`${x.record} @${viewport}: ${x.ladder}; ladder marks ${x.marks.filter((m) => LADDER_MARKS.has(m)).join(' ') || 'none'}; disc ${x.tint}`);
      const other = x.marks.filter((m) => !LADDER_MARKS.has(m));
      const modalOther = xs.map((y) => y.marks.filter((m) => !LADDER_MARKS.has(m)).join(' ')).sort().reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
      const commonest = Object.entries(modalOther).sort((a, b) => b[1] - a[1])[0][0];
      if (other.join(' ') !== commonest) dataMarks.push(`${x.record} @${viewport}: ${other.join(' ')}`);
    }
    void key;
  }
  lines.push('', '## What the served colour changes in what draws', '', ...(differences.length ? differences.map((d) => `- ${d}`) : ['- nothing: every record draws the same ladder-dependent marks at every viewport']));
  lines.push('', '## Marks that follow the record\'s data, not its colour, where they differ', '', ...(dataMarks.length ? dataMarks.map((d) => `- ${d}`) : ['- none']));
  writeFileSync(join(OUT, 'MANIFEST.md'), lines.join('\n') + '\n');
  console.log(`  CONTACT SHEET: ${readings.length} captures in ${seconds}s -> ${OUT}\n  differences from the modal inventory:\n    ${differences.join('\n    ') || 'none'}`);

  /* §5.3 on the one record without a cover: ink fallback, flat cover cell, at all seven windows. */
  const blues = readings.filter((x) => x.record === NO_LADDER_RECORD);
  expect(blues, `${NO_LADDER_RECORD} was captured at every window`).toHaveLength(WINDOWS.length);
  for (const x of blues) {
    expect(x.ladder, `${x.viewport}: no ladder, ink fallback`).toBe('ink');
    expect(x.coverCellFlat, `${x.viewport}: a flat cover cell`).toBe(true);
    /*
      §5.3 (settled 1-10): "No cover means no derivation, and the fallback is
      ink for all eight marks, the construction included -- filled, not
      outlined, not omitted." The fallback is a FILL: the face steps keep their
      ladder names and resolve to ink, so the step attribute is the wrong
      channel and the fill is the right one.

      CHANGE-DETECTOR, not a spec check: §5.3 fixes the value as ink, §5.1
      says colour marks are drawn "never at an opacity variant", and §5.5
      makes every coloured pixel one of three MIX steps, so ink at 0.55 alpha
      is a fourth value the spec does not have. It exists only in
      ConstructionStill.tsx (fe75669, 12 Sep), where a flat ink would collapse
      the disc into the faces. This line holds that constant where it is and
      fails when it moves; whether it should exist is with Design (NOTES, the
      contact sheet entry).
    */
    expect(x.tint, `${x.viewport}: the disc at the source's ink fallback (change-detector)`).toBe('oklch(0.19 0.008 60 / 0.55)');
    /*
      CONFOUNDED on the only real record: §5.3 keys the fallback on "no
      cover", the build keys the ladder on the spine colour (null -> no
      ladder -> no base served) and the flat cell on the cover URL. SPEC §7.8
      makes the spine colour derive from the cover alone, so in the spec's
      model they are one fact; a hand-set colour or a cover that failed to
      decode would part them, and no real record does. This assertion cannot
      tell "no base because §5.3" from "no base because this record has no
      spine colour".
    */
    expect(x.base, `${x.viewport}: no base colour served`).toBeNull();
  }
  const others = readings.filter((x) => x.record !== NO_LADDER_RECORD);
  for (const x of others) expect(x.coverRendered, `${x.record} @${x.viewport}: its cover rendered`).toBe(true);
  expect(readings).toHaveLength(rows.length * WINDOWS.length);
});
