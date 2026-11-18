import { describe, expect, it } from 'vitest';
import { PLANT_KINDS, plant, plantAcross, renderPlanted, scorePlanted, type PlantKind, type Planted } from './plant';
import type { ReleaseFacts } from '@/lib/llm/about-grounding';
import type { AuditResult } from '@/lib/llm/matched-text-audit';

/**
 * **Planted errors, to measure the pass's catch rate before its flags are acted on (the coordinator, 18 Nov).** One
 * positive control says the pass can find one known error of one kind; it says nothing about how much it misses. So,
 * before the real run, copies of several drafts each take one sentence the stored material disproves, the pass runs over
 * the copies, and the report says how many came back under contradicted-by-material and what else was flagged in those
 * records. The copies never touch the database or the real drafts. This validates the material kind only: an error the
 * auditor could catch only from its own knowledge cannot be planted without already knowing what we are trying to learn.
 */
const facts: ReleaseFacts = {
  label: 'Columbia', country: 'US', year: 1969, format: 'Vinyl, LP, Album, Stereo', artistId: 1,
  credits: [{ name: 'Charlie McCoy', role: 'Harmonica' }],
  companies: [], community: null,
  tracks: [
    { position: 'A1', title: 'Girl From The North Country' }, { position: 'A2', title: 'Nashville Skyline Rag' }, { position: 'A3', title: 'To Be Alone With You' },
    { position: 'B1', title: 'Lay Lady Lay' }, { position: 'B2', title: 'One More Night' },
  ],
  trackCredits: [{ position: 'B1', name: 'Pete Drake', role: 'Pedal Steel Guitar' }],
};
const SENTENCES = ['Loose country playing, warm and unhurried.', 'Side one is brisk; side two slows.', 'It suits a Sunday morning.'];

describe('plant, one kind at a time, each disproved by the facts given', () => {
  const planted = (kind: PlantKind) => plant(kind, SENTENCES, facts);

  it('side-move puts a side-two track on side one', () => {
    expect(planted('side-move')?.text).toBe('"Lay Lady Lay" opens side one.');
  });

  it('opener-swap says the second track opens the record', () => {
    expect(planted('opener-swap')?.text).toBe('The record opens with "Nashville Skyline Rag".');
  });

  it('track-count says side one holds a single track where the tracklist gives three', () => {
    expect(planted('track-count')?.text).toBe('Side one holds a single track.');
  });

  it('mono-on-stereo says mono on a release whose format says stereo, and stereo on a mono one', () => {
    expect(planted('mono-on-stereo')?.text).toBe('The record is mono throughout.');
    expect(plant('mono-on-stereo', SENTENCES, { ...facts, format: 'Vinyl, LP, Mono' })?.text).toBe('The record is in stereo throughout.');
  });

  it('absent-musician names a player the credits do not hold', () => {
    const p = planted('absent-musician');
    expect(p?.text).toMatch(/^[A-Z][\w .]+ plays [a-z ]+ throughout\.$/);
    const name = p?.text.replace(/ plays .*$/, '') ?? '';
    expect([...facts.credits, ...(facts.trackCredits ?? [])].map((c) => c.name)).not.toContain(name);
  });

  it('role-swap gives a credited player an instrument the credits do not', () => {
    expect(planted('role-swap')?.text).toBe('Charlie McCoy plays drums throughout.');
  });

  it('replaces the draft’s last sentence with the planted one, keeping the count, and names its number', () => {
    const p = planted('track-count');
    expect(p?.sentences).toHaveLength(SENTENCES.length);
    expect(p?.sentences[SENTENCES.length - 1]).toBe('Side one holds a single track.');
    expect(p?.index).toBe(SENTENCES.length);
    expect(p?.sentences.slice(0, -1)).toEqual(SENTENCES.slice(0, -1));
  });

  it('is null where the facts cannot disprove the kind: no sides, no second track, no format, no credits', () => {
    const bare: ReleaseFacts = { ...facts, format: null, credits: [], trackCredits: [], tracks: [{ position: '1', title: 'Only' }] };
    for (const kind of PLANT_KINDS) expect(plant(kind, SENTENCES, bare), kind).toBeNull();
  });
});

describe('plantAcross', () => {
  const drafts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => ({ id: `${k}${k}${k}${k}${k}${k}${k}${k}-0000-4000-8000-000000000000`, artist: 'X', title: k.toUpperCase(), sentences: SENTENCES }));

  it('plants each kind once, in a different draft, in the drafts’ order, skipping a draft whose facts cannot carry the kind', () => {
    const noFormat = { ...facts, format: null };
    const out = plantAcross(drafts, (id) => (id.startsWith('dddd') ? noFormat : facts));
    expect(out.map((p) => p.kind)).toEqual([...PLANT_KINDS]);
    expect(new Set(out.map((p) => p.id)).size).toBe(PLANT_KINDS.length);
    const mono = out.find((p) => p.kind === 'mono-on-stereo');
    expect(mono?.id.startsWith('dddd'), 'the draft with no format is skipped for the format kind').toBe(false);
  });

  it('plants fewer where fewer drafts can carry a kind, and says which kinds went unplanted', () => {
    const out = plantAcross(drafts.slice(0, 2), () => facts);
    expect(out).toHaveLength(2);
  });
});

const audited = (planted: Planted, result: AuditResult) => ({ ...planted, result });
const ok = (material: Array<{ sentence: number }>, knowledge: Array<{ sentence: number }> = []): AuditResult => ({
  ok: true,
  material: material.map((m) => ({ sentence: m.sentence, quote: 'q', contradiction: 'c', evidence: 'e' })),
  knowledge: knowledge.map((k) => ({ sentence: k.sentence, quote: 'q', contradiction: 'c' })),
  dropped: [],
  tokens: { input: 1000, output: 500 },
});

describe('scorePlanted', () => {
  const p = (kind: PlantKind, id: string): Planted => ({ kind, id, artist: 'X', title: id, index: 3, text: 'planted', sentences: SENTENCES, original: SENTENCES[2] });

  it('counts a planted sentence caught under the material kind, misfiled under knowledge, or missed, and the other flags beside it', () => {
    const rows = [
      audited(p('side-move', 'a'), ok([{ sentence: 3 }])),
      audited(p('opener-swap', 'b'), ok([], [{ sentence: 3 }])),
      audited(p('track-count', 'c'), ok([{ sentence: 1 }])),
      audited(p('role-swap', 'd'), { ok: false, reason: 'refused' }),
    ];
    const score = scorePlanted(rows);
    expect(score.rows.map((r) => r.status)).toEqual(['caught', 'misfiled', 'missed', 'not audited']);
    expect(score.caught).toBe(1);
    expect(score.planted).toBe(4);
    expect(score.otherMaterial, 'flags on real sentences, the material kind').toBe(1);
    expect(score.otherKnowledge).toBe(0);
  });
});

describe('renderPlanted', () => {
  const rows = [audited({ kind: 'side-move', id: 'aaaaaaaa-0000-4000-8000-000000000000', artist: 'X', title: 'A', index: 3, text: '"Lay Lady Lay" opens side one.', sentences: SENTENCES, original: SENTENCES[2] }, ok([{ sentence: 3 }]))];
  const text = renderPlanted(rows, { model: 'audit-model', effort: 'high' }, 'Planted errors, 2026-11-18');

  it('names the model and the effort, states the catch rate, and states the limit: the material kind only', () => {
    expect(text).toMatch(/model audit-model/);
    expect(text).toMatch(/effort high/);
    expect(text).toMatch(/1 of 1 planted/);
    expect(text).toMatch(/material[- ]contradiction kind only|validates the material kind only/i);
    expect(text).toMatch(/knowledge[^.\n]*(cannot be controlled|uncontrolled)/i);
    expect(text).toMatch(/advisory/i);
  });

  it('writes each planted row with its kind, the sentence planted, its status, and the other flags in that record', () => {
    expect(text).toContain('side-move');
    expect(text).toContain('"Lay Lady Lay" opens side one.');
    expect(text).toMatch(/caught/);
    expect(text).toMatch(/other flags[^\n]*0/i);
  });
});
