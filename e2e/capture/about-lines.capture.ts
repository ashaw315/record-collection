import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { registerCleanup, trackArtist } from '../cleanup';
import { getTestDb } from '../../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { login } from '../sign-in';

registerCleanup();
/**
 * **A measuring tool: how many lines each real About renders to in the frame's
 * last cell, at the built leading.**
 *
 * Design's clamp was derived from a characters-per-line mean. A rendered line
 * count depends on the words, so this renders the TEXT, in the real cell, and
 * counts the lines the browser lays out. The texts come from
 * `docs/captures/abouts.json` -- `[{ "title", "text" }]` -- which the
 * production database emits with:
 *
 *   SELECT json_agg(json_build_object('title', title, 'text', snippet))
 *   FROM records WHERE snippet IS NOT NULL AND btrim(snippet) <> '';
 *
 * Without the file it runs on length-matched stand-ins and SAYS SO in every
 * line of output: those numbers are a bound, not a measurement of the texts.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const ABOUTS = 'docs/captures/abouts.json';

/* Stand-ins of the four recorded lengths, ordinary English, single paragraph. */
const CORPUS =
  'Her last album for the label, and the one where the machinery starts to sound like a band. The long version of the title track runs past seventeen minutes without repeating itself, and the second side is where the songwriting finally catches up with the production. A pressing worth hunting for, not because it is rare but because the mastering is unusually generous with the low end, and the sleeve, a heavy laminated gatefold, has survived better than most. What the record does with silence is the part that stays with you: whole bars where nothing happens and the room is allowed to be a room. Later reissues flatten that, and the difference is audible on any system that can hold a note without hurrying it. This copy came from a shop that priced it as a curiosity.';
const standIn = (chars: number) => {
  let s = CORPUS;
  while (s.length < chars) s += ' ' + CORPUS;
  const cut = s.lastIndexOf(' ', chars);
  return s.slice(0, cut > chars - 12 ? cut : chars).replace(/[,;]$/, '') + '.';
};
const STAND_INS = [
  { title: 'The Hurdy Gurdy Man', text: standIn(745) },
  { title: 'Bitches Brew', text: standIn(580) },
  { title: 'Gaucho', text: standIn(555) },
  { title: 'Loss Of Life', text: standIn(482) },
];

test('measure each About’s rendered lines in the last cell', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measuring tool: run with CAPTURE=1');
  const real = existsSync(ABOUTS);
  const abouts: Array<{ title: string; text: string }> = real ? JSON.parse(readFileSync(ABOUTS, 'utf8')) : STAND_INS;
  const source = real ? 'REAL TEXTS from abouts.json' : 'STAND-INS of matching length, NOT the real texts';

  await login(page);
  const a = await page.request.post('/api/artists', { data: { name: 'MGMT' } });
  const artist = await a.json();
  const artistId = (artist.id ?? artist.error?.existingId) as string;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { artistId, title: 'Loss Of Life', releaseYear: 2024 } });
  const { id } = await r.json();
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, notes = 'x' WHERE id = ${id}::uuid`);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(500);

  console.log(`\nABOUT LINES — ${source}`);
  console.log('  title                  chars  breaks  rendered  lost@10  lost@9+more  (width, leading)');
  for (const about of abouts) {
    const m = await page.evaluate((text) => {
      const cell = document.querySelector('[data-cell="note"]') as HTMLElement;
      const label = cell.querySelector(':scope > div') as HTMLElement;
      const body = document.createElement('p');
      body.className = 'text-prose';
      body.style.whiteSpace = 'pre-line';
      body.textContent = text;
      (label.nextElementSibling as HTMLElement).replaceWith(body);
      const cs = getComputedStyle(body);
      const lh = parseFloat(cs.lineHeight);
      /* Lines from the layout: distinct line-box tops across the text's characters. */
      const range = document.createRange();
      const tops = new Set<number>();
      for (const node of Array.from(body.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const t = node as Text;
        for (let i = 1; i <= t.length; i += 1) { range.setStart(t, i - 1); range.setEnd(t, i); const rc = range.getBoundingClientRect(); if (rc.width > 0 || rc.height > 0) tops.add(Math.round(rc.top)); }
      }
      return { lines: tops.size, byHeight: Math.round(body.getBoundingClientRect().height / lh), width: Math.round(body.getBoundingClientRect().width), leading: cs.lineHeight, breaks: (text.match(/\n/g) ?? []).length };
    }, about.text);
    const lost10 = Math.max(0, m.lines - 10);
    const lost9 = Math.max(0, m.lines - 9);
    console.log(`  ${about.title.padEnd(22)} ${String(about.text.length).padStart(5)}  ${String(m.breaks).padStart(6)}  ${String(m.lines).padStart(8)}  ${String(lost10).padStart(7)}  ${String(lost9).padStart(11)}  (${m.width}px, ${m.leading}${m.byHeight !== m.lines ? `, by-height says ${m.byHeight}` : ''})`);
  }
});
