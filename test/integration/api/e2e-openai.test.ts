import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/e2e-openai/v1/embeddings/route';
import { STUB_DIMS, stubEmbedding } from '@/lib/openai/stub-embedding';

/**
 * **The e2e server's embeddings stub (Q22's control, 12 Nov).** Step 140's shape for a feature the test environment
 * cannot reach: a route the e2e server serves and production answers not-found, gated as the probe pages are, on
 * `E2E_PROBES=1` and a parsed NODE_ENV that is not production. It answers OpenAI's shape so `embedTexts` needs no
 * branch: `data[]` with `index` and `embedding`, from the stub model. Each case fails against a route open without the
 * gate, one answering a shape the client would refuse, or one whose vectors differ from the stub the specs seed with.
 */
afterEach(() => vi.unstubAllEnvs());

const request = (body: unknown) => new Request('http://localhost/api/e2e-openai/v1/embeddings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /api/e2e-openai/v1/embeddings', () => {
  it('answers not-found unless the probes are open', async () => {
    vi.stubEnv('E2E_PROBES', '');
    const response = await POST(request({ model: 'text-embedding-3-small', input: ['x'] }));
    expect(response.status).toBe(404);
  });

  it('answers the stub model’s vectors in OpenAI’s shape, by index, when the probes are open', async () => {
    vi.stubEnv('E2E_PROBES', '1');
    const response = await POST(request({ model: 'text-embedding-3-small', input: ['late night jazz', 'loud fast punk'] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ index: number; embedding: number[] }>; model: string };
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.data.map((d) => d.index)).toEqual([0, 1]);
    expect(body.data[0].embedding).toEqual(stubEmbedding('late night jazz'));
    expect(body.data[1].embedding).toHaveLength(STUB_DIMS);
  });

  it('refuses a body without a list of texts', async () => {
    vi.stubEnv('E2E_PROBES', '1');
    const response = await POST(request({ model: 'text-embedding-3-small', input: 'not a list' }));
    expect(response.status).toBe(400);
  });
});
