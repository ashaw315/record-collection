import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';
import { draftImported, PER_RECORD_BUDGET_MS, type DraftingDeps } from '@/lib/import/draft-imported';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import type { SnippetClient } from '@/lib/llm/snippet-client';
import type { MatchedTextClient } from '@/lib/llm/matched-text-client';

/**
 * **Import fires drafting (Adam, through the coordinator, 22 Nov): a newly imported record is drafted after the response,
 * the ABOUT first and the matched text from it, both stored with nobody having read them, and the record enters the pool.**
 * The loop never starts a record it cannot finish inside the budget: the overflow is whole records, reported as waiting,
 * never a half-draft killed with the function. Fails against a drafter that marks its own output read, one that drafts the
 * matched text before the ABOUT is stored (the prompt would read "none"), one that starts a record past the budget, and one
 * whose failed ABOUT stops the matched text.
 */
const db = getTestDb();
beforeEach(async () => truncateAll());
afterAll(async () => closeTestDb());

const payload = JSON.parse(readFileSync('test/fixtures/discogs/collection-release-11029111.json', 'utf8')) as { id: number };

async function aRecord(title: string, withCache = true): Promise<string> {
  const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES (${`Artist ${title}`}) RETURNING id`)).rows;
  const releaseId = Math.floor(Math.random() * 1_000_000);
  if (withCache) await db.execute(sql`INSERT INTO discogs_cache (discogs_release_id, payload) VALUES (${releaseId}, ${JSON.stringify(payload)}::jsonb)`);
  const [pressing] = (await db.execute<{ id: string }>(sql`INSERT INTO pressings (discogs_release_id) VALUES (${releaseId}) RETURNING id`)).rows;
  const [record] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title, pressing_id, release_year) VALUES (${artist.id}, ${title}, ${pressing.id}, 1983) RETURNING id`)).rows;
  return record.id;
}

const observed = { stopReason: 'end_turn', inputTokens: 10, outputTokens: 10 };
function fakes(options: { aboutFails?: boolean; matchedFails?: boolean } = {}) {
  const aboutCalls: unknown[] = [];
  const matchedCalls: Array<{ about: string | null }> = [];
  const snippet: SnippetClient = {
    write: async (subject, grounding) => {
      aboutCalls.push({ subject, grounding });
      return options.aboutFails === true ? { ok: false, reason: 'unreadable', ...observed } : { ok: true, snippet: `About ${subject.title}.`, ...observed };
    },
  };
  const matched: MatchedTextClient = {
    write: async (subject) => {
      matchedCalls.push({ about: subject.about });
      return options.matchedFails === true
        ? { ok: false, reason: 'cut', ...observed }
        : { ok: true, text: `Slow piano on ${subject.title}. Two voices.`, sentences: [{ text: `Slow piano on ${subject.title}.`, basis: 'inferred' }, { text: 'Two voices.', basis: 'supported' }], unknown: [], dropped: ['A sentence about the material.'], ...observed };
    },
  };
  const deps: DraftingDeps = { snippet, matched, discography: async () => [], budgetMs: 300_000, now: () => Date.now() };
  return { deps, aboutCalls, matchedCalls };
}

const texts = async (id: string) => (await db.execute<{ snippet: string | null; snippet_reviewed_at: string | null; generated: string | null; reviewed_at: string | null; checks: unknown }>(sql`
  SELECT r.snippet, r.snippet_reviewed_at::text, m.generated, m.reviewed_at::text, m.checks FROM records r LEFT JOIN record_matched_text m ON m.record_id = r.id WHERE r.id = ${id}`)).rows[0];

describe('draftImported', () => {
  it('drafts the ABOUT, stores it unread, then drafts the matched text from the stored ABOUT and stores it unread with its checks, and the record is in the pool', async () => {
    const id = await aRecord('Believer');
    const { deps, matchedCalls } = fakes();
    const outcome = await draftImported([id], deps);
    expect(outcome).toMatchObject({ searchable: [id], waiting: [], failed: [] });
    const t = await texts(id);
    expect(t).toMatchObject({ snippet: 'About Believer.', snippet_reviewed_at: null, generated: 'Slow piano on Believer. Two voices.', reviewed_at: null });
    expect(t.checks).toEqual({ dropped: ['A sentence about the material.'], disagreements: [], numbered: [] });
    expect(matchedCalls[0].about, 'the matched text read the ABOUT that had just been stored').toBe('About Believer.');
    expect((await matchedTextsFor([id])).map((r) => r.id)).toEqual([id]);
  });

  it('never starts a record it cannot finish: past the budget the rest are waiting, whole, and nothing of theirs is stored', async () => {
    const first = await aRecord('First');
    const second = await aRecord('Second');
    const third = await aRecord('Third');
    const { deps } = fakes();
    /* A clock the fakes advance: each record costs exactly one p90 record, half on each pass. The budget holds one such
       record and not two, so the first is started (a p90 record would finish) and the second is not (it would not). */
    let clock = 0;
    deps.now = () => clock;
    deps.budgetMs = PER_RECORD_BUDGET_MS * 2 - 1;
    const baseSnippet = deps.snippet;
    const baseMatched = deps.matched;
    deps.snippet = { write: async (s, g) => { clock += PER_RECORD_BUDGET_MS / 2; return baseSnippet.write(s, g); } };
    deps.matched = { write: async (s, f, o) => { clock += PER_RECORD_BUDGET_MS / 2; return baseMatched.write(s, f, o); } };
    const outcome = await draftImported([first, second, third], deps);
    expect(outcome.searchable).toEqual([first]);
    expect(outcome.waiting, 'the second could not finish inside the budget, so it and the third wait, whole').toEqual([second, third]);
    expect(outcome.failed).toEqual([]);
    expect((await texts(second)).snippet, 'nothing of a waiting record is stored').toBeNull();
    expect((await texts(third)).snippet).toBeNull();
  });

  it('a failed ABOUT is reported and the matched text is still drafted, with no ABOUT; a failed matched text leaves the record out of the pool', async () => {
    const noAbout = await aRecord('NoAbout');
    const a = fakes({ aboutFails: true });
    const outA = await draftImported([noAbout], a.deps);
    expect(outA.searchable).toEqual([noAbout]);
    expect(outA.failed).toEqual([{ recordId: noAbout, stage: 'about', reason: 'unreadable' }]);
    expect(a.matchedCalls[0].about).toBeNull();
    expect((await texts(noAbout)).snippet).toBeNull();

    const noMatched = await aRecord('NoMatched');
    const m = fakes({ matchedFails: true });
    const outM = await draftImported([noMatched], m.deps);
    expect(outM.searchable).toEqual([]);
    expect(outM.failed).toEqual([{ recordId: noMatched, stage: 'matched', reason: 'cut' }]);
    expect((await matchedTextsFor([noMatched])).length).toBe(0);
    expect((await texts(noMatched)).snippet, 'the ABOUT it did get stays').toBe('About NoMatched.');
  });

  it('a client that throws is a failure of that record, named, and the next record is still drafted', async () => {
    const bad = await aRecord('Bad');
    const good = await aRecord('Good');
    const { deps } = fakes();
    const base = deps.matched;
    deps.matched = { write: async (subject, facts, options) => { if (subject.title === 'Bad') throw new Error('socket hung up'); return base.write(subject, facts, options); } };
    const outcome = await draftImported([bad, good], deps);
    expect(outcome.searchable).toEqual([good]);
    expect(outcome.failed).toEqual([{ recordId: bad, stage: 'matched', reason: 'socket hung up' }]);
  });
});
