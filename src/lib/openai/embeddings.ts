/**
 * **Q22's embedding client: OpenAI's text-embedding-3-small, one provider for the stored vectors and the query (Adam,
 * 11 Nov).** Over fetch, with no package added: the endpoint takes one JSON body and returns one, and the twenty lines
 * are cheaper than a dependency (CLAUDE.md §5). The key is `OPENAI_API_KEY`, read from the environment and never asked
 * for; it has to be set in two places, Adam's own shell for the script that embeds the collection and Vercel's project
 * environment for the query at request time, and an absent key is a refusal that names the variable, never an empty
 * result (the coordinator's three rules on the key). `fetchImpl` is the seam the tests use; nothing here is ever live
 * under test.
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
const ENDPOINT = 'https://api.openai.com/v1/embeddings';

export function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key === '') {
    throw new Error('OPENAI_API_KEY is not set: set it in the shell that runs the embedding script, and in Vercel’s project environment for the query at request time');
  }
  return key;
}

type EmbeddingsAnswer = { data?: Array<{ index: number; embedding: number[] }>; error?: { message?: string } };

/** The vectors for `texts`, in their order, from one request. */
export async function embedTexts(texts: string[], options: { fetchImpl?: typeof fetch } = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = requireOpenAiKey();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  const answer = (await response.json().catch(() => ({}))) as EmbeddingsAnswer;
  if (!response.ok) throw new Error(`OpenAI embeddings ${response.status}: ${answer.error?.message ?? 'no message in the answer'}`);
  const data = answer.data ?? [];
  if (data.length !== texts.length) throw new Error(`OpenAI embeddings answered ${texts.length} texts, ${data.length} vector${data.length === 1 ? '' : 's'}`);
  /* By index, not by the wire's order: the API documents the order but the contract is the index. */
  return [...data].sort((a, b) => a.index - b.index).map((row) => row.embedding);
}
