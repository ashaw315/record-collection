/**
 * **The matched-text review file (step 3, unit 4; the coordinator, 14 Nov).** What Adam reads before he marks a draft
 * to store. Every sentence carries its basis, so the inferred, resting on the model's own knowledge, are read hardest:
 * that is where a famous record gets described from reputation rather than from the material. What was not known is
 * listed, never filled. The ABOUT is shown as the context it was given as. The marks live here, not in the schema.
 */
export type ReviewDraft = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  about: string | null;
  status: string;
  sentences: Array<{ text: string; basis: 'supported' | 'inferred' }>;
  unknown: string[];
  /** Set where a record is drafted at more than one effort (the coordinator, 15 Nov): each draft is shown under it. */
  effort?: string;
};

export function renderReview(drafts: readonly ReviewDraft[], title: string): string {
  const lines = [
    `# ${title}`,
    '',
    `${drafts.length} record(s). Each sentence is marked [supported], resting on the Discogs material the model was given, or [inferred], resting on its own knowledge of the record: read the inferred hardest. To store a draft, put its id (the eight characters in backticks) in a file, one per line, and run the store.`,
    '',
  ];
  /* A record's drafts together under one heading, in the order given; each under its effort where it has one. */
  const ids = [...new Set(drafts.map((d) => d.id))];
  for (const id of ids) {
    const own = drafts.filter((d) => d.id === id);
    const d = own[0];
    lines.push(`## ${d.artist} — ${d.title}${d.year === null ? '' : ` (${d.year})`}  \`${d.id.slice(0, 8)}\``, '');
    lines.push(`ABOUT, given as context only: ${d.about ?? 'none'}`, '');
    for (const v of own) {
      if (v.effort !== undefined) lines.push(`At ${v.effort}: to store this one, mark it \`${d.id.slice(0, 8)} ${v.effort}\`.`, '');
      if (v.sentences.length === 0) {
        lines.push(`No draft: ${v.status}`, '');
        continue;
      }
      for (const s of v.sentences) lines.push(`- [${s.basis}] ${s.text}`);
      lines.push('');
      if (v.unknown.length > 0) lines.push(`Not known: ${v.unknown.join('; ')}`, '');
    }
  }
  return `${lines.join('\n')}\n`;
}
