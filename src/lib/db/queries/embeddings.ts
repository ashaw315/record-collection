import 'server-only';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordEmbeddings, records } from '@/db/schema';

/**
 * **Q22's store: one vector per record, keyed to the ABOUT's text hash (the coordinator, 11 Nov).** The ABOUT is
 * `records.snippet`; a vector is kept with the hash of the text it was made from and the model that made it, so the run
 * can tell a current vector from a stale one without re-embedding, and the query can refuse a vector from another model.
 * Cosine is computed in code over a collection of 55 rows: no pgvector, no index, deliberately.
 */

export type AboutWithHash = { recordId: string; about: string; storedHash: string | null };

/** Every record that has an ABOUT, with the hash of its stored vector, or null where none is stored. */
export async function aboutsWithStoredHash(): Promise<AboutWithHash[]> {
  const db = getDb();
  const rows = await db
    .select({ recordId: records.id, about: records.snippet, storedHash: recordEmbeddings.aboutHash })
    .from(records)
    .leftJoin(recordEmbeddings, eq(recordEmbeddings.recordId, records.id))
    .where(isNotNull(records.snippet))
    .orderBy(records.id);
  return rows.map((row) => ({ recordId: row.recordId, about: row.about ?? '', storedHash: row.storedHash ?? null }));
}

export async function storeEmbedding(input: { recordId: string; hash: string; model: string; vector: number[] }): Promise<void> {
  const db = getDb();
  await db
    .insert(recordEmbeddings)
    .values({ recordId: input.recordId, aboutHash: input.hash, model: input.model, vector: input.vector, dims: input.vector.length })
    .onConflictDoUpdate({
      target: recordEmbeddings.recordId,
      set: { aboutHash: input.hash, model: input.model, vector: input.vector, dims: input.vector.length, embeddedAt: sql`now()` },
    });
}

export type StoredEmbedding = { recordId: string; hash: string; model: string; vector: number[] };

export async function listEmbeddings(): Promise<StoredEmbedding[]> {
  const db = getDb();
  const rows = await db
    .select({ recordId: recordEmbeddings.recordId, hash: recordEmbeddings.aboutHash, model: recordEmbeddings.model, vector: recordEmbeddings.vector })
    .from(recordEmbeddings)
    .orderBy(recordEmbeddings.recordId);
  return rows.map((row) => ({ ...row, vector: row.vector as number[] }));
}
