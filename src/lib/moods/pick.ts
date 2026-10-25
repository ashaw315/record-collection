/**
 * Target §P.2: a draw that never serves the last-served record twice in a row
 * while another remains. Pure, with the random source passed in, because the
 * rule is the whole of what is worth testing and Math.random cannot be held.
 * Not `server-only`: the page holds the last-served record, so the draw runs
 * in the client.
 */
export function pickFrom(candidates: readonly string[], lastServed: string | null, random: () => number): string | null {
  const others = candidates.filter((id) => id !== lastServed);
  // Excluding it would leave nothing, so the whole set is drawn and it may come again.
  const from = others.length > 0 ? others : candidates;
  // An empty pool indexes past the end, and that is the no-answer case.
  return from[Math.floor(random() * from.length)] ?? null;
}
