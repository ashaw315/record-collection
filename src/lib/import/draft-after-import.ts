import 'server-only';
import type { DiscogsClient } from '@/lib/discogs/client';
import { recordDraftingOutcome, type ImportRun } from '@/lib/db/queries/import-runs';
import { discographyOf } from '@/lib/llm/about-grounding';
import { getMatchedTextClient } from '@/lib/llm/matched-text-client';
import { getSnippetClient } from '@/lib/llm/snippet-client';
import { logger } from '@/lib/logger';
import { recordsToDraft } from '@/lib/db/queries/matched-text';
import { draftImported } from './draft-imported';

/** The function's whole duration (src/app/api/discogs/import-collection/route.ts exports it), and the margin kept back from it. */
export const IMPORT_FUNCTION_MS = 300_000;
export const DRAFTING_MARGIN_MS = 30_000;

/**
 * **The import's after-task:** every record the run imported, drafted in the run's order with the production clients and
 * the route's Discogs client for the ABOUT's discography, inside what is left of the function's 300 seconds once the import
 * itself has taken its share; the outcome written onto the stored run, which Manage reads back, and logged, so the
 * figures accrue where Adam reads them. Never throws: a failure is a record's line on the run, and the run row is the
 * report of record, since the response left before any of this began.
 */
/**
 * What a press drafts, in order: the records this run stored, then every record still lacking matched text, so the
 * overflow a budget cut left behind is finished by the next press, whether or not that press stores anything (the
 * coordinator's question, 22 Nov, which found the first build drafting only what the press had stored).
 */
export async function toDraft(run: ImportRun): Promise<string[]> {
  const stored = run.report.imported.map((item) => item.recordId);
  const lacking = (await recordsToDraft('all')).map((r) => r.id).filter((id) => !stored.includes(id));
  return [...stored, ...lacking];
}

export async function draftAfterImport(run: ImportRun, discogs: DiscogsClient, requestStartedAt: number, ids: readonly string[]): Promise<void> {
  try {
    const outcome = await draftImported(ids, {
      snippet: getSnippetClient(),
      matched: getMatchedTextClient(),
      discography: async (artistId) => discographyOf(await discogs.get(`/artists/${artistId}/releases`, { sort: 'year', sort_order: 'asc', per_page: 100 })),
      budgetMs: IMPORT_FUNCTION_MS - DRAFTING_MARGIN_MS - (Date.now() - requestStartedAt),
      now: () => Date.now(),
    });
    await recordDraftingOutcome(run.id, outcome);
    logger.info('collection-import.draft', `Drafted after the import: ${outcome.searchable.length} now searchable, ${outcome.waiting.length} waiting for the next press, ${outcome.failed.length} failed${outcome.failed.length === 0 ? '' : ` (${outcome.failed.map((f) => `${f.recordId.slice(0, 8)} ${f.stage}: ${f.reason}`).join('; ')})`}.`);
  } catch (error) {
    logger.warn('collection-import.draft', `The drafting after the import did not finish: ${error instanceof Error ? error.message : String(error)}. The records lack text until the next press of Import.`);
  }
}
