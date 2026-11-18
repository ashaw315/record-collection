import type { ReleaseFacts } from '@/lib/llm/about-grounding';
import type { AuditResult } from '@/lib/llm/matched-text-audit';

/**
 * **Planted errors, to measure the pass's catch rate before its flags are acted on (the coordinator, 18 Nov).** One
 * positive control shows the pass can find one known error of one kind and says nothing about how much it misses. So
 * copies of several drafts each take one sentence the stored material disproves, the pass runs over the copies, and the
 * report states how many came back under contradicted-by-material and what else was flagged in those records. Copies
 * only: nothing here reads or writes the database or the real drafts.
 *
 * This validates the material-contradiction kind only. The knowledge kind cannot be controlled this way: planting an
 * error the auditor could catch only from its own knowledge means already knowing the truth the pass is meant to find.
 * That half stays uncontrolled and its flags stay advisory.
 */
export const PLANT_KINDS = ['side-move', 'opener-swap', 'track-count', 'mono-on-stereo', 'absent-musician', 'role-swap'] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];

export type Planted = {
  kind: PlantKind;
  id: string;
  artist: string;
  title: string;
  /** The planted sentence's number in the copy, 1-based: the draft's last sentence, replaced. */
  index: number;
  text: string;
  sentences: string[];
  original: string;
};

/* Names a credits list is unlikely to hold; the first absent one is used, checked against the credits, never assumed. */
const ABSENT = ['Herbie Flowers', 'Carol Kaye', 'Bernard Purdie', 'Tony Levin', 'Jim Keltner'];
const sideOf = (position: string) => /^[A-Za-z]/.exec(position)?.[0]?.toUpperCase() ?? null;
const names = (facts: ReleaseFacts) => [...facts.credits, ...(facts.trackCredits ?? [])];

/** The planted sentence for one kind, or null where these facts cannot disprove it. */
function sentenceFor(kind: PlantKind, facts: ReleaseFacts): string | null {
  const tracks = facts.tracks;
  const sideA = tracks.filter((t) => sideOf(t.position) === 'A');
  const sideB = tracks.filter((t) => sideOf(t.position) === 'B');
  switch (kind) {
    case 'side-move':
      return sideA.length > 0 && sideB.length > 0 ? `"${sideB[0].title}" opens side one.` : null;
    case 'opener-swap':
      return tracks.length >= 2 && tracks[1].title !== tracks[0].title ? `The record opens with "${tracks[1].title}".` : null;
    case 'track-count':
      return sideA.length >= 2 ? 'Side one holds a single track.' : null;
    case 'mono-on-stereo': {
      const format = facts.format ?? '';
      if (/\bstereo\b/i.test(format) && !/\bmono\b/i.test(format)) return 'The record is mono throughout.';
      if (/\bmono\b/i.test(format) && !/\bstereo\b/i.test(format)) return 'The record is in stereo throughout.';
      return null;
    }
    case 'absent-musician': {
      if (names(facts).length === 0) return null;
      const held = new Set(names(facts).map((c) => c.name.toLowerCase()));
      const name = ABSENT.find((n) => !held.has(n.toLowerCase()));
      return name === undefined ? null : `${name} plays bass throughout.`;
    }
    case 'role-swap': {
      const credit = names(facts).find((c) => /guitar|bass|drums|piano|organ|harmonica|saxophone|trumpet|vocals|violin|keyboards/i.test(c.role));
      if (credit === undefined) return null;
      const other = /drums/i.test(credit.role) ? 'bass' : 'drums';
      return `${credit.name} plays ${other} throughout.`;
    }
  }
}

/** A copy of the draft with its last sentence replaced by the planted one, or null where the facts cannot carry the kind. */
export function plant(kind: PlantKind, sentences: readonly string[], facts: ReleaseFacts | null): Omit<Planted, 'id' | 'artist' | 'title' | 'kind'> & { kind: PlantKind } | null {
  if (facts === null || sentences.length === 0) return null;
  const text = sentenceFor(kind, facts);
  if (text === null) return null;
  const copy = [...sentences.slice(0, -1), text];
  return { kind, index: sentences.length, text, sentences: copy, original: sentences[sentences.length - 1] };
}

/** Each kind planted once, in a different draft, in the drafts' order, skipping a draft whose facts cannot carry it. */
export function plantAcross(drafts: ReadonlyArray<{ id: string; artist: string; title: string; sentences: readonly string[] }>, factsOf: (id: string) => ReleaseFacts | null): Planted[] {
  const used = new Set<string>();
  const out: Planted[] = [];
  for (const kind of PLANT_KINDS) {
    for (const d of drafts) {
      if (used.has(d.id)) continue;
      const p = plant(kind, d.sentences, factsOf(d.id));
      if (p === null) continue;
      used.add(d.id);
      out.push({ ...p, id: d.id, artist: d.artist, title: d.title });
      break;
    }
  }
  return out;
}

export type PlantedRow = Planted & { result: AuditResult };
export type PlantStatus = 'caught' | 'misfiled' | 'missed' | 'not audited';
export type PlantScore = {
  rows: Array<PlantedRow & { status: PlantStatus; otherMaterial: number; otherKnowledge: number }>;
  planted: number;
  caught: number;
  misfiled: number;
  missed: number;
  notAudited: number;
  otherMaterial: number;
  otherKnowledge: number;
};

/** Caught is the planted sentence under the material kind; under knowledge it is misfiled; other flags are on the real sentences beside it. */
export function scorePlanted(rows: readonly PlantedRow[]): PlantScore {
  const scored = rows.map((r) => {
    if (!r.result.ok) return { ...r, status: 'not audited' as const, otherMaterial: 0, otherKnowledge: 0 };
    const inMaterial = r.result.material.some((m) => m.sentence === r.index);
    const inKnowledge = r.result.knowledge.some((k) => k.sentence === r.index);
    const status: PlantStatus = inMaterial ? 'caught' : inKnowledge ? 'misfiled' : 'missed';
    return {
      ...r,
      status,
      otherMaterial: r.result.material.filter((m) => m.sentence !== r.index).length,
      otherKnowledge: r.result.knowledge.filter((k) => k.sentence !== r.index).length,
    };
  });
  const count = (s: PlantStatus) => scored.filter((r) => r.status === s).length;
  return {
    rows: scored,
    planted: rows.length,
    caught: count('caught'),
    misfiled: count('misfiled'),
    missed: count('missed'),
    notAudited: count('not audited'),
    otherMaterial: scored.reduce((n, r) => n + r.otherMaterial, 0),
    otherKnowledge: scored.reduce((n, r) => n + r.otherKnowledge, 0),
  };
}

export function renderPlanted(rows: readonly PlantedRow[], config: { model: string; effort: string }, title: string): string {
  const score = scorePlanted(rows);
  const lines = [
    `# ${title}`,
    '',
    `Run at model ${config.model}, effort ${config.effort}.`,
    '',
    `**${score.caught} of ${score.planted} planted errors came back under contradicted-by-material**; ${score.misfiled} misfiled under the auditor’s own knowledge, ${score.missed} missed, ${score.notAudited} not audited. Beside the planted sentences the auditor flagged ${score.otherMaterial} real sentence(s) as contradicted by the material and ${score.otherKnowledge} as contradicted by its own knowledge.`,
    '',
    '**The limit, stated plainly: this validates the material-contradiction kind only.** Each copy carries one sentence the stored tracklist, credits or format disproves, so a catch is the auditor reading the material. The knowledge-contradiction kind cannot be controlled this way, since planting an error the auditor could catch only from its own knowledge means already knowing the truth the pass is meant to find; that half stays uncontrolled and its flags stay advisory. Copies only: the database and the real drafts were not touched.',
    '',
    '| kind | record | planted sentence (its number) | status | other flags in the record: material, knowledge |',
    '|---|---|---|---|---|',
    ...score.rows.map((r) => `| ${r.kind} | ${r.id.slice(0, 8)} ${r.artist} — ${r.title} | ${r.text} (${r.index}) | ${r.status} | ${r.otherMaterial}, ${r.otherKnowledge} |`),
    '',
  ];
  for (const r of score.rows) {
    lines.push(`## ${r.kind} · ${r.id.slice(0, 8)} ${r.artist} — ${r.title}`, '', `Planted as sentence ${r.index}, in place of: ${r.original}`, `Planted: ${r.text}`, `Status: ${r.status}`, `Other flags in this record: ${r.otherMaterial} material, ${r.otherKnowledge} knowledge.`, '');
    if (!r.result.ok) { lines.push(`Not audited: ${r.result.reason}.`, ''); continue; }
    for (const m of r.result.material) lines.push(`- material, ${m.sentence}${m.sentence === r.index ? ' (the planted one)' : ''}: ${m.quote}`, `  Contradiction: ${m.contradiction}`, `  Evidence: ${m.evidence}`);
    for (const k of r.result.knowledge) lines.push(`- knowledge, ${k.sentence}${k.sentence === r.index ? ' (the planted one, misfiled)' : ''}: ${k.quote}`, `  Contradiction: ${k.contradiction} (unverified)`);
    if (r.result.material.length + r.result.knowledge.length > 0) lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
