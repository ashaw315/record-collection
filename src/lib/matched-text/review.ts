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
};

export function renderReview(drafts: readonly ReviewDraft[], title: string): string {
  const lines = [
    `# ${title}`,
    '',
    `${drafts.length} record(s). Each sentence is marked [supported], resting on the Discogs material the model was given, or [inferred], resting on its own knowledge of the record: read the inferred hardest. To store a draft, put its id (the eight characters in backticks) in a file, one per line, and run the store.`,
    '',
  ];
  for (const d of drafts) {
    lines.push(`## ${d.artist} — ${d.title}${d.year === null ? '' : ` (${d.year})`}  \`${d.id.slice(0, 8)}\``, '');
    lines.push(`ABOUT, given as context only: ${d.about ?? 'none'}`, '');
    if (d.sentences.length === 0) {
      lines.push(`No draft: ${d.status}`, '');
      continue;
    }
    for (const s of d.sentences) lines.push(`- [${s.basis}] ${s.text}`);
    lines.push('');
    if (d.unknown.length > 0) lines.push(`Not known: ${d.unknown.join('; ')}`, '');
  }
  return `${lines.join('\n')}\n`;
}
