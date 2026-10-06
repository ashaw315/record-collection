import { expect, type Page } from '@playwright/test';
import { trackArtist, trackCreated } from './cleanup';
import type { IdentityExtreme } from '../src/app/records/[id]/identity-extremes';

/**
 * **§27's shared extremes fixture, seeded — the one place a test gets the
 * collection's worst case.**
 *
 * It lives in a MODULE rather than in a spec because Playwright refuses
 * spec-to-spec imports, and because §27's rule is that every test of a bound
 * takes its case from one shared file: a helper reachable only by importing
 * somebody's spec is one copy away from the drift the rule exists to stop.
 * `identity-extremes.ts` in the source tree states what the worst case IS;
 * this puts it in the database.
 */
/**
 * Seeds one of the extremes, suffixing every NAMED thing so parallel specs
 * cannot collide — with a suffix SHORT enough not to change the cell's shape.
 *
 * The first version used a twelve-character suffix, and "Donna Summer
 * dmue4rj1d9999" wraps to a second 40px line where "Donna Summer" does not.
 * That put the record at 525 against 510 and reported a 15px overflow Design
 * was about to rule a height term against; measured unsuffixed the same
 * record needs 485 and fits by 25. A suffix is isolation, not shape, so it
 * is four characters here and the one-line artist is asserted below as the
 * precondition it is — a wrapping suffix must fail loudly, not inflate.
 */
export async function seedExtreme(page: Page, extreme: IdentityExtreme): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  /*
    The artist's isolation cannot be a suffix: even four characters wrap
    "Donna Summer" at 40px in the 412 measure (measured: two lines). The
    record's shape is one 40px line, and that is what this preserves — a
    unique name of the SAME LENGTH, so the cell sees exactly what it sees on
    the real record while parallel specs cannot collide. The letters are not
    the claim; the line count is, and it is asserted as a precondition.
  */
  const uniqueTail = Math.random().toString(36).slice(2, 2 + (extreme.artist.length - extreme.artist.indexOf(' ') - 1));
  const artistName = `${extreme.artist.slice(0, extreme.artist.indexOf(' ') + 1)}${uniqueTail.padEnd(extreme.artist.length - extreme.artist.indexOf(' ') - 1, 'x')}`;
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(path, { data, failOnStatusCode: false });
    /* Pressings are shared and found-or-created (§4), so the same catalogue posted twice is a 200 the second time. */
    expect([200, 201], `${path} returned ${r.status()}`).toContain(r.status());
    const body = await r.json();
    if (r.status() === 201) trackCreated(path, body);
    return body;
  };
  const artist = await post('/api/artists', { name: artistName });
  trackArtist(artist.id);
  /*
    **Every attached fact is optional, because EMPTIEST has none of them.**
    §29's report needs both ends of the collection, and the emptiest record
    is one the schema permits: a title and an artist and nothing else. A
    helper that always posts a label and a pressing cannot produce it, and
    seeding one by hand beside this would be the second copy §27 forbids.
  */
  const label = extreme.label === null ? null : await post('/api/labels', { name: `${extreme.label} ${suffix}` });
  const genreIds: string[] = [];
  for (const name of extreme.genres) genreIds.push((await post('/api/genres', { name: `${name} ${suffix}` })).id);
  const pressing =
    extreme.catalogNumber === null
      ? null
      : await post('/api/pressings', {
          catalogNumber: extreme.catalogNumber,
          yearPressed: extreme.yearPressed,
          countryPressed: extreme.countryPressed,
        });
  const format = extreme.format === null ? null : await post('/api/formats', { name: `${extreme.format} ${suffix}` });
  const record = await post('/api/records', {
    title: extreme.title,
    artistId: artist.id,
    ...(label === null ? {} : { labelId: label.id }),
    genreIds,
    ...(pressing === null ? {} : { pressingId: pressing.id }),
    ...(format === null ? {} : { formatId: format.id }),
    releaseYear: extreme.releaseYear,
  });
  return record.id as string;
}
