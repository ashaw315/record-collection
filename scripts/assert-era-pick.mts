/*
  The model-pick step's assertion on production ("Release year to the pick" and "Year named for an era", Design, 21 Nov;
  the coordinator: the assertion is in the step, not a bench). The build's own askPick over production's pool, the
  request as the route sends it, nothing rewritten; reads only. For the era phrase: the verdict is an answer, not
  requirement-unmet; every answer's stored release year is 1980 to 1989; every reason names its record's year, which the
  pick's own check already holds; the reasons and their lengths are printed, and reasons hedging on evidence ("isn't
  confirmed", "not a confirmed", "not confirmed", "unconfirmed") counted. For the control phrase, which names no time, the
  years named are reported and nothing is required of them. Prints how many of the pool's records hold no year. Exits 1
  on a failed assertion.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/assert-era-pick.mts
    node --env-file=.env.local --conditions=react-server --import tsx scripts/assert-era-pick.mts "something from the nineties" 1990 1999
*/
import { askPick } from '@/lib/ask/pick';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
const [phraseArg, loArg, hiArg] = process.argv.slice(2);
const ERA = { phrase: phraseArg ?? 'something from the eighties', lo: Number(loArg ?? 1980), hi: Number(hiArg ?? 1989) };
const CONTROL = 'something for a rainy afternoon';
const HEDGE = /isn[’']t confirmed|not a confirmed|not confirmed|unconfirmed/i;
const records = await collectionTitles();
const pool = await matchedTextsFor(records.map((r) => r.id));
const name = new Map(records.map((r) => [r.id, `${r.artist} — ${r.title}`]));
const yearOf = new Map(pool.map((r) => [r.id, r.year]));
console.log(`pool: ${pool.length} records with matched text; ${pool.filter((r) => r.year === null).length} with no release year`);
let failed = 0;
const assert = (ok: boolean, what: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed += 1; };

async function press(phrase: string) {
  const started = performance.now();
  const result = await askPick(phrase, pool, []);
  const ms = Math.round(performance.now() - started);
  console.log(`\n"${phrase}": ${ms}ms, ${result.ok ? `verdict ${result.verdict}, ${result.picks.length} picked, ${result.dropped.length} dropped` : `FAILED: ${result.reason}`}`);
  if (!result.ok) return null;
  for (const p of result.picks) console.log(`  ${name.get(p.id) ?? p.id} (released ${yearOf.get(p.id) ?? 'unknown'}), ${[...p.reason].length} characters, ${p.claims.length} claim(s)\n    ${p.reason}`);
  for (const d of result.dropped) console.log(`  dropped ${name.get(d.id) ?? d.id}: ${d.why}`);
  return result;
}

const era = await press(ERA.phrase);
if (era !== null) {
  assert(era.verdict === 'answer', `the verdict is an answer, not ${era.verdict === 'answer' ? 'the unmet path' : era.verdict}`);
  const years = era.picks.map((p) => yearOf.get(p.id) ?? null);
  assert(years.every((y) => y !== null && y >= ERA.lo && y <= ERA.hi), `every answer's stored release year is ${ERA.lo} to ${ERA.hi}: ${years.join(', ')}`);
  const named = era.picks.map((p) => (p.reason.match(/\b(1[89]\d\d|20\d\d)\b/g) ?? []).map(Number));
  assert(named.every((ns, i) => ns.length > 0 && ns.every((n) => n === years[i])), `every reason names its record's release year: ${named.map((ns) => ns.join('/') || 'none').join(', ')}`);
  const hedges = era.picks.filter((p) => HEDGE.test(p.reason)).length;
  console.log(`  evidence hedges in the reasons: ${hedges}`);
}
const control = await press(CONTROL);
if (control !== null) {
  const named = control.picks.map((p) => (p.reason.match(/\b(1[89]\d\d|20\d\d)\b/g) ?? []).map(Number));
  console.log(`  years named with no time asked (nothing required): ${named.map((ns) => ns.join('/') || 'none').join(', ')}`);
}
console.log(`\n${failed === 0 ? 'ERA ASSERTION OK' : `ERA ASSERTION NOT OK: ${failed} failed`}`);
process.exit(failed === 0 ? 0 : 1);
