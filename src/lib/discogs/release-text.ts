import { z } from 'zod';
import { meaningful } from './fields';

/**
 * The searchable text of a cached Discogs release (the free-text unit, 4 Nov).
 *
 * The cache holds every release payload the app has fetched, and four of its
 * fields are text a reader might search a collection by: the tracklist, the
 * credits (`extraartists`, on the release and on its tracks), the companies,
 * and the release notes. None of them is read by the record page, and the
 * search matched a record's title and its artist's name only. This turns a
 * payload into one row per searchable thing, each with its kind and, where
 * it has one, a detail a result can say the match by: a track's position, a
 * credit's or a company's role.
 *
 * Pure, so the rows are decided here and tested here; the store writes them
 * wherever the payload is written and the backfill derives them for the
 * releases cached before the table existed.
 */
export const RELEASE_TEXT_KINDS = ['track', 'credit', 'company', 'notes'] as const;
export type ReleaseTextKind = (typeof RELEASE_TEXT_KINDS)[number];

export type ReleaseTextRow = { kind: ReleaseTextKind; ordinal: number; text: string; detail: string | null };

/* Only the four fields, each tolerant of the absence Discogs spells as "" or omits; anything else in the payload is not read. */
const Credit = z.object({ name: z.string().optional(), role: z.string().optional() });
const Shape = z.object({
  tracklist: z.array(z.object({ position: z.string().optional(), title: z.string().optional(), extraartists: z.array(Credit).optional() })).optional(),
  extraartists: z.array(Credit).optional(),
  companies: z.array(z.object({ name: z.string().optional(), entity_type_name: z.string().optional() })).optional(),
  notes: z.string().optional(),
});

export function releaseText(payload: unknown): ReleaseTextRow[] {
  const parsed = Shape.safeParse(payload);
  if (!parsed.success) return [];
  const raw = parsed.data;
  const rows: ReleaseTextRow[] = [];
  const add = (kind: ReleaseTextKind, text: string | null, detail: string | null) => {
    if (text === null) return;
    rows.push({ kind, ordinal: rows.filter((row) => row.kind === kind).length, text, detail });
  };

  for (const track of raw.tracklist ?? []) add('track', meaningful(track.title), meaningful(track.position));
  for (const credit of raw.extraartists ?? []) add('credit', meaningful(credit.name), meaningful(credit.role));
  /* A track's own credits, after the release's, with the track's position in the detail so a result can say where. */
  for (const track of raw.tracklist ?? []) {
    const position = meaningful(track.position);
    for (const credit of track.extraartists ?? []) {
      const role = meaningful(credit.role);
      add('credit', meaningful(credit.name), [role, position].filter((part) => part !== null).join(', ') || null);
    }
  }
  for (const company of raw.companies ?? []) add('company', meaningful(company.name), meaningful(company.entity_type_name));
  add('notes', meaningful(raw.notes), null);
  return rows;
}
