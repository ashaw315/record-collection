/**
 * **The matched-text review file (step 3, unit 4; the coordinator, 14 Nov).** What Adam reads before he marks a draft
 * to store. Every sentence carries its basis, so the inferred, resting on the model's own knowledge, are read hardest:
 * that is where a famous record gets described from reputation rather than from the material. What was not known is
 * listed, never filled. The ABOUT is shown as the context it was given as. The marks live here, not in the schema.
 */
export type ReviewDraft = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  about: string | null;
  status: string;
  sentences: Array<{ text: string; basis: 'supported' | 'inferred' }>;
  unknown: string[];
  /** Set where a record is drafted at more than one effort (the coordinator, 15 Nov): each draft is shown under it. */
  effort?: string;
  /** Distinct names in the release and track credits (17 Nov): a people-count above it cannot be from the credits. */
  credited?: number;
  /** Sentences the client dropped for describing the material rather than the record (17 Nov). */
  dropped?: string[];
};

/*
  A sentence with a number to check (17 Nov). The first detector fired on any number word, 126 of 440 sentences, nearly
  all "one voice", "two guitars", "four-piece", while the prompt's rule held on all 55. What the rule forbids is a figure
  the material does not give: a duration or tempo, a bare figure, or a people-count the credits cannot cover. A quoted
  title is not a figure ("Born 2"), nor is a side's name, nor a count the credited names can make up.
*/
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
const WORD = Object.keys(WORDS).join('|');
/* "second" alone is an ordinal ("placed second", "a second guitarist"); only a counted second, or seconds, is a duration. */
const UNIT = new RegExp(`\\b(\\d+|${WORD})[- ](minutes?|seconds?|hours?|bpm|beats)\\b|\\b(minutes?|seconds|hours?|bpm)\\b`, 'i');
const ENSEMBLE = new RegExp(`\\b(\\d+|${WORD})[- ](piece|man|men|members?|musicians?|players?|singers?|voices?|drummers?|guitarists?|percussionists?|horns|strings|strong)\\b`, 'gi');
/* A quoted title is not a figure; a single-quoted one opens after a space, which an apostrophe inside a word never does. */
const unquoted = (text: string) => text.replace(/"[^"]*"|“[^”]*”|(^|\s)'[^']*'(?=[\s,.;:]|$)/g, '$1""');
function needsChecking(text: string, credited: number): boolean {
  const t = unquoted(text);
  if (UNIT.test(t) || /\d/.test(t)) return true;
  for (const m of t.matchAll(ENSEMBLE)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
    if (n > credited) return true;
  }
  return false;
}

export function renderReview(drafts: readonly ReviewDraft[], title: string): string {
  const lines = [
    `# ${title}`,
    '',
    `${drafts.length} record(s). Each sentence is marked [supported], resting on the Discogs material the model was given, or [inferred], resting on its own knowledge of the record: read the inferred hardest. To store a draft, put its id (the eight characters in backticks) in a file, one per line, and run the store.`,
    '',
  ];
  /* A record's drafts together under one heading, in the order given; each under its effort where it has one. */
  const ids = [...new Set(drafts.map((d) => d.id))];
  for (const id of ids) {
    const own = drafts.filter((d) => d.id === id);
    const d = own[0];
    lines.push(`## ${d.artist} — ${d.title}${d.year === null ? '' : ` (${d.year})`}  \`${d.id.slice(0, 8)}\``, '');
    lines.push(`ABOUT, given as context only: ${d.about ?? 'none'}`, '');
    for (const v of own) {
      if (v.effort !== undefined) lines.push(`At ${v.effort}: to store this one, mark it \`${d.id.slice(0, 8)} ${v.effort}\`.`, '');
      if (v.sentences.length === 0) {
        lines.push(`No draft: ${v.status}`, '');
        continue;
      }
      for (const s of v.sentences) lines.push(`- [${s.basis}] ${s.text}`);
      lines.push('');
      if (v.unknown.length > 0) lines.push(`Not known: ${v.unknown.join('; ')}`, '');
      /* Each draft's own figures (15 Nov), so the rerun's ratio and length are read here rather than recounted. */
      const supported = v.sentences.filter((x) => x.basis === 'supported').length;
      const chars = v.sentences.map((x) => x.text).join(' ').length;
      lines.push(`${v.sentences.length} sentences, ${chars} characters; ${supported} supported, ${v.sentences.length - supported} inferred.`, '');
      const numbered = v.sentences.filter((x) => needsChecking(x.text, v.credited ?? 0));
      lines.push(numbered.length === 0 ? 'Numbers to check: none' : [`Numbers to check: ${numbered.length}`, ...numbered.map((x) => `- ${x.text}`)].join('\n'), '');
      if (v.dropped !== undefined && v.dropped.length > 0) lines.push([`Dropped, for describing the material rather than the record: ${v.dropped.length}`, ...v.dropped.map((x) => `- ${x}`)].join('\n'), '');
    }
  }
  return `${lines.join('\n')}\n`;
}

/** A record read back from a review file: everything the store needs but the full id, which the file does not carry. */
export type ParsedReview = { prefix: string; artist: string; title: string; year: number | null; about: string | null; sentences: Array<{ text: string; basis: 'supported' | 'inferred' }>; unknown: string[] };

/*
  The review file read back (17 Nov): the inverse of renderReview, for the 52 drafts that survived only there. Each
  record's figures line is checked against what was read under it, and a record without one, or whose counts disagree,
  is refused rather than rebuilt with less than the file says it holds.
*/
export function parseReview(text: string): ParsedReview[] {
  const out: ParsedReview[] = [];
  const blocks = text.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const head = /^(.*) — (.*?)(?: \((\d{4})\))?  `([0-9a-f]{8})`\s*$/.exec(lines[0]);
    if (head === null) throw new Error(`parseReview: a heading could not be read: ${lines[0]}`);
    const [, artist, title, year, prefix] = head;
    const body = lines.slice(1).join('\n');
    const aboutAt = body.indexOf('ABOUT, given as context only: ');
    const firstSentence = body.search(/^- \[(supported|inferred)\] /m);
    const aboutRaw = aboutAt === -1 || firstSentence === -1 ? '' : body.slice(aboutAt + 'ABOUT, given as context only: '.length, firstSentence).trim();
    const sentences = [...body.matchAll(/^- \[(supported|inferred)\] (.*)$/gm)].map((m) => ({ text: m[2], basis: m[1] as 'supported' | 'inferred' }));
    const unknownLine = /^Not known: (.*)$/m.exec(body);
    const figures = /^(\d+) sentences, (\d+) characters; (\d+) supported, (\d+) inferred\.$/m.exec(body);
    if (figures === null) throw new Error(`parseReview: ${prefix} has no figures line`);
    const supported = sentences.filter((x) => x.basis === 'supported').length;
    if (Number(figures[1]) !== sentences.length || Number(figures[3]) !== supported) throw new Error(`parseReview: ${prefix}: figures line says ${figures[1]} sentences, ${sentences.length} read; ${figures[3]} supported, ${supported} read`);
    out.push({ prefix, artist, title, year: year === undefined ? null : Number(year), about: aboutRaw === 'none' ? null : aboutRaw, sentences, unknown: unknownLine === null ? [] : unknownLine[1].split('; ') });
  }
  return out;
}

/** What the importer writes for a parsed record, joined to its database row by prefix; the row's full id and fields, the file's sentences. */
export type RebuiltDraft = { id: string; artist: string; title: string; year: number | null; about: string | null; status: 'finished'; sentences: ParsedReview['sentences']; unknown: string[]; text: string };

export function rebuildDrafts(parsed: readonly ParsedReview[], rows: readonly { id: string; artist: string; title: string; year: number | null; about: string | null }[]): { imported: RebuiltDraft[]; refused: string[] } {
  const byPrefix = new Map(rows.map((r) => [r.id.slice(0, 8), r]));
  const imported: RebuiltDraft[] = [];
  const refused: string[] = [];
  for (const r of parsed) {
    const row = byPrefix.get(r.prefix);
    if (row === undefined) { refused.push(`${r.prefix}: no record in the database without stored matched text`); continue; }
    const differs = (['artist', 'title', 'year', 'about'] as const).filter((f) => row[f] !== r[f]);
    if (differs.length > 0) { refused.push(`${r.prefix}: the file’s ${differs.join(', ')} differ from the database’s`); continue; }
    imported.push({ id: row.id, artist: row.artist, title: row.title, year: row.year, about: row.about, status: 'finished', sentences: r.sentences, unknown: r.unknown, text: r.sentences.map((x) => x.text).join(' ') });
  }
  return { imported, refused };
}

