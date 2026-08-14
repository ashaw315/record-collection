import { z } from 'zod';

/**
 * MusicBrainz artist-artist relations → membership rows (SPEC.md §4.3, §12 step 11).
 *
 * **Pure, and it keeps exactly one relation type.** MusicBrainz's artist-artist
 * vocabulary is membership, collaboration, founder, rename, tribute, subgroup
 * and personal relations — and nothing in it represents influence. §4.3 is
 * explicit that membership is a *fact with a source* while influence is the
 * user's judgement, so only `member of band` becomes a row here.
 *
 * `founder` and `subgroup` are the tempting near-misses: both are real
 * relationships between artists, and neither is membership. Greg Ginn founded
 * Black Flag AND was a member, but those are two different assertions and only
 * the second is one this table records.
 */

/** The only relation type §4.3's table can hold. */
const MEMBER_OF_BAND = 'member of band';

/**
 * Attributes that are qualifiers rather than instruments.
 *
 * `attributes` mixes the two — "original" arrives beside "drums (drum set)" —
 * and §4.3 puts `instrument` in the PRIMARY KEY, so a qualifier stored there
 * would decide row identity. Anything not listed here is treated as an
 * instrument, because their instrument vocabulary is large and open, and
 * guessing the other way would silently drop real instruments.
 */
const NON_INSTRUMENT_ATTRIBUTES = new Set([
  'original',
  'additional',
  'guest',
  'live',
  'solo',
]);

export type MembershipRelation = {
  /** The OTHER artist in the relation — never the one we asked about. */
  artistMbid: string;
  artistName: string;
  /** MusicBrainz's own classification of that artist. */
  artistType: string | null;
  /**
   * What the other artist is IN THIS RELATION, derived from `direction`.
   *
   * `person` — we asked about a band, this is one of its members.
   * `group`  — we asked about a person, this is a band they were in.
   */
  role: 'person' | 'group';
  instrument: string | null;
  beganYear: number | null;
  endedYear: number | null;
};

/**
 * Deliberately permissive: unknown keys are ignored rather than rejected.
 *
 * The opposite of the app's own boundaries, and for a different reason — this
 * is someone else's payload, they add fields, and a strict parse would turn
 * their schema evolution into our outage. What must be present is only what
 * §4.3 needs.
 */
const rawRelation = z.object({
  type: z.string(),
  direction: z.string().optional(),
  'target-type': z.string().optional(),
  attributes: z.array(z.string()).optional(),
  begin: z.string().nullish(),
  end: z.string().nullish(),
  artist: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    type: z.string().nullish(),
  }),
});

/**
 * A MusicBrainz date as a year.
 *
 * Three formats occur in real payloads — measured across the captured fixtures:
 * `1976`, `2014-03` and `2011-12-13`. §4.3 stores an INTEGER year, and
 * `Number('2011-12-13')` is `NaN` — the coercion class from NOTES in a new
 * place. A NaN reaching an integer column fails at the database, far from the
 * parse that caused it, so it is rejected here instead.
 */
function toYear(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  const [head] = value.split('-');
  if (!/^\d{4}$/.test(head)) return null;

  const year = Number(head);
  return Number.isInteger(year) ? year : null;
}

function toInstrument(attributes: string[] | undefined): string | null {
  const instrument = (attributes ?? []).find(
    (attribute) => !NON_INSTRUMENT_ATTRIBUTES.has(attribute.toLowerCase()),
  );

  // Null rather than '': §4.3 makes the column nullable, and null is what "not
  // recorded" means everywhere else in this schema.
  return instrument ?? null;
}

export function normalizeRelations(relations: unknown): MembershipRelation[] {
  if (!Array.isArray(relations)) return [];

  const memberships: MembershipRelation[] = [];

  for (const candidate of relations) {
    const parsed = rawRelation.safeParse(candidate);

    /**
     * A single unusable relation must not lose the other thirty. MusicBrainz
     * data is user-submitted and §6 applies the same reasoning to Discogs —
     * skip the row, keep the payload.
     */
    if (!parsed.success) continue;

    const relation = parsed.data;

    if (relation.type !== MEMBER_OF_BAND) continue;

    // `target-type` is absent on some payloads; only a non-artist target is a
    // reason to skip.
    if (relation['target-type'] !== undefined && relation['target-type'] !== 'artist') continue;

    /**
     * **`direction` decides this, not the target's Person/Group type.**
     *
     * The same relation reads `backward` from the band and `forward` from the
     * person, so asking a band gives its members and asking a person gives
     * their bands. Keying on the target's type instead is the tempting
     * shortcut and it is wrong — MusicBrainz has Group-type artists on either
     * side of a membership, and the failure it produces is silent inversion:
     * bands recorded as members of people.
     */
    const role = relation.direction === 'forward' ? 'group' : 'person';

    memberships.push({
      artistMbid: relation.artist.id,
      artistName: relation.artist.name ?? '',
      artistType: relation.artist.type ?? null,
      role,
      instrument: toInstrument(relation.attributes),
      beganYear: toYear(relation.begin),
      endedYear: toYear(relation.end),
    });
  }

  return memberships;
}
