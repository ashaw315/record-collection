import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, notConfigured, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { rankByNearness } from '@/lib/ask/rank';
import { embeddingsFor, recordByTitleKey } from '@/lib/db/queries/ask';
import { logger } from '@/lib/logger';
import { EMBEDDING_MODEL, embedTexts } from '@/lib/openai/embeddings';

/**
 * **Q22's ask: `POST /api/ask` (§P.2 as it stands; the coordinator, 11 Nov).** The reader writes what they want; the
 * pool is the page's, every match of the filters and the search on every page, handed over as ids; the answer is the
 * nearest three to five by cosine of each ABOUT's stored vector to the phrase's, embedded here with the same model. A
 * phrase that is a record's title by §T.4's name key asks from that record's vector, with no embedding, and leaves the
 * record out of its own answers. A re-ask hands the last answer's ids as `exclude`, left out while enough remain. A
 * pool with no ABOUT is unanswerable, and says so. Nothing here filters: the pool is what the page shows (§P.2).
 *
 * The key is `OPENAI_API_KEY` in Vercel's project environment, the second place it must be set (the first is Adam's
 * shell for the embedding script). Absent, the route refuses before any request: the server log names the variable,
 * and the answer is a 503 in the reader's terms, since an error body reaches a browser and never names an environment
 * variable (errors.ts). Never an empty answer in its place.
 *
 * The eighth shared quantity (`scripts/twice-intersect.mjs`): the ranking is a read over the whole pool by construction.
 */
const schema = z.strictObject({
  phrase: z.string().transform((s) => s.trim()).refine((s) => s.length > 0, { message: 'Write what you want first' }),
  pool: z.array(z.string().uuid()).max(5000),
  exclude: z.array(z.string().uuid()).max(5000).optional(),
  take: z.number().int().min(3).max(5),
});

export const POST = withErrorHandling('api.ask.POST', async (request: Request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidJson();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { phrase, pool, exclude, take } = parsed.data;

  const candidates = await embeddingsFor(pool, EMBEDDING_MODEL);
  if (candidates.length === 0) {
    return NextResponse.json({ answers: [], from: 'phrase', askedFrom: null, unanswerable: true });
  }

  /* A title first: the record's own vector, and no request. */
  const askedFrom = await recordByTitleKey(phrase, pool);
  const own = askedFrom === null ? undefined : candidates.find((c) => c.recordId === askedFrom);
  let query: number[];
  if (own !== undefined) {
    query = own.vector;
  } else {
    if (!process.env.OPENAI_API_KEY) {
      logger.error('api.ask', 'OPENAI_API_KEY is not set in this environment: the ask cannot embed a phrase; set it in Vercel’s project environment');
      return notConfigured('The ask is not configured on this deployment');
    }
    [query] = await embedTexts([phrase]);
  }

  const answers = rankByNearness(query, candidates, { take, exclude, askedFrom: own?.recordId });
  return NextResponse.json({ answers, from: own === undefined ? 'phrase' : 'title', askedFrom: own?.recordId ?? null, unanswerable: false });
});
