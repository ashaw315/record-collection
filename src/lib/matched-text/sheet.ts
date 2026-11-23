import { sentencesOf } from '@/lib/text/sentences';

/**
 * **§67's correcting sheet, the part with no screen.** "The sheet sets the text out a sentence at a time, and a press on
 * a sentence opens that sentence alone for editing while the others stay as they read." The sentences are the claim
 * check's own (`sentencesOf`), so the sheet and the citations agree on what a sentence is; the whole text is written
 * back through §5.2's PATCH, so saving one corrected sentence changes only that sentence. An emptied sentence is
 * removed; one typed as two is stored as two, by the same rule.
 */
export const sheetSentences = (text: string): string[] => sentencesOf(text);

export function replaceSentence(sentences: readonly string[], index: number, replacement: string): string[] {
  const out = [...sentences];
  out.splice(index, 1, ...sheetSentences(replacement.trim()));
  return out;
}

export const joinSentences = (sentences: readonly string[]): string => sentences.join(' ');

/** The sentence a reason rests on, opened on arrival: the first sentence a claim names whole; none where none does. */
export function openOnArrival(sentences: readonly string[], claims: readonly string[]): number | null {
  const index = sentences.findIndex((s) => claims.includes(s));
  return index === -1 ? null : index;
}
