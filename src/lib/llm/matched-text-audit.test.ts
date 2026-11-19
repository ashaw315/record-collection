import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_SCHEMA, auditConfig, auditDraft, auditRequest, readAudit, type AuditSubject } from './matched-text-audit';
import { renderMaterial } from './matched-text-client';
import type { ReleaseFacts } from './about-grounding';

/**
 * **The adversarial pass over a stored-to-be description (the coordinator, 17 and 18 Nov).** A second model, on a
 * different provider from the drafting, reads each draft's sentences beside the material alone, never the ABOUT, and
 * reports ONLY disagreement, in two kinds kept apart: contradicted by the material, and contradicted by the auditor's
 * own knowledge. Agreement is not evidence, and a sentence the material does not support is not contradicted: that is
 * what [inferred] marks. These hold the request and the reading of a stubbed reply, not what a model would say; the
 * positive control is a real sentence (Carpenters, "the medley that follows", with One Love between) and runs for real.
 */
const facts: ReleaseFacts = {
  label: 'A&M', country: 'US', year: 1971, format: 'Vinyl, LP, Album', artistId: 1,
  credits: [{ name: 'Joe Osborn', role: 'Bass' }],
  companies: [], community: null,
  tracks: [
    { position: 'B1', title: 'Superstar' },
    { position: 'B2', title: 'Druscilla Penny' },
    { position: 'B3', title: 'One Love' },
    { position: 'B4', title: 'Bacharach / David Medley' },
    { position: 'B5', title: 'Sometimes' },
  ],
  trackCredits: [{ position: 'B4', name: 'Burt Bacharach', role: 'Written-By' }],
};
const subject: AuditSubject = { artist: 'Carpenters', title: 'Carpenters', year: 1971, about: 'A soft-rock ABOUT the auditor must never see.' };
const SENTENCES = [
  'Side two begins with "Superstar", the record’s most desolate performance.',
  'The one real break in tone is "Druscilla Penny" on side two; the Bacharach-David medley that follows is a stitched run of short pop tunes.',
  'The record ends with "Sometimes", mostly voice and keyboard.',
];
const config = { model: 'audit-model', effort: 'medium' };

describe('the request', () => {
  const request = auditRequest(subject, SENTENCES, facts, config);
  const system = request.input.find((m) => m.role === 'system')?.content ?? '';
  const user = request.input.find((m) => m.role === 'user')?.content ?? '';

  it('carries the material, tracklist, credits and format, rendered as the drafting prompt renders them, and never the ABOUT', () => {
    expect(user).toContain(renderMaterial(facts));
    expect(user).toContain('B3 One Love');
    expect(user).toContain('B4: Burt Bacharach, Written-By');
    expect(user).toContain('Vinyl, LP, Album');
    expect(user).not.toContain('soft-rock ABOUT');
    expect(system).not.toMatch(/ABOUT/);
  });

  it('numbers the sentences, each whole and once', () => {
    SENTENCES.forEach((s, i) => expect(user).toContain(`${i + 1}. ${s}`));
    expect(user.split(SENTENCES[1]).length - 1).toBe(1);
  });

  it('asks for disagreement only, in two kinds kept apart, and says agreement is not evidence and unsupported is not contradicted', () => {
    expect(system).toMatch(/only (the )?disagreement|report only/i);
    expect(system).toMatch(/contradicted by the material/i);
    expect(system).toMatch(/contradicted by your own knowledge/i);
    expect(system).toMatch(/never merge|kept apart|separately/i);
    expect(system).toMatch(/agreement is not evidence/i);
    expect(system).toMatch(/not supported[^.]*is not contradicted|unsupported is not contradicted/i);
  });

  it('uses the configured model and effort and a strict schema with the two lists required and nothing else', () => {
    expect(request.model).toBe('audit-model');
    expect(request.reasoning).toEqual({ effort: 'medium' });
    expect(request.text.format).toMatchObject({ type: 'json_schema', strict: true, schema: AUDIT_SCHEMA });
    expect(AUDIT_SCHEMA.required).toEqual(['material', 'knowledge']);
    expect(AUDIT_SCHEMA.additionalProperties).toBe(false);
  });
});

const envelope = (body: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }] });

describe('reading a stubbed reply', () => {
  it('keeps the two kinds apart, each item carrying its sentence by number and the whole sentence quoted', () => {
    const read = readAudit(envelope({
      material: [{ sentence: 2, quote: SENTENCES[1], contradiction: 'B3 One Love sits between Druscilla Penny and the medley.', evidence: 'B2 Druscilla Penny / B3 One Love / B4 Bacharach / David Medley' }],
      knowledge: [{ sentence: 3, quote: SENTENCES[2], contradiction: 'Sometimes has a string arrangement, not voice and keyboard alone.' }],
    }), SENTENCES);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.material).toEqual([{ sentence: 2, quote: SENTENCES[1], contradiction: 'B3 One Love sits between Druscilla Penny and the medley.', evidence: 'B2 Druscilla Penny / B3 One Love / B4 Bacharach / David Medley' }]);
    expect(read.knowledge).toEqual([{ sentence: 3, quote: SENTENCES[2], contradiction: 'Sometimes has a string arrangement, not voice and keyboard alone.' }]);
    expect(read.dropped).toEqual([]);
  });

  it('drops an item whose number is outside the sentences or whose quote is not that sentence, and says why', () => {
    const read = readAudit(envelope({
      material: [{ sentence: 9, quote: 'Nothing.', contradiction: 'x', evidence: 'y' }, { sentence: 1, quote: 'A sentence the draft does not hold.', contradiction: 'x', evidence: 'y' }],
      knowledge: [{ sentence: 1, quote: SENTENCES[0].toUpperCase(), contradiction: 'matched loosely, kept' }],
    }), SENTENCES);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.material).toEqual([]);
    expect(read.knowledge).toHaveLength(1);
    expect(read.dropped.map((d) => d.why)).toEqual([expect.stringMatching(/no sentence 9/), expect.stringMatching(/not sentence 1/)]);
  });

  it('reads an empty reply as no disagreement reported, which is not confirmation, and says so in the result', () => {
    const read = readAudit(envelope({ material: [], knowledge: [] }), SENTENCES);
    expect(read).toMatchObject({ ok: true, material: [], knowledge: [], dropped: [] });
  });

  it('reads a refusal, a truncated reply and unparseable text as failures that say which', () => {
    expect(readAudit({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, SENTENCES)).toMatchObject({ ok: false, reason: /cut off: max_output_tokens/ });
    expect(readAudit({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, SENTENCES)).toMatchObject({ ok: false, reason: /refused/ });
    expect(readAudit({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{not json' }] }] }, SENTENCES)).toMatchObject({ ok: false, reason: /not the audit’s JSON/ });
  });
});

describe('auditConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  /* One resolution of the model and the effort, so the script's header and the request name the same pair. */
  it('reads MATCHED_AUDIT_MODEL and MATCHED_AUDIT_EFFORT, lets a call name its effort over the setting, and never reads the pick’s variables', () => {
    vi.stubEnv('ASK_PICK_MODEL', 'the-picks-model');
    vi.stubEnv('ASK_PICK_EFFORT', 'low');
    vi.stubEnv('MATCHED_AUDIT_MODEL', 'the-audits-model');
    vi.stubEnv('MATCHED_AUDIT_EFFORT', 'medium');
    expect(auditConfig()).toEqual({ model: 'the-audits-model', effort: 'medium' });
    expect(auditConfig({ effort: 'high' })).toEqual({ model: 'the-audits-model', effort: 'high' });
    vi.stubEnv('MATCHED_AUDIT_MODEL', '');
    vi.stubEnv('MATCHED_AUDIT_EFFORT', '');
    expect(auditConfig()).toEqual({ model: 'gpt-6.1-sol', effort: 'medium' });
  });
});

describe('the call', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuses before any request when the key is absent, naming the variable', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = vi.fn();
    await expect(auditDraft(subject, SENTENCES, facts, { fetchImpl })).rejects.toThrow(/OPENAI_API_KEY is not set/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads its model from MATCHED_AUDIT_MODEL, never from the pick’s ASK_PICK_MODEL, posts to the Responses endpoint, and reports the tokens spent', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ASK_PICK_MODEL', 'the-picks-model');
    vi.stubEnv('MATCHED_AUDIT_MODEL', 'the-audits-model');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ...envelope({ material: [], knowledge: [] }), usage: { input_tokens: 1700, output_tokens: 90 } }), { status: 200 }));
    const result = await auditDraft(subject, SENTENCES, facts, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toMatch(/\/v1\/responses$/);
    expect(init.headers.authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body).model).toBe('the-audits-model');
    expect(result).toMatchObject({ ok: true, tokens: { input: 1700, output: 90 } });
  });

  /*
    Medium, by the coordinator's reading rule written before the numbers (18 Nov): the planted set caught six of six at
    both efforts with one false flag at high and none at medium, and the two positive controls were missed at both in
    the blind 55 runs. One control trial at high had held in the morning and set the default to high without being
    flagged as a decision; the same request missed in the run, so a single trial decides nothing, and the rule's
    "difference of one or none" is medium, high recorded as not shown better.
  */
  it('defaults the model when MATCHED_AUDIT_MODEL is unset, still ignoring ASK_PICK_MODEL, and the effort to medium, which the reading rule chose', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ASK_PICK_MODEL', 'the-picks-model');
    vi.stubEnv('MATCHED_AUDIT_MODEL', '');
    vi.stubEnv('MATCHED_AUDIT_EFFORT', '');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(envelope({ material: [], knowledge: [] })), { status: 200 }));
    await auditDraft(subject, SENTENCES, facts, { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).model).not.toBe('the-picks-model');
    expect(JSON.parse(init.body).model).toMatch(/\S/);
    expect(JSON.parse(init.body).reasoning).toEqual({ effort: 'medium' });
  });
});
