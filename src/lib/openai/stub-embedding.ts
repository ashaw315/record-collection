/**
 * **The test environment's embedding model (Q22's control, 12 Nov).** The suites have no provider key by design, so
 * the phrase path cannot reach OpenAI from the build. The e2e server points `embedTexts` at a stub route
 * (`OPENAI_BASE_URL`) that answers with this: a hashed bag of words, unit length, deterministic. Not a model of
 * meaning; a model the specs can predict, so a seeded ABOUT and a phrase sharing its words are nearest by construction.
 * The specs seed `record_embeddings` with the same function, so the stored side and the query side are one model, as
 * they are in production.
 */
export const STUB_DIMS = 64;

/* FNV-1a over the word, folded into the dimension: cheap, stable across runs and machines. */
function slot(word: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i += 1) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % STUB_DIMS;
}

export function stubEmbedding(text: string): number[] {
  const vector = new Array<number>(STUB_DIMS).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0)) vector[slot(word)] += 1;
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((x) => x / length);
}
