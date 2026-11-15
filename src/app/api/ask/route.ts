import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, notConfigured, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { rankByNearness } from '@/lib/ask/rank';
import { askPick } from '@/lib/ask/pick';
import { embeddingsFor, matchedTextsFor, pickEngaged, recordByTitleKey } from '@/lib/db/queries/ask';
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
  /* §P.2 (12 Nov): an answer is what is shown, one on the shelf and five elsewhere, so the floor is one. */
  take: z.number().int().min(1).max(5),
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

  /*
    Step 3, unit 2a (the coordinator, 14 Nov): one collection-wide condition, a one-way latch. The route ranks until
    every record with an ABOUT has matched text; then it asks the model pick over the pool's records that have it, and
    never ranks again. Never per record, so the pool is one kind of text in either state. `take` is the ranking's: the
    pick returns up to five and the page walks them.
  */
  if (await pickEngaged()) {
    const described = await matchedTextsFor(pool);
    /*
      A title ask while the model picks ("Matched by role and count line", 14 Nov): the named record's matched text is
      sent as the phrase and the record is left out, so no title reaches the model and the ground is one. A title whose
      record has no matched text is an ordinary phrase, as a title of a record not in the collection is.
    */
    const titled = await recordByTitleKey(phrase, pool);
    const own = titled === null ? undefined : described.find((r) => r.id === titled);
    const eligible = own === undefined ? described : described.filter((r) => r.id !== own.id);
    const asked = own === undefined ? phrase : own.text;
    const from = own === undefined ? 'phrase' : 'title';
    const askedFrom = own?.id ?? null;
    if (eligible.length === 0) return NextResponse.json({ mode: 'pick', verdict: null, answers: [], from, askedFrom, unanswerable: true });
    if (!process.env.OPENAI_API_KEY) {
      logger.error('api.ask', 'OPENAI_API_KEY is not set in this environment: the ask cannot ask the model pick; set it in Vercel’s project environment');
      return notConfigured('The ask is not configured on this deployment');
    }
    const picked = await askPick(asked, eligible, exclude ?? []);
    if (!picked.ok) {
      logger.error('api.ask', `the model pick failed: ${picked.reason}`);
      return NextResponse.json({ error: { code: 'PICK_FAILED', message: 'The ask could not choose this time' } }, { status: 502 });
    }
    if (picked.dropped.length > 0) logger.info('api.ask', `the pick dropped ${picked.dropped.map((d) => `${d.id} (${d.why})`).join('; ')}`);
    /*
      A run's end is the app's to say, from the run's shown records, never the model's (the coordinator, 14 Nov): the
      model saying nothing fits is "nothing fits" while the run has shown nothing, and "no more for this run" once it
      has shown some, with no record.
    */
    if (picked.verdict === 'nothing-fits' && (exclude?.length ?? 0) > 0) {
      return NextResponse.json({ mode: 'pick', verdict: 'run-exhausted', answers: [], from, askedFrom, unanswerable: false });
    }
    return NextResponse.json({
      mode: 'pick',
      verdict: picked.verdict,
      answers: picked.picks.map((p) => ({ recordId: p.id, reason: p.reason, claims: p.claims })),
      from,
      askedFrom,
      unanswerable: false,
    });
  }

  const candidates = await embeddingsFor(pool, EMBEDDING_MODEL);
  if (candidates.length === 0) {
    return NextResponse.json({ mode: 'ranking', answers: [], from: 'phrase', askedFrom: null, unanswerable: true });
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
  return NextResponse.json({ mode: 'ranking', answers, from: own === undefined ? 'phrase' : 'title', askedFrom: own?.recordId ?? null, unanswerable: false });
});
