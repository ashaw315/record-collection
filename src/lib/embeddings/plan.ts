import { createHash } from 'node:crypto';

/**
 * **Q22's embedding run, the pure part (the coordinator, 11 Nov).** One vector per record, keyed to the ABOUT's text
 * hash, so a run embeds only the records whose ABOUT has no vector or has changed since its vector was made: Q47's
 * three regenerated notes cost three calls, not a pass over the collection. `only` narrows a run to one record.
 */

export type AboutRow = { recordId: string; about: string; storedHash: string | null };
export type Planned = { recordId: string; about: string; hash: string };

/** SHA-256 of the ABOUT's text as written; one character's change is a new vector. */
export function aboutHash(about: string): string {
  return createHash('sha256').update(about, 'utf8').digest('hex');
}

export function planEmbedding(rows: AboutRow[], only?: string): { toEmbed: Planned[]; skipped: number } {
  const considered = only === undefined ? rows : rows.filter((row) => row.recordId === only);
  if (only !== undefined && considered.length === 0) throw new Error(`no record ${only} with an ABOUT`);
  const toEmbed: Planned[] = [];
  let skipped = 0;
  for (const row of considered) {
    const hash = aboutHash(row.about);
    if (row.storedHash === hash) skipped += 1;
    else toEmbed.push({ recordId: row.recordId, about: row.about, hash });
  }
  return { toEmbed, skipped };
}
