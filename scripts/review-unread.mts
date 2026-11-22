/**
 * **What Adam has not read, as one review file; his marks back in three forms (the coordinator, 22 Nov).**
 *
 *   npm run review:unread                      # the file: every record with an unread ABOUT or matched text, both texts,
 *                                              # which is unread, the mechanical checks; newest first; to ~/Downloads
 *   npm run review:unread -- --store marks.txt # his marks applied: read, corrected (stored as his edit) or rejected
 *
 * From unit two both texts of a record arrive on import with nobody having read them, and the two drafting commands
 * select records with no stored text, so a stored text never appears in a review file again. This is the path to them.
 * The mark forms are at the file's head (src/lib/matched-text/unread.ts). Production writes happen only under --store,
 * on Adam's marks, through the tested queries and no other path. A command that exists and is not a workflow put in
 * front of Adam (the coordinator, 22 Nov, evening): the column's setter and the correction surface are §67's sheet.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { markMatchedTextReviewed, rejectMatchedText, unreviewedTexts } from '@/lib/db/queries/matched-text';
import { deleteSnippet, editSnippet, markSnippetReviewed } from '@/lib/db/queries/snippet';
import { parseReviewMarks, renderUnread } from '@/lib/matched-text/unread';

const args = process.argv.slice(2);
const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8' }).trim();
const VERSION = `review-unread at ${sh('git rev-parse --short HEAD')}${sh('git status --porcelain -- src scripts') === '' ? '' : ' with uncommitted changes'}, ${new Date().toISOString().slice(0, 16)}Z`;
const rows = await unreviewedTexts();

if (args.includes('--store')) {
  const file = args[args.indexOf('--store') + 1];
  if (file === undefined) throw new Error('review-unread: --store wants the marks file');
  const marks = parseReviewMarks(readFileSync(file, 'utf8'));
  let applied = 0;
  const refused: string[] = [];
  for (const mark of marks) {
    const row = rows.find((r) => r.id.startsWith(mark.prefix));
    if (row === undefined) { refused.push(`${mark.prefix}: no record with an unread text has this id`); continue; }
    const name = `${row.artist} — ${row.title}`;
    const wantAbout = mark.kind !== 'matched';
    const wantMatched = mark.kind !== 'about';
    if (mark.action === 'read') {
      if (wantAbout && row.aboutUnreviewed) { await markSnippetReviewed(row.id); applied += 1; console.log(`${mark.prefix}: ABOUT read (${name})`); }
      if (wantMatched && row.matchedUnreviewed) { await markMatchedTextReviewed(row.id); applied += 1; console.log(`${mark.prefix}: matched text read (${name})`); }
      if ((wantAbout && !row.aboutUnreviewed && mark.kind === 'about') || (wantMatched && !row.matchedUnreviewed && mark.kind === 'matched')) refused.push(`${mark.prefix} ${mark.kind}: that text is not unread`);
      continue;
    }
    if (mark.kind === 'about' && !row.aboutUnreviewed) { refused.push(`${mark.prefix} about: no unread ABOUT to ${mark.action}`); continue; }
    if (mark.kind === 'matched' && !row.matchedUnreviewed) { refused.push(`${mark.prefix} matched: no unread matched text to ${mark.action}`); continue; }
    if (mark.action === 'reject') {
      const r = mark.kind === 'about' ? await deleteSnippet(row.id) : await rejectMatchedText(row.id);
      if (!r.ok) { refused.push(`${mark.prefix} ${mark.kind}: ${r.reason}`); continue; }
      applied += 1;
      console.log(`${mark.prefix}: ${mark.kind === 'about' ? 'ABOUT deleted' : 'matched text removed, the record out of the pool until the next pass'} (${name})`);
      continue;
    }
    const r = mark.kind === 'about' ? await editSnippet(row.id, mark.text) : await markMatchedTextReviewed(row.id, { text: mark.text });
    if (!r.ok) { refused.push(`${mark.prefix} ${mark.kind}: ${r.reason}`); continue; }
    applied += 1;
    console.log(`${mark.prefix}: ${mark.kind === 'about' ? 'ABOUT' : 'matched text'} corrected and read, stored as your edit (${name})`);
  }
  for (const line of refused) console.log(`refused ${line}`);
  console.log(`review-unread: ${marks.length} mark(s), ${applied} applied, ${refused.length} refused; ${(await unreviewedTexts()).length} record(s) still carry an unread text`);
  process.exit(refused.length === 0 ? 0 : 1);
}

const stamp = new Date().toISOString().slice(0, 10);
const text = renderUnread(rows, `Unread texts, ${stamp}`, VERSION);
const WORK = join(process.cwd(), '.matched');
mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, 'unread.md'), text);
const out = join(homedir(), 'Downloads', `unread-${stamp}.md`);
writeFileSync(out, text);
const abouts = rows.filter((r) => r.aboutUnreviewed).length;
const matched = rows.filter((r) => r.matchedUnreviewed).length;
console.log(`review-unread: ${rows.length} record(s) with an unread text (${abouts} ABOUTs, ${matched} matched texts) written to ${out}`);
process.exit(0);
