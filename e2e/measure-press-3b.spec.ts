import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { login } from './sign-in';
import { getTestDb } from '../test/helpers/db';
import { aboutHash } from '../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../src/lib/openai/embeddings';
import { stubEmbedding } from '../src/lib/openai/stub-embedding';

/**
 * **The press-to-answer script, exercised end to end where no password is secret (the coordinator, 23 Nov).** The script
 * measures production behind Adam's session, so its gate could run it only as far as its refusal, and its whole in-page
 * path shipped having never executed anywhere: Adam's second run died at its first `page.evaluate` on tsx's injected
 * `__name` helper, which Playwright's serialised function could not find in the page. This spec runs the script itself,
 * as a child process, against the suite's own server: the suite's password, the stub model, a seeded pool, two presses
 * at each viewport, the output under a temporary folder. Fails against a script whose in-page code is a serialised
 * function (the `__name` clash), one that cannot sign in here, and one whose summary names fewer presses than it made.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const phrase = `zebra quartz p${Date.now().toString(36)}`;

async function pool(page: Page): Promise<string[]> {
  const db = getTestDb();
  const records: string[] = [];
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    const artist = (await (await page.request.post('/api/artists', { data: { name: `Press ${k} ${phrase.slice(-6)}` } })).json()) as { id: string };
    trackArtist(artist.id);
    const about = `${phrase} ${k}: a record for the press.`;
    const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title, snippet) VALUES (${artist.id}::uuid, ${`Press ${k}`}, ${about}) RETURNING id`)).rows;
    records.push(row.id);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  return records;
}

test('the script signs in and, at 390 and at 1440, presses twice independently and twice in a run against the suite’s server, timing the reply and the covers and naming the records sent', async ({ page }, info) => {
  const records = await pool(page);
  const out = mkdtempSync(join(tmpdir(), 'press-'));
  try {
    const base = String(info.project.use.baseURL ?? '');
    expect(base, 'the suite’s base URL is known').toMatch(/^http/);
    const r = spawnSync('node', ['--import', 'tsx', 'scripts/measure-press.mts'], {
      encoding: 'utf8',
      timeout: 180_000,
      env: {
        ...process.env,
        PROD_LOGIN_PASSWORD: process.env.E2E_PASSWORD ?? 'test-password-for-e2e',
        PRESS_BASE_URL: base,
        PRESS_PHRASE: phrase,
        PRESS_PRESSES: '2',
        PRESS_OUT_DIR: out,
      },
    });
    const text = `${r.stdout}${r.stderr}`;
    expect(text, 'no in-page helper is missing').not.toMatch(/__name is not defined/);
    expect(r.status, text.slice(-800)).toBe(0);
    /*
      The run of 23 Nov's second shape: independent first presses and a consecutive run per width, each press with its
      reply, the covers' paint after it (new in-page code, executed here first), the cells and verdict, and the records
      sent and left out. The suite's five records have no covers, so the covers' path ends on the no-cover square.
    */
    for (const viewport of ['390', '1440']) {
      for (const mode of ['independent', 'consecutive']) {
        expect(text).toMatch(new RegExp(`^  ${viewport} ${mode}: press 1 answered, reply \\d+\\.\\ds, covers \\+\\d+\\.\\d\\ds, \\d cell\\(s\\), verdict \\w[\\w-]*, \\d+ sent, 0 left out$`, 'm'));
        expect(text).toMatch(new RegExp(`^  ${viewport} ${mode}: 2 of 2 answered; reply min [\\d.]+s, median [\\d.]+s, max [\\d.]+s; covers after the reply min [\\d.]+s, median [\\d.]+s, max [\\d.]+s; the longest press [12] at [\\d.]+s; load [\\d. ]+ before and [\\d. ]+ after$`, 'm'));
      }
      /* The pool is the grid's whole page, every record the suite's database holds, not the seeded five. Independent presses see all of it every time; a consecutive second press leaves out what the first named. */
      expect(text).toMatch(new RegExp(`^  ${viewport} independent: press 2 [a-z-]+, .*, \\d+ sent, 0 left out`, 'm'));
      expect(text).toMatch(new RegExp(`^  ${viewport} consecutive: press 2 [a-z-]+, .*, \\d+ sent, [1-5] left out`, 'm'));
    }
    const files = readdirSync(out).filter((f) => f.endsWith('.jsonl'));
    expect(files, 'one measurement file').toHaveLength(1);
    const lines = readFileSync(join(out, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.filter((l) => 'press' in l), 'eight presses on record').toHaveLength(8);
    expect(lines.filter((l) => 'summary' in l), 'four summaries').toHaveLength(4);
    expect(lines.filter((l) => 'press' in l).every((l) => typeof l.replyMs === 'number' && 'coversMs' in l && typeof l.sent === 'number'), 'each press carries its reply, covers and records sent').toBe(true);
  } finally {
    rmSync(out, { recursive: true, force: true });
    const db = getTestDb();
    for (const id of records) await db.execute(sql`DELETE FROM records WHERE id = ${id}::uuid`);
  }
});
