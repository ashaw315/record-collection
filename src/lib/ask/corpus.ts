/**
 * **The rerun's corpus, deduplicated with the earlier block winning (the coordinator, 24 Nov).** Blocks are listed in order
 * of precedence, Adam's first, so a phrase he names belongs to him and leaves the blocks after his; the comparison is
 * trimmed and case-blind, since "Something calm " and "something calm" are one ask. The moves are returned for the report.
 */
export type CorpusLine = { group: string; phrase: string };

export function dedupeCorpus(lines: readonly CorpusLine[]): { corpus: CorpusLine[]; moved: Array<{ phrase: string; from: string; to: string }> } {
  const key = (p: string) => p.trim().toLowerCase();
  const owner = new Map<string, string>();
  const corpus: CorpusLine[] = [];
  const moved: Array<{ phrase: string; from: string; to: string }> = [];
  for (const line of lines) {
    const k = key(line.phrase);
    const first = owner.get(k);
    if (first === undefined) { owner.set(k, line.group); corpus.push(line); continue; }
    if (first !== line.group) moved.push({ phrase: line.phrase, from: line.group, to: first });
  }
  return { corpus, moved };
}
