import 'server-only';
import { artistGroundingFacts } from '@/lib/db/queries/artists';
import type { DraftingOutcome } from '@/lib/db/queries/import-runs';
import { recordsToDraft, storeGeneratedMatchedText, type DraftRow } from '@/lib/db/queries/matched-text';
import { storeGeneratedSnippet } from '@/lib/db/queries/snippet';
import { groundingFromPayload, type DiscographyEntry } from '@/lib/llm/about-grounding';
import { MATCHED_TEXT_MODEL, type MatchedTextClient } from '@/lib/llm/matched-text-client';
import type { SnippetClient } from '@/lib/llm/snippet-client';
import { mechanicalChecks } from '@/lib/matched-text/checks';

/**
 * **Import fires drafting (Adam, through the coordinator, 22 Nov): the records an import has just stored, described
 * after the response so that each enters the pool without a step from him.** Two passes a record, in the order the review
 * loop always ran them: the ABOUT drafted and stored, then the matched text drafted from the stored ABOUT and the cached
 * Discogs material and stored with its mechanical checks. Both land with nobody having read them (`snippet_reviewed_at`
 * and `reviewed_at` null), which is true; the record-page line is Design's and reads the mark. A later ABOUT does not
 * refresh a stored matched text, which is why the matched text alone was not enough (NOTES, 22 Nov).
 *
 * **The budget is whole records.** Next's `after()` runs inside the import function's own duration, 300 seconds on this
 * plan, so the loop checks before each record whether one more can finish, and stops where it cannot: the rest are
 * reported waiting, nothing of theirs written, and the next press of Import drafts them, since a run skips what is held
 * and drafts what lacks text. A record is never left half-drafted by the platform killing the function mid-call.
 */
export type DraftingDeps = {
  snippet: SnippetClient;
  matched: MatchedTextClient;
  /** The artist's own releases from Discogs for the ABOUT's grounding, as the drafting script fetches them; [] where none or on error. */
  discography: (discogsArtistId: number) => Promise<DiscographyEntry[]>;
  budgetMs: number;
  now: () => number;
};

/**
 * One record at p90, both passes (19 Nov, ten records): ABOUT 9.1s, matched text 14.5s, 23.6s together; 24s rounded up,
 * so a record is started only where a p90 record would still finish.
 */
export const PER_RECORD_BUDGET_MS = 24_000;

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function draftImported(recordIds: readonly string[], deps: DraftingDeps): Promise<DraftingOutcome> {
  const start = deps.now();
  const outcome: DraftingOutcome = { searchable: [], waiting: [], failed: [], startedAt: new Date().toISOString(), finishedAt: '' };
  const rows = new Map((await recordsToDraft({ ids: recordIds })).map((r) => [r.id, r]));
  const order = recordIds.filter((id) => rows.has(id));
  for (const [index, id] of order.entries()) {
    if (deps.now() - start + PER_RECORD_BUDGET_MS > deps.budgetMs) {
      outcome.waiting.push(...order.slice(index));
      break;
    }
    await draftOne(rows.get(id) as DraftRow, deps, outcome);
  }
  outcome.finishedAt = new Date().toISOString();
  return outcome;
}

async function draftOne(row: DraftRow, deps: DraftingDeps, outcome: DraftingOutcome): Promise<void> {
  const facts = groundingFromPayload(row.payload);
  let about: string | null = row.about;

  if (about === null) {
    try {
      const discography = facts?.artistId == null ? [] : await deps.discography(facts.artistId).catch(() => []);
      const artist = (await artistGroundingFacts(row.artistRowId)) ?? undefined;
      const result = await deps.snippet.write({ artist: row.artist, title: row.title }, facts === null ? undefined : { facts, discography, constraints: [], artist });
      if (!result.ok) outcome.failed.push({ recordId: row.id, stage: 'about', reason: result.reason });
      else {
        const stored = await storeGeneratedSnippet(row.id, result.snippet);
        if (stored.ok) about = result.snippet;
        else outcome.failed.push({ recordId: row.id, stage: 'about', reason: stored.reason });
      }
    } catch (error) {
      outcome.failed.push({ recordId: row.id, stage: 'about', reason: reason(error) });
    }
  }

  try {
    const result = await deps.matched.write({ artist: row.artist, title: row.title, year: row.year, about }, facts);
    if (!result.ok) { outcome.failed.push({ recordId: row.id, stage: 'matched', reason: result.reason }); return; }
    if (result.text === null) { outcome.failed.push({ recordId: row.id, stage: 'matched', reason: 'no sentence survived' }); return; }
    const credited = new Set([...(facts?.credits ?? []), ...(facts?.trackCredits ?? [])].map((c) => c.name)).size;
    await storeGeneratedMatchedText(row.id, result.text, MATCHED_TEXT_MODEL, { checks: mechanicalChecks({ sentences: result.sentences, dropped: result.dropped, credited }) });
    outcome.searchable.push(row.id);
  } catch (error) {
    outcome.failed.push({ recordId: row.id, stage: 'matched', reason: reason(error) });
  }
}
