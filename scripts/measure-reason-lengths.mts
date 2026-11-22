/**
 * **The reason's length, measured (the coordinator, 19 Nov): a distribution for the bound's figure, not a figure inferred
 * from a layout approval.** Twenty phrases, each asked of the pick's own function against the 55 held drafts as the
 * pool, with no latch, no store and no database: the pool is `.matched/drafts.json`, the model and effort are the
 * pick's own (ASK_PICK_MODEL, ASK_PICK_EFFORT), and every reason that comes back is counted in characters. Twenty
 * calls at about the whole pool's text each.
 *
 *   npm run matched:reasons                 # the twenty calls; writes .matched/reason-lengths-<time>.json and prints the distribution
 *   npm run matched:reasons -- --phrases    # the phrases, no call
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { askPick, type PickRecordText } from '@/lib/ask/pick';

/* Twenty asks in the reader's terms of sound and occasion, as Adam asks: varied in tone, length and what they rule out. */
const PHRASES = [
  'something slow for tonight',
  'loud guitars for cleaning the flat',
  'quiet music with no vocals for reading',
  'a record for a dinner with friends that nobody has to talk over',
  'bright and fast for a sunny morning',
  'something sad to sit with',
  'jazz for late at night',
  'a long instrumental stretch I can get lost in',
  'warm and crackly, something old',
  'dense and strange, for paying attention',
  'something to dance to in the kitchen',
  'soft voices and acoustic guitars',
  'big orchestral sweep',
  'a record that gets heavier as it goes',
  'music for a grey afternoon',
  'funky and tight, nothing abrasive',
  'a side I can put on and not touch',
  'rough, live-sounding rock',
  'gentle enough for a child falling asleep',
  'something that starts quiet and ends loud',
];

const args = process.argv.slice(2);
if (args.includes('--phrases')) {
  for (const p of PHRASES) process.stdout.write(`${p}\n`);
  process.stdout.write(`${PHRASES.length} phrases; no call made\n`);
  process.exit(0);
}

type Draft = { id: string; artist: string; title: string; year: number | null; text: string | null };
const drafts: Draft[] = JSON.parse(readFileSync(join(process.cwd(), '.matched', 'drafts.json'), 'utf8'));
const pool: PickRecordText[] = drafts.filter((d) => d.text !== null).map((d) => ({ id: d.id, text: d.text as string, year: d.year ?? null }));

type Row = { phrase: string; verdict: string; reasons: Array<{ id: string; chars: number; reason: string }>; failed?: string };
const rows: Row[] = [];
/* --sample <n> (the coordinator, 19 Nov): the first n phrases, for a timing that needs several presses, not twenty. */
const sampleAt = args.indexOf('--sample');
const asked = sampleAt === -1 ? PHRASES : PHRASES.slice(0, Number(args[sampleAt + 1]) || PHRASES.length);
/* Each ask's milliseconds (19 Nov): the model call as the route makes it, the pool's text and all; the latency Adam feels is this plus the route's reads and the client's draw. */
const times: Array<{ phrase: string; ms: number }> = [];
for (const phrase of asked) {
  const t0 = Date.now();
  const result = await askPick(phrase, pool, []);
  times.push({ phrase, ms: Date.now() - t0 });
  if (!result.ok) { rows.push({ phrase, verdict: 'failed', reasons: [], failed: result.reason }); console.log(`${phrase}: FAILED, ${result.reason}, ${times.at(-1)?.ms}ms`); continue; }
  const reasons = result.picks.map((p) => ({ id: p.id.slice(0, 8), chars: [...p.reason].length, reason: p.reason }));
  rows.push({ phrase, verdict: result.verdict, reasons });
  console.log(`${phrase}: ${result.verdict}, ${reasons.length} reason(s), ${reasons.map((r) => r.chars).join(', ')} chars`);
}

const lengths = rows.flatMap((r) => r.reasons.map((x) => x.chars)).sort((a, b) => a - b);
const at = (q: number) => lengths[Math.min(lengths.length - 1, Math.floor(q * lengths.length))];
const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
const out = join(process.cwd(), '.matched', `reason-lengths-${stamp}Z.json`);
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: process.env.ASK_PICK_MODEL ?? 'default', effort: process.env.ASK_PICK_EFFORT ?? 'default', pool: pool.length, phrases: asked.length, lengths, rows, times }, null, 2));
const over = (n: number) => lengths.filter((l) => l > n).length;
const sortedMs = times.map((t) => t.ms).sort((a, b) => a - b);
const slowest = times.reduce((s, t) => (t.ms > s.ms ? t : s), times[0]);
console.log(`measure-reason-lengths: ${rows.length} phrases, ${rows.filter((r) => r.failed).length} failed, ${lengths.length} reasons; min ${lengths[0]}, p10 ${at(0.1)}, median ${at(0.5)}, p90 ${at(0.9)}, max ${lengths[lengths.length - 1]}; over 108: ${over(108)}, over 120: ${over(120)}, over 140: ${over(140)}, over 160: ${over(160)}; written ${out}`);
console.log(`each ask's model call: min ${sortedMs[0]}ms, median ${sortedMs[Math.floor(sortedMs.length / 2)]}ms, max ${sortedMs[sortedMs.length - 1]}ms, the slowest "${slowest.phrase}"; the pool ${pool.length} records of text, effort ${process.env.ASK_PICK_EFFORT || 'low (the default)'}`);
process.exit(0);
