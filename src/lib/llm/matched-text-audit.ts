import { requireOpenAiKey } from '@/lib/openai/embeddings';
import type { ReleaseFacts } from './about-grounding';
import { renderMaterial } from './matched-text-client';

/**
 * **The adversarial pass (the coordinator, 17 and 18 Nov): a second model reads each draft against the material and
 * reports only disagreement.** It runs on a different provider from the drafting (OpenAI's Responses endpoint, where
 * the drafting is Anthropic's), with its own model variable, never the pick's, and it is given the tracklist, the
 * credits and the format alone, never the ABOUT, which is itself model-written.
 *
 * Two kinds of disagreement, kept apart in the schema, the reading and the report, never merged: contradicted by the
 * material, which Code then verifies against the tracklist and credits, and contradicted by the auditor's own
 * knowledge, which goes to the coordinator with its caveat attached. "Unsupported" is not a kind: a sentence the
 * material does not support is what [inferred] marks, not a contradiction. Agreement is not evidence: a sentence the
 * auditor does not list is not thereby confirmed, and the report says so at its head. Neither kind goes to Adam as a
 * worklist; he is not the verifier.
 *
 * Code checks after the structured reply what the schema cannot: each item names a sentence that exists and quotes it.
 */
export type AuditSubject = { artist: string; title: string; year: number | null; about: string | null };
export type MaterialItem = { sentence: number; quote: string; contradiction: string; evidence: string };
export type KnowledgeItem = { sentence: number; quote: string; contradiction: string };
export type AuditTokens = { input: number | null; output: number | null };
export type AuditResult =
  | { ok: true; material: MaterialItem[]; knowledge: KnowledgeItem[]; dropped: Array<{ sentence: number; why: string }>; tokens: AuditTokens }
  | { ok: false; reason: string };

/* Its own settings, by these names, so the audit's model is never the pick's: a check on a model by the same model is weaker. */
const MODEL_VAR = 'MATCHED_AUDIT_MODEL';
const EFFORT_VAR = 'MATCHED_AUDIT_EFFORT';
/* The same default as the pick's, chosen on 14 Nov from OpenAI's models page; a different model from the drafter's, which is what the pass needs. */
export const AUDIT_MODEL_DEFAULT = 'gpt-6.1-sol';
/*
  High, decided by the positive control (18 Nov): at medium the auditor reported no disagreement on Carpenters, whose
  medley sentence the stored tracklist proves wrong; at high it came back under the material kind with the positions as
  evidence. The pass runs once per record, offline, where a missed contradiction costs more than the seconds.
*/
const EFFORT_DEFAULT = 'high';

/** The reply's shape, strict: the two lists required and nothing else, each item's fields required. */
export const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['material', 'knowledge'],
  properties: {
    material: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sentence', 'quote', 'contradiction', 'evidence'],
        properties: {
          sentence: { type: 'integer' },
          quote: { type: 'string' },
          contradiction: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    knowledge: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sentence', 'quote', 'contradiction'],
        properties: {
          sentence: { type: 'integer' },
          quote: { type: 'string' },
          contradiction: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  'You are checking a short description of how a record sounds against the record’s own material: its tracklist by position, its credits and its format. Report only disagreement. Agreement is not evidence, and you are not asked for it: a sentence you do not list is not thereby confirmed.',
  'There are two kinds of disagreement, and they are reported separately and never merged.',
  '"material": a sentence contradicted by the material below. The tracklist, the credits or the format say otherwise: a track placed on the wrong side, an order the positions contradict, a performer the credits give to someone else, a format the listing does not show. Quote the sentence whole in "quote", say in "contradiction" what is wrong, and copy into "evidence" the lines of the material that prove it.',
  '"knowledge": a sentence contradicted by your own knowledge of this record, where the material neither confirms nor denies it. Quote the sentence whole, and say in "contradiction" what you know instead. These are weaker, will be read with that caveat, and are kept apart from the first kind for that reason.',
  'A sentence that is not supported by the material is not contradicted by it: unsupported is not contradicted, and is not reported here. A sentence the material does not reach belongs to the second kind only if you know it to be false.',
  'Number each item by the sentence’s number in the description, and quote that sentence exactly and whole. Return empty lists where you disagree with nothing.',
].join('\n');

/** The Responses API body: the description by numbered sentence, the material, the strict schema. The ABOUT is not sent. */
export function auditRequest(subject: AuditSubject, sentences: readonly string[], facts: ReleaseFacts | null, config: { model: string; effort: string }) {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const user = `The record: ${subject.artist}, "${subject.title}"${subject.year === null ? '' : ` (${subject.year})`}.\n\nThe description, by sentence:\n${numbered}\n\nThe material:\n${renderMaterial(facts)}`;
  return {
    model: config.model,
    reasoning: { effort: config.effort },
    input: [
      { role: 'system' as const, content: SYSTEM },
      { role: 'user' as const, content: user },
    ],
    text: { format: { type: 'json_schema' as const, name: 'audit', strict: true, schema: AUDIT_SCHEMA } },
  };
}

const loose = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

type Envelope = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** The reply read and checked: each item names a sentence that exists and quotes it; anything else is dropped and said. */
export function readAudit(reply: unknown, sentences: readonly string[]): AuditResult {
  const env = (reply ?? {}) as Envelope;
  if (env.status === 'incomplete') return { ok: false, reason: `the reply was cut off: ${env.incomplete_details?.reason ?? 'no reason given'}` };
  const content = env.output?.find((o) => o.type === 'message')?.content?.[0];
  if (content?.type === 'refusal') return { ok: false, reason: `the model refused: ${content.refusal ?? ''}` };
  let body: { material?: unknown; knowledge?: unknown };
  try {
    body = JSON.parse(content?.text ?? '') as typeof body;
  } catch {
    return { ok: false, reason: 'the reply was not the audit’s JSON' };
  }
  if (!Array.isArray(body.material) || !Array.isArray(body.knowledge)) return { ok: false, reason: 'the reply was not the audit’s JSON' };
  const dropped: Array<{ sentence: number; why: string }> = [];
  const keep = <T extends { sentence: unknown; quote: unknown }>(items: T[]): T[] =>
    items.filter((item) => {
      const n = Number(item.sentence);
      const own = Number.isInteger(n) && n >= 1 && n <= sentences.length ? sentences[n - 1] : undefined;
      if (own === undefined) { dropped.push({ sentence: n, why: `no sentence ${n}` }); return false; }
      if (loose(String(item.quote)) !== loose(own)) { dropped.push({ sentence: n, why: `the quote is not sentence ${n}` }); return false; }
      return true;
    });
  const material = keep(body.material as MaterialItem[]).map((m) => ({ sentence: Number(m.sentence), quote: String(m.quote), contradiction: String(m.contradiction), evidence: String(m.evidence) }));
  const knowledge = keep(body.knowledge as KnowledgeItem[]).map((k) => ({ sentence: Number(k.sentence), quote: String(k.quote), contradiction: String(k.contradiction) }));
  return { ok: true, material, knowledge, dropped, tokens: { input: env.usage?.input_tokens ?? null, output: env.usage?.output_tokens ?? null } };
}

function endpoint(): string {
  const base = process.env.OPENAI_BASE_URL;
  return `${base === undefined || base === '' ? 'https://api.openai.com' : base.replace(/\/$/, '')}/v1/responses`;
}

/** One request per draft, the reply read and checked. A missing key refuses by name before any request. */
export async function auditDraft(subject: AuditSubject, sentences: readonly string[], facts: ReleaseFacts | null, options: { fetchImpl?: typeof fetch; effort?: string } = {}): Promise<AuditResult> {
  const key = requireOpenAiKey();
  const config = { model: process.env[MODEL_VAR] || AUDIT_MODEL_DEFAULT, effort: options.effort ?? (process.env[EFFORT_VAR] || EFFORT_DEFAULT) };
  const response = await (options.fetchImpl ?? fetch)(endpoint(), {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(auditRequest(subject, sentences, facts, config)),
  });
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, reason: `OpenAI responses ${response.status}: ${(answer as { error?: { message?: string } } | null)?.error?.message ?? 'no message in the answer'}` };
  return readAudit(answer, sentences);
}
