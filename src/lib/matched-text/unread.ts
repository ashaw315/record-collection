import type { MatchedTextChecks } from '@/lib/db/queries/matched-text';

/**
 * **The review of what Adam has not read (the coordinator, 22 Nov), a command and nothing more.** From unit two both
 * texts of a record arrive on import with nobody having read them, and the two drafting commands never show a stored text
 * again, so this file is the one path to them: each record with an unread ABOUT or matched text, both texts, which is
 * unread, and the mechanical checks beside the matched text (src/lib/matched-text/checks.ts), never a basis mark. Newest
 * first, as the query orders them, so the backlog stands behind a new import and not in front of it. His marks come back
 * in three forms, because his history is corrections, not rejections, and a rejection redrafts the same input to much
 * the same text (Design). Kept as a CLI that exists and is not put in front of Adam as a workflow (the coordinator,
 * 22 Nov, evening): the column's setter and the correction surface are §67's sheet, after unit two.
 */
export type UnreadRow = {
  id: string;
  artist: string;
  title: string;
  about: string | null;
  aboutUnreviewed: boolean;
  matched: string | null;
  matchedUnreviewed: boolean;
  checks: MatchedTextChecks | null;
  since: string;
};

export type ReviewMark =
  | { prefix: string; kind: 'both' | 'about' | 'matched'; action: 'read' }
  | { prefix: string; kind: 'about' | 'matched'; action: 'reject' }
  | { prefix: string; kind: 'about' | 'matched'; action: 'correct'; text: string };

export const MARK_FORMS = [
  '1611cb00                  both texts read, as they stand',
  '1611cb00 about            the ABOUT read; the matched text still unread',
  '1611cb00 matched          the matched text read; the ABOUT still unread',
  '1611cb00 about reject     the ABOUT deleted; the record is drafted again on the next pass',
  '1611cb00 matched reject   the matched text removed; the record leaves the pool until the next pass drafts it',
  '1611cb00 matched:         the corrected matched text on the lines that follow, to a blank line; stored as your edit, read',
  '1611cb00 about:           the corrected ABOUT likewise',
];

const checksLine = (c: MatchedTextChecks | null): string => {
  if (c === null) return 'checks: none';
  const parts: string[] = [];
  if (c.dropped.length > 0) parts.push(`${c.dropped.length} dropped (${c.dropped.join(' ')})`);
  if (c.disagreements.length > 0) parts.push(`${c.disagreements.length} disagreement${c.disagreements.length === 1 ? '' : 's'} (${c.disagreements.map((d) => `sentences ${d.a} and ${d.b}: ${d.why}`).join('; ')})`);
  if (c.numbered.length > 0) parts.push(`figures to check in sentence${c.numbered.length === 1 ? '' : 's'} ${c.numbered.join(', ')}`);
  return parts.length === 0 ? 'checks: none' : `checks: ${parts.join('; ')}`;
};

export function renderUnread(rows: readonly UnreadRow[], title: string, version: string): string {
  const lines = [
    `# ${title}`,
    '',
    `${rows.length} record(s) with a text you have not read, newest first. Rendered by ${version}.`,
    '',
    'Mark what you have read in a file of lines, then `npm run review:unread -- --store marks.txt`:',
    ...MARK_FORMS.map((f) => `    ${f}`),
    '',
  ];
  for (const r of rows) {
    lines.push(`## ${r.id.slice(0, 8)} ${r.artist} — ${r.title}`, `since ${r.since}`, '');
    if (r.about !== null) lines.push(`ABOUT, ${r.aboutUnreviewed ? 'unread' : 'read'}:`, r.about, '');
    else lines.push('ABOUT: none', '');
    if (r.matched !== null) lines.push(`MATCHED TEXT, ${r.matchedUnreviewed ? 'unread' : 'read'}:`, r.matched, '', checksLine(r.checks), '');
    else lines.push('MATCHED TEXT: none', '');
  }
  return `${lines.join('\n')}\n`;
}

/** The marks file read back; a line that is not a mark is ignored, a mark that cannot be acted on refuses by name. */
export function parseReviewMarks(text: string): ReviewMark[] {
  const lines = text.split('\n');
  const out: ReviewMark[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([0-9a-f]{8})\b\s*(about|matched)?\s*(reject|:)?\s*$/.exec(lines[i].trim());
    if (m === null) continue;
    const prefix = m[1];
    const kind = m[2] as 'about' | 'matched' | undefined;
    if (m[3] === undefined) { out.push({ prefix, kind: kind ?? 'both', action: 'read' }); continue; }
    if (kind === undefined) throw new Error(`${lines[i].trim()}: a rejection or a correction names no text: write "about" or "matched" after the id`);
    if (m[3] === 'reject') { out.push({ prefix, kind, action: 'reject' }); continue; }
    const body: string[] = [];
    for (i += 1; i < lines.length && lines[i].trim() !== ''; i += 1) body.push(lines[i].trimEnd());
    const corrected = body.join('\n').trim();
    if (corrected === '') throw new Error(`${prefix} ${kind}: has no corrected text on the lines that follow`);
    out.push({ prefix, kind, action: 'correct', text: corrected });
  }
  return out;
}
