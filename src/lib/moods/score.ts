/**
 * Target §P.2: "The ask leans; it does not filter." Each record is scored by
 * how many of the selected moods it carries, and the draw is from the highest
 * score; a record carrying none is never drawn. Pure, and not `server-only`,
 * since the page holds the selected moods and the draw runs in the client.
 *
 * The tier, not the draw: `pickFrom` draws from it under the last-served rule.
 */
export function topTier(records: ReadonlyArray<{ id: string; moods: readonly string[] }>, selected: readonly string[]): string[] {
  const wanted = new Set(selected);
  const scored = records.map((record) => ({ id: record.id, score: new Set(record.moods.filter((mood) => wanted.has(mood))).size }));
  const top = Math.max(0, ...scored.map((s) => s.score));
  // Zero is "carries none of them", which is never drawn, so an empty tier is the no-answer case.
  return top === 0 ? [] : scored.filter((s) => s.score === top).map((s) => s.id);
}
