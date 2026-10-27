#!/usr/bin/env node
/**
 * **Code's half of WITHDRAWALS.md: an entry's Build clause, by entry id.**
 *
 *     node scripts/build-clause.mjs <entry id> "<clause, ending in a full stop>"
 *     node scripts/build-clause.mjs --file <path> <entry id> "<clause>"
 *
 * Design writes entries; Code writes and corrects their Build clauses and
 * derives the comment (the coordinator, 27 Oct). This edits the bullet only,
 * replacing a `Build: …` clause that is there or appending one, and then
 * derives the machine-readable comment from the bullets, so the two agree.
 *
 * It replaces an ad-hoc edit whose guard was wrong: after a derive every
 * clause stands twice, in the bullet and in the comment, and a guard that
 * demanded exactly one match refused every legitimate edit made after a
 * derive. On 27 Oct that refusal went unnoticed in a chain that was not
 * stopped by it, and 1d69cb0's message claimed edits it did not carry.
 *
 * Loud on anything it cannot do: an id the file does not hold, or one it
 * holds twice, or a clause that does not finish a sentence, exits 1 and
 * writes nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deriveInto } from './withdrawals.mjs';

const args = process.argv.slice(2);
let file = 'docs/design/WITHDRAWALS.md';
if (args[0] === '--file') {
  file = args[1];
  args.splice(0, 2);
}
const [id, clause] = args;
if (id === undefined || clause === undefined) {
  console.error('usage: node scripts/build-clause.mjs [--file <path>] <entry id> "<clause>"');
  process.exit(1);
}
if (!/[.!?]$/.test(clause.trim())) {
  console.error(`the clause must end a sentence, since the "> quote" line follows the description: ${JSON.stringify(clause)}`);
  process.exit(1);
}

const COMMENT_MARKER = '<!-- machine-readable:';
const source = readFileSync(file, 'utf8');
const at = source.indexOf(COMMENT_MARKER);
const bullets = at === -1 ? source : source.slice(0, at);
const comment = at === -1 ? '' : source.slice(at);

const lines = bullets.split('\n');
const opening = `- **\`${id}\`**:`;
const hits = lines.map((line, i) => (line.startsWith(opening) ? i : -1)).filter((i) => i !== -1);
if (hits.length !== 1) {
  console.error(hits.length === 0 ? `no entry ${id} in ${file}` : `entry ${id} stands ${hits.length} times in ${file}`);
  process.exit(1);
}
const line = lines[hits[0]];
const clauseText = `Build: ${clause.trim()}`;
const existing = line.indexOf(' Build: ');
lines[hits[0]] = existing === -1 ? `${line} ${clauseText}` : `${line.slice(0, existing)} ${clauseText}`;

writeFileSync(file, lines.join('\n') + comment);
const derived = deriveInto(file);
console.log(`${id}: Build clause ${existing === -1 ? 'added' : 'replaced'}; comment ${derived.changed ? 'rewritten' : 'unchanged'} (${derived.entries} entries)`);
