import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL, embedTexts, requireOpenAiKey } from './embeddings';

/**
 * **Q22's embedding client: OpenAI's text-embedding-3-small over fetch, and a named refusal when the key is absent
 * (Adam's provider answer and the coordinator's three rules on the key, 11 Nov).** Never a live call: `fetchImpl` is the
 * seam. Each case fails against a client that reads another variable, sends another model, returns vectors out of
 * input order, or answers an absent key with an empty result rather than a refusal naming the variable.
 */
const ok = (vectors: number[][]) =>
  new Response(JSON.stringify({ data: vectors.map((embedding, index) => ({ index, embedding })), model: EMBEDDING_MODEL, usage: { total_tokens: 7 } }), { status: 200 });

afterEach(() => vi.unstubAllEnvs());

/* Adam's provider answer, pinned: the specs seed stored vectors under this name, so a renamed model would strand them (spec-constants-pinned). */
describe('EMBEDDING_MODEL', () => {
  it('is text-embedding-3-small', () => {
    expect(EMBEDDING_MODEL).toBe('text-embedding-3-small');
  });
});

describe('requireOpenAiKey', () => {
  it('refuses by name when OPENAI_API_KEY is unset or empty, and returns it when set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => requireOpenAiKey()).toThrow(/OPENAI_API_KEY is not set/);
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(requireOpenAiKey()).toBe('sk-test');
  });
});

describe('embedTexts', () => {
  it('posts the texts to the embeddings endpoint with the model and the bearer key, and returns the vectors in input order', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      /* Answered out of order on purpose: the client must sort by index, not trust the wire's order. */
      return new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], model: EMBEDDING_MODEL, usage: { total_tokens: 4 } }), { status: 200 });
    }) as typeof fetch;
    const vectors = await embedTexts(['first', 'second'], { fetchImpl });
    expect(vectors).toEqual([[1, 0], [0, 1]]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/embeddings');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-test');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ model: 'text-embedding-3-small', input: ['first', 'second'] });
  });

  /*
    Q22's control (12 Nov): the suites have no key by design, so the e2e server points the client at a stub by
    OPENAI_BASE_URL; unset, the endpoint is OpenAI's. Fails against a client whose endpoint is a constant.
  */
  it('posts to OPENAI_BASE_URL’s embeddings path when it is set, and to OpenAI’s when it is not', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_BASE_URL', 'http://localhost:3100/api/e2e-openai');
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return ok([[1]]);
    }) as typeof fetch;
    await embedTexts(['x'], { fetchImpl });
    expect(urls).toEqual(['http://localhost:3100/api/e2e-openai/v1/embeddings']);
    vi.stubEnv('OPENAI_BASE_URL', '');
    await embedTexts(['x'], { fetchImpl });
    expect(urls[1]).toBe('https://api.openai.com/v1/embeddings');
  });

  it('refuses before any request when the key is absent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = vi.fn(async () => ok([[1]])) as unknown as typeof fetch;
    await expect(embedTexts(['x'], { fetchImpl })).rejects.toThrow(/OPENAI_API_KEY is not set/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names the status and the body’s message on a failed answer, and refuses a count that does not match', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const failing = (async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 })) as typeof fetch;
    await expect(embedTexts(['x'], { fetchImpl: failing })).rejects.toThrow(/OpenAI embeddings 401: Incorrect API key provided/);
    const short = (async () => ok([[1, 2]])) as typeof fetch;
    await expect(embedTexts(['x', 'y'], { fetchImpl: short })).rejects.toThrow(/2 texts, 1 vector/);
  });

  it('embeds nothing without a request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await embedTexts([], { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
