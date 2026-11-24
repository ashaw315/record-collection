/** Prints the four known-error records' numbered wrong sentences from the capture fixture, to check Q74's numbering (24 Nov). Read-only. */
import { readFileSync } from 'node:fs';
import { sentencesOf } from '@/lib/text/sentences';

const rows = JSON.parse(readFileSync('test/fixtures/sheet-four-known-errors.json', 'utf8')) as Array<{ prefix: string; wrongSentence: number; text: string }>;
for (const r of rows) {
  const s = sentencesOf(r.text);
  process.stdout.write(`${r.prefix} sentence ${r.wrongSentence} of ${s.length}: ${s[r.wrongSentence - 1]}\n`);
}
