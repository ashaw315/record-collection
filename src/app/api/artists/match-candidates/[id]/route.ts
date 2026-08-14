import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import {
  resolveMatchCandidate,
  type MatchResolution,
} from '@/lib/db/queries/artist-match-candidates';

/**
 * SPEC.md §4.3 — answering one possible-duplicate pair.
 *
 * **Both answers cost exactly one call, deliberately.** A wrong merge is
 * invisible and self-reinforcing; a wrong "distinct" is visible and cheap. If
 * declining were the harder path the review would become a merge button with
 * extra steps, which is the dangerous failure arrived at through the UI.
 */
const bodySchema = z
  .object({
    // §4.3 names two and only two. An enum rather than a string: an unknown
    // value would be stored and the pair would read as answered without anyone
    // knowing what the answer was.
    resolution: z.enum(['merged', 'distinct']),
  })
  .strict();

export const PATCH = withErrorHandling(
  'PATCH /api/artists/match-candidates/:id',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return badRequest('That is not a valid match candidate id.', 'INVALID_ID');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    await resolveMatchCandidate(id, parsed.data.resolution as MatchResolution);

    return NextResponse.json({ ok: true });
  },
);
