import { z } from 'zod';
import { type Clock, isValidFormedYear } from '@/lib/api/year';

/**
 * **The artist's formation and home, read from the MusicBrainz artist payload the lineup walk already fetches (Q37,
 * Adam's ruling of 11 Nov; built 20 Nov).** The walk kept the payload's relations and discarded these; on production
 * that left `formed_year` and `origin_country` set on one of forty-nine artists with records while the ABOUT grounding
 * (about-grounding.ts) reads both.
 *
 * `life-span.begin` is a group's formation and a person's birth, so the formed year is read for anything but a Person
 * (§4.1: `formed_year` is band formation, not a birth), and only within §4.1's bound, with the clock injected as the
 * bound's own module requires. The origin is the begin-area with its area ("Stoke-on-Trent, United Kingdom"), the area
 * alone where there is no begin-area or the two are one place, and null where the payload names no place; the country
 * code is not appended, since the area already names the country. Pure, so the walk and the backfill read one way.
 */
export type ArtistFactsFromMusicBrainz = { formedYear: number | null; origin: string | null };

const Place = z.object({ name: z.string().optional() }).nullish();
const Payload = z.object({
  type: z.string().nullish(),
  'life-span': z.object({ begin: z.string().nullish() }).nullish(),
  area: Place,
  'begin-area': Place,
});

const meaningful = (value: string | undefined): string | null => (value === undefined || value.trim() === '' ? null : value.trim());

export function artistFactsFromPayload(payload: unknown, clock?: Clock): ArtistFactsFromMusicBrainz {
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) return { formedYear: null, origin: null };
  const p = parsed.data;
  let formedYear: number | null = null;
  if (p.type !== 'Person') {
    const head = (p['life-span']?.begin ?? '').split('-')[0];
    if (/^\d{4}$/.test(head) && isValidFormedYear(Number(head), clock)) formedYear = Number(head);
  }
  const area = meaningful(p.area?.name);
  const beginArea = meaningful(p['begin-area']?.name);
  const origin = beginArea === null ? area : area === null || area === beginArea ? beginArea : `${beginArea}, ${area}`;
  return { formedYear, origin };
}
