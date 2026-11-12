import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError } from '@/lib/api/errors';
import { probesOpen } from '@/lib/probes';
import { stubEmbedding } from '@/lib/openai/stub-embedding';

/**
 * **The e2e server's embeddings endpoint (Q22's control, 12 Nov).** Step 140's shape for a feature the test
 * environment cannot reach: served where the probes are open (`E2E_PROBES=1` on a non-production env, as the probe
 * pages are) and not-found everywhere else, production included. `playwright.config.ts` points `OPENAI_BASE_URL` here,
 * so `embedTexts` posts to this path with no branch of its own and reads OpenAI's shape back, from the stub model the
 * specs seed with.
 */
const schema = z.object({ model: z.string(), input: z.array(z.string()) });

export async function POST(request: Request): Promise<Response> {
  if (!probesOpen()) return new NextResponse(null, { status: 404 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidJson();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { model, input } = parsed.data;
  return NextResponse.json({
    object: 'list',
    model,
    data: input.map((text, index) => ({ object: 'embedding', index, embedding: stubEmbedding(text) })),
    usage: { prompt_tokens: 0, total_tokens: 0 },
  });
}
