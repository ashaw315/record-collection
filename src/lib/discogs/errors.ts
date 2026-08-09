import { NextResponse } from 'next/server';
import { DiscogsError } from './client';

/**
 * Turns a Discogs failure into a response that says whose failure it was
 * (SPEC.md §5, §6).
 *
 * Shared by every Discogs route rather than repeated in each: the mapping is a
 * policy decision, and two copies would drift into one endpoint calling an
 * outage a 502 while another called it a 500 — with the difference invisible
 * until someone read the logs during an actual outage.
 *
 * The principle: **Discogs being unavailable is not a bug in this app.** A 500
 * says "we are broken" and sends someone hunting for a defect that does not
 * exist; a 429 or 502 says "the thing we depend on is unhappy, try again",
 * which is both true and actionable.
 */
export function discogsErrorResponse(error: DiscogsError): NextResponse {
  if (error.status === 429) {
    // §6: "surface a clear error to the client rather than silently failing".
    return NextResponse.json(
      {
        error: {
          message: 'Discogs rate limit reached. Try again in a moment.',
          code: 'RATE_LIMITED',
        },
      },
      { status: 429 },
    );
  }

  if (error.status === 404) {
    // Passed through as a 404 rather than folded into the upstream bucket: the
    // caller asked for something that does not exist, which is a different
    // thing from Discogs being unreachable and has a different remedy.
    return NextResponse.json(
      { error: { message: 'Not found on Discogs', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { error: { message: 'Could not reach Discogs. Try again shortly.', code: 'UPSTREAM_ERROR' } },
    { status: 502 },
  );
}
