import type { ReleaseTextKind } from './release-text';

/**
 * The words a release-text row is read in, shared by §T.3's reason line and
 * §65's TRACKLIST section (step 172), so a match reads the same in a result
 * and on the record's page. Pure and not server-only: the table and the grid
 * render on the client. The wording is Code's proposal, provisional until
 * captured.
 */
const SEPARATOR = ' · ';

/* Discogs tells two artists or companies of one name apart by appending " (2)"; it is the index's, not the record's. A title can end in a number in brackets of its own, so only names lose it. */
const DISAMBIGUATOR = /\s\(\d+\)$/;

export function releaseTextWords(row: { kind: ReleaseTextKind; text: string; detail: string | null }): string {
  if (row.kind === 'track') return row.detail === null ? row.text : `${row.detail}${SEPARATOR}${row.text}`;
  const name = row.text.replace(DISAMBIGUATOR, '');
  return row.detail === null ? name : `${name}${SEPARATOR}${row.detail}`;
}
