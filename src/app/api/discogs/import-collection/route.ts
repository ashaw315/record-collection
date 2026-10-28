import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError, type ApiErrorBody } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { runImport } from '@/lib/db/queries/collection-import';

/**
 * SPEC.md §5 `POST /api/discogs/import-collection` (A77, step 18): the token
 * owner's own Discogs collection into the app, session-only (the middleware,
 * §3), never scheduled. No body: whose collection it is comes from the token
 * (`/oauth/identity`), not from the caller, so there is nothing to accept and
 * an unknown key is refused rather than ignored (CLAUDE.md §6). The answer is
 * the run: the report (what was imported with what it left blank, what was
 * already here, and what failed, each item in exactly one of the three) and
 * when it finished.
 */
const bodySchema = z.object({}).strict();

export const POST = withErrorHandling('api.discogs.import-collection.POST', async (request: Request) => {
  const text = await request.text();
  if (text.trim() !== '') {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return invalidJson();
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
  }

  try {
    /* The run, recorded and answered with when it finished: §T.6's report survives leaving Manage, read back from §4.2's `discogs_import_runs`. */
    const run = await runImport(getDiscogsClient());
    return NextResponse.json(run, { status: 200 });
  } catch (error) {
    if (error instanceof DiscogsError) return discogsErrorResponse(error);
    /* A token without a username reaches no collection: Discogs' answer, not ours, so a gateway error with its own code. */
    if (error instanceof Error && /username/.test(error.message)) {
      return NextResponse.json<ApiErrorBody>({ error: { message: error.message, code: 'DISCOGS_NO_USERNAME' } }, { status: 502 });
    }
    throw error;
  }
});
