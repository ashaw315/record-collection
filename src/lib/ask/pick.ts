import { requireOpenAiKey } from '@/lib/openai/embeddings';

/**
 * **The ask's model pick (§P.2, "the model pick, minimum"; SPEC §4.6; the coordinator, 13 and 14 Nov).** The model is
 * given the phrase and every eligible record's text in one request and chooses: up to five with a one-sentence reason
 * each, fewer when fewer fit; one stand-in flagged that nothing fits, or that a requirement the phrase states is unmet;
 * It never pads. Whether a run has run out is the app's to say from the run's history, never the model's. The app owns the run: the records the run has
 * named are passed as excluded, and the page walks what comes back.
 *
 * Structured output fixes the reply's shape, not its truth, so code checks two things after it: each id is in the pool
 * and not already named, and each claim a reason cites occurs in that record's text. The second is weak and stated as
 * such: a cherry-picked clause passes, so the reader is shown the record's text beside the reason.
 *
 * The provider is one config value. OpenAI's key is in Vercel and the pick runs at request time (the coordinator, 14
 * Nov); the model is `ASK_PICK_MODEL`, by default the middle of OpenAI's general models that supports Structured
 * Outputs, read off OpenAI's models page on 14 Nov: "gpt-6.1-sol", "Near-Astra performance for complex work at a lower
 * cost". Effort is `ASK_PICK_EFFORT`, low by default, since the phone's loop waits on every press.
 */
export type PickRecordText = { id: string; text: string };

/*
  The reason's bound (§P.2, Design, 19 Nov: "set where it is written, not where it is drawn"), two numbers from
  ask-fold-capacity (the coordinator, 19 Nov): with the control above the heading and the count line beneath the slot,
  the first cell holds seven lines of reason wholly in view at 390 × 844 and 1440 × 900 alike, about 188 characters of
  the model's own words, and six lines with one to spare, about 160. Under "one sentence" alone the model wrote 117 to
  210, median 160, every one over the approved 108 (which were 3a's stubs, not the model's). The target is the
  mechanism, moving the whole distribution; the maximum is the backstop. Both provisional, the figures Design's to judge.
*/
export const REASON_TARGET = 160;
export const REASON_MAX = 188;
export type PickVerdict = 'answer' | 'nothing-fits' | 'requirement-unmet';
export type Picked = { id: string; reason: string; claims: string[] };
export type PickResult =
  | { ok: true; verdict: PickVerdict; picks: Picked[]; dropped: Array<{ id: string; why: string }> }
  | { ok: false; reason: string };

export const PICK_MODEL_DEFAULT = 'gpt-6.1-sol';
/* The two settings, read from the environment by these names: the model and the reasoning effort. */
const MODEL_VAR = 'ASK_PICK_MODEL';
const EFFORT_VAR = 'ASK_PICK_EFFORT';
const MAX = 5;

/** The reply's shape, strict: every field required, no other field, as the structured-outputs guide's examples hold. */
export const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'picks'],
  properties: {
    verdict: { type: 'string', enum: ['answer', 'nothing-fits', 'requirement-unmet'] },
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reason', 'claims'],
        properties: {
          id: { type: 'string' },
          /* The backstop (§P.2, 19 Nov): nothing over the layout's capacity is ever drawn; the prompt's target is the mechanism. */
          reason: { type: 'string', maxLength: REASON_MAX },
          claims: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  'You choose records from one person’s collection to answer what they want to play. Each record is described by its own text; judge only by that text.',
  'Return up to five records that fit the phrase, best first. Fewer is correct when fewer fit: return one, two or three if that is how many fit. Never pad the answer with records that do not fit.',
  'If nothing fits, set verdict "nothing-fits" and return at most one record as a stand-in to play in the meantime, its reason saying what it is not.',
  'If the phrase states a requirement (for example no vocals) that no fitting record meets, set verdict "requirement-unmet" and return the closest in feel as one stand-in, its reason naming the requirement and what the record has instead.',
  'Never return a record listed as already named.',
  `Each reason is one sentence of about ${REASON_TARGET} characters, never more than ${REASON_MAX}, in the reader’s terms of sound and occasion, saying why this record answers the phrase. Do not quote the record’s text in the reason. The reason speaks about the record, never about the text, the description, the material, the credits, or what you were given: say what the record is, not what the text offers or fails to show. Carry any relevant caveat from the text into the reason rather than dropping it: a record that is slow with abrasive peaks is not simply gentle.`,
  'For each record, list in "claims" the whole sentences, copied exactly from that record’s text, that the reason rests on: at least one, and never part of a sentence.',
].join('\n');

/** The Responses API body: the phrase, every eligible record's text by id, the run's named records, the strict schema. */
export function pickRequest(phrase: string, pool: readonly PickRecordText[], named: readonly string[], config: { model: string; effort: string }) {
  const records = pool.map((r) => `[${r.id}] ${r.text}`).join('\n');
  const user = `What they want to play: ${phrase}\n\nAlready named in this run: ${named.length === 0 ? 'none' : named.join(', ')}\n\nThe records:\n${records}`;
  return {
    model: config.model,
    reasoning: { effort: config.effort },
    input: [
      { role: 'system' as const, content: SYSTEM },
      { role: 'user' as const, content: user },
    ],
    text: { format: { type: 'json_schema' as const, name: 'pick', strict: true, schema: PICK_SCHEMA } },
  };
}

/*
  §P.2 (Design, 19 Nov, "Slot for unmet and dropped reason"): "A reason over the bound is asked for again, never cut,
  because a cut reason can lose the clause that names the mismatch. A reason still over the bound when asked again leaves
  its record out of the answer." The second request carries the over-bound records alone, with their texts, and says it
  is asking again; the records whose reasons come back within the bound keep their places, the rest are left out with
  the reason named. The API's strict maximum should never let a reason over REASON_MAX through, so this path is the
  backstop's backstop, exercised by stubs (pick.test). Where it leaves an answer with nothing, the pick refuses as it
  always has and the slot says "Not answered."; the slot that says no answer came waits on Design's rewording (Q77 B2).
*/
export function reaskRequest(phrase: string, records: readonly PickRecordText[], config: { model: string; effort: string }) {
  const request = pickRequest(phrase, records, [], config);
  const user = request.input.find((m) => m.role === 'user');
  if (user !== undefined) user.content = `Asked again: each record below was chosen for this phrase, and the reason given ran past ${REASON_MAX} characters or spoke about the text rather than the record. Give each its one-sentence reason again, about ${REASON_TARGET} characters and never more than ${REASON_MAX}, about the record, never about the text, with its claims as before, and leave none out.\n\n${user.content}`;
  return request;
}

/** Characters as the schema's maxLength counts them: code points, not UTF-16 units. */
const reasonLength = (reason: string) => [...reason].length;

/*
  A reason that describes what the model was given rather than the record (Adam's press, 21 Nov: "the text offers period
  atmosphere, not evidence of a recent recording"; the coordinator: a class, and run-to-run, not length). The prompt rule
  above forbids it; this is the mechanical check beside it, whole words only. Six phrases, not the seven he first named:
  "the material" went, because across the 680 stored sentences it meant the repertoire four times out of four and never
  the source, and both genuine self-references said "the credits" (the coordinator, 21 Nov). Returns the phrase, so the
  drop can name it, or null.
*/
const MATERIAL_PHRASES = ['the text', 'the description', 'this material', 'the credits', 'the information', 'evidence'] as const;
const MATERIAL_PATTERN = new RegExp(`\\b(${MATERIAL_PHRASES.join('|')})\\b`, 'i');
export function mentionsMaterial(reason: string): string | null {
  const hit = MATERIAL_PATTERN.exec(reason);
  return hit === null ? null : hit[1].toLowerCase();
}
/** Why a reason is asked for again, or null when it stands: over the bound, or about the text (§P.2's path for both). */
function reasonFault(reason: string): string | null {
  if (reasonLength(reason) > REASON_MAX) return `was over the bound of ${REASON_MAX}`;
  const phrase = mentionsMaterial(reason);
  return phrase === null ? null : `spoke about its text ("${phrase}")`;
}

const loose = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/*
  A claim is a whole stored sentence (the coordinator, 14 Nov): a fragment can support the opposite of what its record
  says ("Not slow; aggressive throughout" holds "slow"), and a whole sentence carries its own qualification. A sentence
  ends at . ! or ? before a space or the text's end, as the record's text is written.
*/
export const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s !== '');

type Envelope = { status?: string; incomplete_details?: { reason?: string } | null; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }> };

/** The reply read and checked: what it holds, never more, and what was dropped and why. */
export function readPick(reply: unknown, pool: readonly PickRecordText[], named: readonly string[]): PickResult {
  const env = (reply ?? {}) as Envelope;
  if (env.status === 'incomplete') return { ok: false, reason: `the reply was cut off: ${env.incomplete_details?.reason ?? 'no reason given'}` };
  const content = env.output?.find((o) => o.type === 'message')?.content?.[0];
  if (content?.type === 'refusal') return { ok: false, reason: `the model refused: ${content.refusal ?? ''}` };
  let body: { verdict?: unknown; picks?: unknown };
  try {
    body = JSON.parse(content?.text ?? '') as typeof body;
  } catch {
    return { ok: false, reason: 'the reply was not the pick’s JSON' };
  }
  const verdicts: PickVerdict[] = ['answer', 'nothing-fits', 'requirement-unmet'];
  if (!verdicts.includes(body.verdict as PickVerdict) || !Array.isArray(body.picks)) return { ok: false, reason: 'the reply was not the pick’s JSON' };
  const verdict = body.verdict as PickVerdict;
  const sentences = new Map(pool.map((r) => [r.id, new Set(sentencesOf(r.text).map(loose))]));
  const excluded = new Set(named);
  const picks: Picked[] = [];
  const dropped: Array<{ id: string; why: string }> = [];
  /* How many the verdict allows: one stand-in, or up to five in an answer. */
  const allowed = verdict === 'answer' ? MAX : 1;
  for (const raw of body.picks as Picked[]) {
    const id = String(raw.id);
    const own = sentences.get(id);
    if (own === undefined) { dropped.push({ id, why: 'not in the pool' }); continue; }
    if (excluded.has(id)) { dropped.push({ id, why: 'already named in this run' }); continue; }
    if (picks.some((p) => p.id === id)) { dropped.push({ id, why: 'named twice' }); continue; }
    const claims = (raw.claims ?? []).map(String).filter((c) => c.trim() !== '');
    if (claims.length === 0) { dropped.push({ id, why: 'cites no stored sentence' }); continue; }
    const missing = claims.find((c) => !own.has(loose(c)));
    if (missing !== undefined) { dropped.push({ id, why: `cites "${missing}", which is not a whole sentence of its text` }); continue; }
    if (picks.length >= allowed) { dropped.push({ id, why: verdict === 'answer' ? 'past five' : 'a stand-in is one record' }); continue; }
    picks.push({ id, reason: String(raw.reason), claims });
  }
  if (verdict === 'answer' && picks.length === 0) return { ok: false, reason: 'no pick survived the checks' };
  return { ok: true, verdict, picks, dropped };
}

function endpoint(): string {
  const base = process.env.OPENAI_BASE_URL;
  return `${base === undefined || base === '' ? 'https://api.openai.com' : base.replace(/\/$/, '')}/v1/responses`;
}

/** One request, the reply read and checked; a second for any reason over the bound. A missing key refuses by name before any request. */
export async function askPick(phrase: string, pool: readonly PickRecordText[], named: readonly string[], options: { fetchImpl?: typeof fetch; effort?: string } = {}): Promise<PickResult> {
  const key = requireOpenAiKey();
  /* A call may name its effort over the setting: the diagnostic asks one phrase at two (the coordinator, 15 Nov). */
  const config = { model: process.env[MODEL_VAR] || PICK_MODEL_DEFAULT, effort: options.effort ?? (process.env[EFFORT_VAR] || 'low') };
  const post = async (body: unknown): Promise<{ ok: true; answer: unknown } | { ok: false; reason: string }> => {
    const response = await (options.fetchImpl ?? fetch)(endpoint(), {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, reason: `OpenAI responses ${response.status}: ${(answer as { error?: { message?: string } } | null)?.error?.message ?? 'no message in the answer'}` };
    return { ok: true, answer };
  };
  const sent = await post(pickRequest(phrase, pool, named, config));
  if (!sent.ok) return sent;
  const first = readPick(sent.answer, pool, named);
  if (!first.ok) return first;
  const over = first.picks.filter((p) => reasonFault(p.reason) !== null);
  if (over.length === 0) return first;
  /* Asked again, once, for those records alone (§P.2); what comes back without a fault replaces, the rest is left out. */
  const records = pool.filter((r) => over.some((p) => p.id === r.id));
  const again = await post(reaskRequest(phrase, records, config));
  const reread = again.ok ? readPick(again.answer, records, []) : again;
  const within = new Map(reread.ok ? reread.picks.filter((p) => reasonFault(p.reason) === null).map((p) => [p.id, p] as const) : []);
  const picks: Picked[] = [];
  const dropped = [...first.dropped];
  for (const p of first.picks) {
    if (reasonFault(p.reason) === null) { picks.push(p); continue; }
    const re = within.get(p.id);
    if (re !== undefined) { picks.push({ ...p, reason: re.reason, claims: re.claims }); continue; }
    /* The fault named is the second answer's where there was one, since that is the reason left out. */
    const second = reread.ok ? reread.picks.find((q) => q.id === p.id) : undefined;
    const fault = second === undefined ? reasonFault(p.reason) : reasonFault(second.reason);
    dropped.push({ id: p.id, why: `its reason ${fault} when asked again${reread.ok ? '' : ` (${reread.reason})`}` });
  }
  if (first.verdict === 'answer' && picks.length === 0) return { ok: false, reason: `every reason was over the bound of ${REASON_MAX} or spoke about the text when asked again` };
  return { ok: true, verdict: first.verdict, picks, dropped };
}
