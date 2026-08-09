import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { normalizeSearchResponse } from '@/lib/discogs/normalize-search';

/**
 * SPEC.md §5.7 `GET /api/discogs/search` — structured search.
 *
 * The point of this endpoint is stated in §5.7's opening line: the user
 * describes a record they are HOLDING and gets back the specific pressing. A
 * bare `q` search cannot do that — the captured fixture reports 920 results for
 * `artist=Discharge`, and the live API returned 5,315 for a broader query. The
 * structured params, `catno` and `barcode` above all, are what turn a list
 * nobody can read into an identification.
 *
 * Search results are NOT cached (§6). A release is a stable description of a
 * physical object; a search is a question whose answer depends on what was
 * typed and on the whole database. Caching one would serve yesterday's answer
 * to today's question, in a shop.
 */

/**
 * Every param is optional individually, and at least one must be present — see
 * the refine below.
 *
 * `.trim()` before the emptiness check because `?artist=%20` is a blank the
 * user did not mean to send, and treating it as a filter asks Discogs to match
 * a space.
 */
const nonEmpty = z.string().trim().min(1).optional();

const searchParamsSchema = z
  .strictObject({
    artist: nonEmpty,
    title: nonEmpty,
    label: nonEmpty,
    catno: nonEmpty,
    barcode: nonEmpty,
    country: nonEmpty,
    year: nonEmpty,
    format: nonEmpty,
    genre: nonEmpty,
    style: nonEmpty,
    track: nonEmpty,
    q: nonEmpty,
    // §5.7: "release | master. Default release." An enum rather than a
    // pass-through: an unrecognised type would reach Discogs as a filter it
    // does not understand, and the failure would look like "no results".
    type: z.enum(['release', 'master']).optional(),
    page: z.coerce.number().int().positive().optional(),
  });

/**
 * The params that count as a SEARCH TERM. `type` and `page` do not: both have
 * defaults and neither narrows anything, so `?type=release&page=2` is still a
 * request to list the entire database.
 */
const SEARCH_TERMS = [
  'artist',
  'title',
  'label',
  'catno',
  'barcode',
  'country',
  'year',
  'format',
  'genre',
  'style',
  'track',
  'q',
] as const;

const NO_TERMS_MESSAGE =
  'Provide at least one search term — artist, title, label, catalog number, barcode, country, year, format, genre, style, track, or a freeform query';

/**
 * §5.7's one-to-one mapping onto Discogs' own parameter names.
 *
 * Ours differ from theirs in exactly one place — `title` is their
 * `release_title` — and that single rename is the reason this is a table rather
 * than a spread. A mapping that silently dropped `catno` would still return
 * results, because Discogs answers the broader query happily, so the failure
 * mode is a search that ignores the most identifying thing the user typed.
 */
const PARAM_MAP: Record<string, string> = {
  artist: 'artist',
  title: 'release_title',
  label: 'label',
  catno: 'catno',
  barcode: 'barcode',
  country: 'country',
  year: 'year',
  format: 'format',
  genre: 'genre',
  style: 'style',
  track: 'track',
  q: 'q',
};

export const GET = withErrorHandling('api.discogs.search.GET', async (request: Request) => {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  const parsed = searchParamsSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  /**
   * §5.7: "At least one must be present."
   *
   * Checked here rather than as a Zod `.refine` because an object-level refine
   * produces an issue with an EMPTY path, and `validationError` keeps only
   * issues that name a field — so the message explaining what to supply was
   * silently replaced by "Invalid request". Caught by the test asserting the
   * message; recorded in NOTES, since it applies to every object-level refine
   * in the project.
   */
  if (!SEARCH_TERMS.some((term) => parsed.data[term] !== undefined)) {
    return badRequest(NO_TERMS_MESSAGE, 'VALIDATION_ERROR');
  }

  const { type = 'release', page, ...terms } = parsed.data;

  const query: Record<string, string | number> = { type };
  for (const [ours, theirs] of Object.entries(PARAM_MAP)) {
    const value = terms[ours as keyof typeof terms];
    if (value !== undefined) query[theirs] = value;
  }
  if (page !== undefined) query.page = page;

  try {
    const payload = await getDiscogsClient().get('/database/search', query);

    return NextResponse.json(normalizeSearchResponse(payload));
  } catch (error) {
    if (error instanceof DiscogsError) {
      /**
       * Discogs' failures are reported as theirs, not ours. A 429 is a defined,
       * temporary condition the user can act on by waiting; a 500 would tell
       * them the app is broken and send someone looking for a bug that is not
       * there. Everything else upstream becomes a 502 for the same reason.
       */
      if (error.status === 429) {
        return NextResponse.json(
          { error: { message: 'Discogs rate limit reached. Try again in a moment.', code: 'RATE_LIMITED' } },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: { message: 'Could not reach Discogs. Try again shortly.', code: 'UPSTREAM_ERROR' } },
        { status: 502 },
      );
    }

    throw error;
  }
});
