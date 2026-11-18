import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, isUuid, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { clearMatchedTextEdit, editMatchedText, readMatchedText, type MatchedTextState } from '@/lib/db/queries/matched-text';

/**
 * SPEC.md §5.2's matched-text resource (§4.6, A78; the coordinator, 17 Nov): the text the ask's pick reads for a
 * record, as Adam's edit sheet reads and writes it.
 *
 * **Generation is deliberately absent.** `generated` is written by the drafting script on Adam's machine, never by a
 * route, since every production write of generated text is his to run (§5.2). These three touch `edited` and nothing
 * else, which every write test asserts. No `confirmReplace`: an edit replaces an edit by design (§4.6, "a second edit
 * starts from his first"), and nothing here can destroy generated text.
 */

type Context = { params: Promise<{ id: string }> };

/** §5.2: the six fields and `effective`, the text the pick reads, so the sheet opens on it. */
function answer(state: MatchedTextState) {
  return NextResponse.json({ data: { ...state, effective: state.edited ?? state.generated } });
}

async function answerFor(id: string) {
  const state = await readMatchedText(id);
  return state === null ? notFound('That record does not exist.') : answer(state);
}

export const GET = withErrorHandling('GET /api/records/:id/matched-text', async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest('That is not a valid record id.', 'INVALID_ID');
  return answerFor(id);
});

/**
 * `.strict()` per CLAUDE.md §6, and load-bearing here as on the snippet: `generated` and its model and time are the
 * script's to write, so a body that could carry them is refused rather than ignored.
 */
const editSchema = z.object({ edited: z.string().trim().min(1) }).strict();

export const PATCH = withErrorHandling('PATCH /api/records/:id/matched-text', async (request: Request, context: Context) => {
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest('That is not a valid record id.', 'INVALID_ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('The request body must be JSON.', 'INVALID_BODY');
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return badRequest('An edit is required.', 'VALIDATION_FAILED');

  const written = await editMatchedText(id, parsed.data.edited);
  if (!written.ok) return notFound('That record does not exist.');
  return answerFor(id);
});

export const DELETE = withErrorHandling('DELETE /api/records/:id/matched-text', async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest('That is not a valid record id.', 'INVALID_ID');

  const cleared = await clearMatchedTextEdit(id);
  if (!cleared.ok) return notFound('That record does not exist.');
  return answerFor(id);
});
