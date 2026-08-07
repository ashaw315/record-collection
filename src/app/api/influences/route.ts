import { NextResponse } from 'next/server';
import { z } from 'zod';
import { duplicate, invalidJson, isUniqueViolation, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { findArtistById } from '@/lib/db/queries/artists';
import {
  STRENGTH_MAX,
  STRENGTH_MIN,
  createInfluence,
  findInfluence,
} from '@/lib/db/queries/influences';

/**
 * SPEC.md §5.5 `POST /api/influences`.
 *
 * Edges are DIRECTED: this creates source→target and nothing else. Inserting
 * the reverse "for convenience" would silently double every edge in §8's graph
 * and make every influence mutual.
 */

/**
 * §4.3 says strength is 1–5. The database does NOT enforce it — verified,
 * strength 99 inserts cleanly — so this is the only guard.
 */
const strengthSchema = z.number().int().min(STRENGTH_MIN).max(STRENGTH_MAX);

const createSchema = z.strictObject({
  sourceArtistId: z.string().uuid(),
  targetArtistId: z.string().uuid(),
  strength: strengthSchema.optional(),
  notes: z.string().trim().max(10_000).nullish(),
});

export const POST = withErrorHandling('api.influences.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { sourceArtistId, targetArtistId, strength, notes } = parsed.data;

  /**
   * The self-edge CHECK exists in the database (§4.3), so this is defence in
   * depth rather than the only guard — but a raw CHECK violation would surface
   * as a 500 for what is plainly a client mistake, and it names the field.
   */
  if (sourceArtistId === targetArtistId) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid request',
          code: 'VALIDATION_ERROR',
          fieldErrors: { targetArtistId: 'An artist cannot influence itself' },
        },
      },
      { status: 400 },
    );
  }

  // Both endpoints checked, each naming ITSELF — a client told only "invalid
  // request" cannot tell which artist id was wrong.
  const fieldErrors: Record<string, string> = {};
  if ((await findArtistById(sourceArtistId)) === undefined) {
    fieldErrors.sourceArtistId = 'No artist with that id exists';
  }
  if ((await findArtistById(targetArtistId)) === undefined) {
    fieldErrors.targetArtistId = 'No artist with that id exists';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
      { status: 400 },
    );
  }

  const existingEdge = await findInfluence(sourceArtistId, targetArtistId);
  if (existingEdge !== undefined) {
    /**
     * An influence edge has no surrogate id — §5.5 addresses it by the PAIR in
     * the path. `sourceArtistId` is what a client needs to reach it
     * (`/api/influences/:sourceId/:targetId`), so that is what §5.4's
     * existingId carries here.
     */
    return duplicate('That influence edge already exists', sourceArtistId);
  }

  try {
    const created = await createInfluence({
      sourceArtistId,
      targetArtistId,
      strength,
      notes: notes ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // The pre-check is not a lock: two concurrent creates can both pass it and
    // one loses to the composite primary key.
    if (isUniqueViolation(error)) {
      // The concurrent winner holds the same pair, so the same identifier
      // reaches it (§5.5).
      return duplicate('That influence edge already exists', sourceArtistId);
    }
    throw error;
  }
});
