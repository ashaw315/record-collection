import { z } from 'zod';
import { meaningful } from '@/lib/discogs/fields';

/**
 * What grounds an ABOUT (the coordinator, 4 Nov). The ungrounded note for a
 * 2026 record placed it "before the full-length arrived" when the band's
 * debut was 2023: facts recalled, and wrong. The cached release payload
 * already holds the label, country, format, year, credits and companies, at
 * no new call; the artist's discography is one endpoint the app had never
 * used, `/artists/{id}/releases`, one call per artist through the one
 * limiter. In the prompt, they stop being recalled and start being read.
 *
 * Pure: the readers take the payloads, the prompt builder in `snippet-client`
 * takes the result, and the checker in `about-check` reads the same shape.
 */
export type ReleaseFacts = {
  label: string | null;
  country: string | null;
  year: number | null;
  format: string | null;
  artistId: number | null;
  credits: { name: string; role: string }[];
  companies: { name: string; role: string }[];
  /** Discogs' community figures, the obscurity proxy: how many have it, want it, and rate it. */
  community: { have: number; want: number; rating: number; ratings: number } | null;
  /**
   * The release's tracks by position and title, in the payload's order (5 Nov). Read for the
   * checker, not the prompt: the fact-check pass on the 45 found a bonus track named as on the
   * LP and a side's order reversed, both in the tracklist the cache held and the checker never
   * read. Empty where the release carries none, which the checker reads as unchecked, not wrong.
   */
  tracks: { position: string; title: string }[];
};

export type DiscographyEntry = { title: string; year: number; format: string };

export type Grounding = { facts: ReleaseFacts; discography: DiscographyEntry[] };

const Person = z.object({ name: z.string().optional(), role: z.string().optional() });
const Release = z.object({
  /* A release has an id and a title; an object with only an id is not one, and the reader says so rather than returning eight nulls. */
  id: z.number(),
  title: z.string(),
  artists: z.array(z.object({ id: z.number().optional(), name: z.string().optional() })).optional(),
  labels: z.array(z.object({ name: z.string().optional() })).optional(),
  country: z.string().optional(),
  year: z.number().optional(),
  formats: z.array(z.object({ name: z.string().optional(), descriptions: z.array(z.string()).optional() })).optional(),
  extraartists: z.array(Person).optional(),
  companies: z.array(z.object({ name: z.string().optional(), entity_type_name: z.string().optional() })).optional(),
  community: z.object({ have: z.number().optional(), want: z.number().optional(), rating: z.object({ count: z.number().optional(), average: z.number().optional() }).optional() }).optional(),
  tracklist: z.array(z.object({ position: z.string().optional(), title: z.string().optional() })).optional(),
});

/** The release's facts from its cached payload, or null when the payload is not a release. */
export function groundingFromPayload(payload: unknown): ReleaseFacts | null {
  const parsed = Release.safeParse(payload);
  if (!parsed.success) return null;
  const r = parsed.data;
  const format = r.formats?.[0];
  const formatText = format === undefined ? null : [format.name, ...(format.descriptions ?? [])].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(', ');
  const people = (list: { name?: string; role?: string }[] | undefined) =>
    (list ?? []).map((p) => ({ name: meaningful(p.name), role: meaningful(p.role) })).filter((p): p is { name: string; role: string } => p.name !== null && p.role !== null);
  const community = r.community;
  return {
    label: meaningful(r.labels?.[0]?.name),
    country: meaningful(r.country),
    year: r.year ?? null,
    format: formatText === '' ? null : formatText,
    artistId: r.artists?.[0]?.id ?? null,
    credits: people(r.extraartists),
    companies: people((r.companies ?? []).map((c) => ({ name: c.name, role: c.entity_type_name }))),
    community:
      community === undefined || community.have === undefined || community.want === undefined
        ? null
        : { have: community.have, want: community.want, rating: community.rating?.average ?? 0, ratings: community.rating?.count ?? 0 },
    tracks: (r.tracklist ?? []).map((t) => ({ position: meaningful(t.position) ?? '', title: meaningful(t.title) })).filter((t): t is { position: string; title: string } => t.title !== null),
  };
}

const Releases = z.object({
  releases: z.array(z.object({ title: z.string().optional(), year: z.number().optional(), type: z.string().optional(), role: z.string().optional(), format: z.string().optional() })),
});

/**
 * The artist's own releases from `/artists/{id}/releases`: the masters they
 * are the main artist of, oldest first. Appearances, remixes and the
 * per-pressing releases under a master are left out, since the question a
 * note gets wrong is what the artist made and when, not every pressing of it.
 */
export function discographyOf(payload: unknown): DiscographyEntry[] {
  const parsed = Releases.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.releases
    .filter((r) => r.type === 'master' && r.role === 'Main' && typeof r.year === 'number' && r.year > 0 && meaningful(r.title) !== null)
    .map((r) => ({ title: r.title as string, year: r.year as number, format: meaningful(r.format) ?? '' }))
    .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
}
