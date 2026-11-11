/**
 * **Q22's ranking, the pure part (§P.2 as it stands; the coordinator, 11 Nov).** "Rank the pool by nearness of each
 * ABOUT's stored embedding to the phrase's. Answer with the nearest three to five. Re-ask: leave out the last answer's
 * records while enough remain. A record title asks from that record's embedding and leaves it out of its own answers."
 * Cosine in code over a collection of 55 rows; no pgvector and no index, deliberately.
 */

export type Candidate = { recordId: string; vector: number[] };
export type Answer = { recordId: string; nearness: number };

/** Cosine similarity; 0 where either vector has no magnitude, so a bad row ranks last rather than poisoning the sort with NaN. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa === 0 || bb === 0) return 0;
  return dot / Math.sqrt(aa * bb);
}

export function rankByNearness(
  query: number[],
  pool: Candidate[],
  options: { take: number; exclude?: readonly string[]; askedFrom?: string },
): Answer[] {
  /* The asked-from record never answers itself, whatever remains; the last answer's records are left out only while enough remain. */
  const without = pool.filter((c) => c.recordId !== options.askedFrom);
  const excluded = new Set(options.exclude ?? []);
  const rest = without.filter((c) => !excluded.has(c.recordId));
  const candidates = rest.length >= options.take ? rest : without;
  return candidates
    .map((c) => ({ recordId: c.recordId, nearness: cosine(query, c.vector) }))
    .sort((a, b) => b.nearness - a.nearness || a.recordId.localeCompare(b.recordId))
    .slice(0, options.take);
}
