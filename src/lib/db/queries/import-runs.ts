import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { discogsImportRuns } from '@/db/schema';
import type { CollectionReport } from './collection-import';

/**
 * §4.2 `discogs_import_runs`, §T.6 (28 Oct): the report survives leaving
 * Manage, which "shows the last run's lines on return, beneath a line
 * naming when that run finished". One row per run, kept; the latest is
 * what Manage draws, and the next run replaces it by being later.
 */
export type ImportRun = { id: string; report: CollectionReport; finishedAt: string };

/**
 * **What the import's drafting did after the response (22 Nov, import fires drafting).** The response leaves before a
 * draft starts, so the outcome lands on the stored run, which Manage reads back: the records now searchable, the records
 * waiting for the next press (the budget's cut, whole records, never a half-draft), and each failure with its stage and
 * reason. Written once by the after-task into the report's `drafting` key; absent on a run stored before this existed.
 */
export type DraftingOutcome = {
  searchable: string[];
  waiting: string[];
  failed: Array<{ recordId: string; stage: 'about' | 'matched'; reason: string }>;
  startedAt: string;
  finishedAt: string;
};

export async function recordImportRun(report: CollectionReport): Promise<ImportRun> {
  const db = getDb();
  const [row] = await db.insert(discogsImportRuns).values({ report }).returning({ id: discogsImportRuns.id, finishedAt: discogsImportRuns.finishedAt });
  return { id: row.id, report, finishedAt: row.finishedAt.toISOString() };
}

/** The drafting's outcome onto its run, under the report's `drafting` key, the rest of the report untouched. */
export async function recordDraftingOutcome(runId: string, outcome: DraftingOutcome): Promise<void> {
  await getDb()
    .update(discogsImportRuns)
    .set({ report: sql`${discogsImportRuns.report} || jsonb_build_object('drafting', ${JSON.stringify(outcome)}::jsonb)` })
    .where(eq(discogsImportRuns.id, runId));
}

export async function latestImportRun(): Promise<ImportRun | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: discogsImportRuns.id, report: discogsImportRuns.report, finishedAt: discogsImportRuns.finishedAt })
    .from(discogsImportRuns)
    .orderBy(desc(discogsImportRuns.finishedAt))
    .limit(1);
  if (row === undefined) return null;
  return { id: row.id, report: row.report as CollectionReport, finishedAt: row.finishedAt.toISOString() };
}
