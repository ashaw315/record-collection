import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { recordLlmRun } from '@/lib/llm/rate-limit';

/**
 * A batch run records whether each call finished or failed (the coordinator,
 * 4 Nov): the mood tagger recorded nothing, and six untagged records went
 * unnoticed for two days until someone counted. A batch does not claim against
 * the 10-an-hour limit, which is for a person's requests, but every call it
 * makes leaves a row: completed with its usage, or completed with a failure
 * named in `stop_reason`, never a claim left open. Against the real database.
 * Fails against a writer that claims, that leaves `completed_at` NULL on a
 * failure, or that drops the reason.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

type Row = { kind: string; completed_at: string | null; input_tokens: number | null; output_tokens: number | null; stop_reason: string | null };

describe('recordLlmRun', () => {
  it('records a finished call with its usage, completed', async () => {
    await recordLlmRun('about_batch', { finished: true, inputTokens: 250, outputTokens: 600, stopReason: 'end_turn' });
    const [row] = (await db.execute<Row>(sql`SELECT kind, completed_at, input_tokens, output_tokens, stop_reason FROM llm_requests`)).rows;
    expect(row.kind).toBe('about_batch');
    expect(row.completed_at).not.toBeNull();
    expect([row.input_tokens, row.output_tokens, row.stop_reason]).toEqual([250, 600, 'end_turn']);
  });

  it('records a failed call as completed with the failure named, so no claim stands open', async () => {
    await recordLlmRun('about_batch', { finished: false, reason: 'cut' });
    const [row] = (await db.execute<Row>(sql`SELECT kind, completed_at, input_tokens, output_tokens, stop_reason FROM llm_requests`)).rows;
    expect(row.completed_at).not.toBeNull();
    expect(row.stop_reason).toBe('failed: cut');
    expect(row.input_tokens).toBeNull();
  });

  it('does not count against the hour’s ten: eleven batch rows and a person’s claim still succeeds', async () => {
    for (let i = 0; i < 11; i += 1) await recordLlmRun('about_batch', { finished: true, inputTokens: 1, outputTokens: 1, stopReason: 'end_turn' });
    const { claimLlmRequest } = await import('@/lib/llm/rate-limit');
    const claim = await claimLlmRequest('snippet');
    expect(claim.ok).toBe(true);
  });
});
