/**
 * **What `--store` writes (scripts/write-matched-text.mts):** Adam's marked file read as ids, each with the effort he
 * named, and the draft each mark chooses. A bare id takes medium where a record was drafted at two efforts, and the
 * only draft where it was drafted once; a mark no draft answers chooses nothing, never another draft.
 */
export type Mark = { prefix: string; effort?: string };

export function parseMarked(text: string): Mark[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{8}/.test(l)).map((l) => {
    const effort = /\b(low|medium|high)\b/.exec(l)?.[1];
    return effort === undefined ? { prefix: l.slice(0, 8) } : { prefix: l.slice(0, 8), effort };
  });
}

export function chooseDraft<D extends { id: string; effort?: string }>(drafts: readonly D[], mark: Mark): D | undefined {
  const own = drafts.filter((d) => d.id.startsWith(mark.prefix));
  if (own.every((d) => d.effort === undefined)) return mark.effort === undefined ? own[0] : undefined;
  return own.find((d) => d.effort === (mark.effort ?? 'medium'));
}

/**
 * What the store prints for each record it writes (17 Nov). A draft a sentence short because the client dropped a
 * sentence about the material says so here, loudly, since this is the path Adam reads when he adds records.
 */
export function storeLine(d: { id: string; artist: string; title: string; sentences: readonly unknown[]; dropped?: readonly string[] }): string {
  const head = `${d.id.slice(0, 8)}: stored (${d.artist} — ${d.title}), ${d.sentences.length} sentences`;
  const dropped = d.dropped ?? [];
  return dropped.length === 0 ? head : `${head} — SHORT, ${dropped.length} dropped for describing the material: ${dropped.join(' ')}`;
}

