import 'server-only';
import { desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { discogsImportRuns } from '@/db/schema';
import type { CollectionReport } from './collection-import';

/**
 * §4.2 `discogs_import_runs`, §T.6 (28 Oct): the report survives leaving
 * Manage, which "shows the last run's lines on return, beneath a line
 * naming when that run finished". One row per run, kept; the latest is
 * what Manage draws, and the next run replaces it by being later.
 */
export type ImportRun = { report: CollectionReport; finishedAt: string };

export async function recordImportRun(report: CollectionReport): Promise<ImportRun> {
  const db = getDb();
  const [row] = await db.insert(discogsImportRuns).values({ report }).returning({ finishedAt: discogsImportRuns.finishedAt });
  return { report, finishedAt: row.finishedAt.toISOString() };
}

export async function latestImportRun(): Promise<ImportRun | null> {
  const db = getDb();
  const [row] = await db
    .select({ report: discogsImportRuns.report, finishedAt: discogsImportRuns.finishedAt })
    .from(discogsImportRuns)
    .orderBy(desc(discogsImportRuns.finishedAt))
    .limit(1);
  if (row === undefined) return null;
  return { report: row.report as CollectionReport, finishedAt: row.finishedAt.toISOString() };
}
